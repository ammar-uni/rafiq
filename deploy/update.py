#!/usr/bin/python3
"""Root-owned updater; installs only main commits passing the named GitHub CI.

No repository code runs as root. Build/test account cannot read bot secrets/state.
Updater/service changes themselves require an explicit administrator installation.
"""
import fcntl
import json
import os
from pathlib import Path, PurePosixPath
import pwd
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request

REPO = 'ammar-uni/rafiq'
BASE = Path('/opt/rafiq')
RELEASES = BASE / 'releases'
META = Path('/var/lib/rafiq-deploy')
STATUS = Path('/run/rafiq/status.json')
SCHEMA = '2'


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def request(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Rafiq-updater',
        'Accept': 'application/vnd.github+json'})
    return urllib.request.urlopen(req, timeout=45)


def api(path):
    with request('https://api.github.com/repos/' + REPO + path) as response:
        return json.load(response)


def approved_commit(runs, commit):
    matching = [item for item in runs if item['head_sha'] == commit and item['head_branch'] == 'main'
                and item['event'] == 'push']
    latest = max(matching, key=lambda item: item['run_number'], default=None)
    return latest is not None and latest['status'] == 'completed' and latest['conclusion'] == 'success'


def safe_extract(archive, destination):
    with tarfile.open(archive, 'r:gz') as source:
        members = source.getmembers()
        if len(members) > 5000 or sum(m.size for m in members) > 250_000_000:
            raise ValueError('Release archive is too large')
        roots = set()
        for member in members:
            path = PurePosixPath(member.name)
            if path.is_absolute() or '..' in path.parts or not path.parts:
                raise ValueError('Unsafe archive path')
            roots.add(path.parts[0])
            if not (member.isdir() or member.isfile()):
                raise ValueError('Archive links/devices are not allowed')
            if member.isfile() and len(path.parts) < 2:
                raise ValueError('Missing archive root directory')
        if len(roots) != 1:
            raise ValueError('Expected one archive root')
        for member in members:
            parts = PurePosixPath(member.name).parts[1:]
            if not parts:
                continue
            target = destination.joinpath(*parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True, mode=0o755)
            else:
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
                with source.extractfile(member) as src, target.open('xb') as dst:
                    shutil.copyfileobj(src, dst)
                target.chmod(0o755 if member.mode & 0o111 else 0o644)


def build(directory):
    account = pwd.getpwnam('rafiq-build')
    for root, dirs, files in os.walk(directory):
        os.chown(root, account.pw_uid, account.pw_gid)
        for name in files:
            os.chown(Path(root) / name, account.pw_uid, account.pw_gid)
    common = ['systemd-run', '--quiet', '--wait', '--pipe', '--collect',
        '--uid=rafiq-build', '--gid=rafiq-build', '--working-directory=' + str(directory),
        '--property=ProtectSystem=strict', '--property=ProtectHome=yes',
        '--property=PrivateTmp=yes', '--property=NoNewPrivileges=yes',
        '--property=InaccessiblePaths=/etc/rafiq /var/lib/rafiq',
        '--property=ReadWritePaths=' + str(directory) + ' /var/cache/rafiq-build',
        '--property=MemoryMax=2G', '--property=TasksMax=128',
        '--property=RuntimeMaxSec=600', '--setenv=HOME=/var/cache/rafiq-build',
        '--setenv=PATH=/usr/local/bin:/usr/bin:/bin']
    run(*common, '/usr/local/bin/npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund')
    run(*common, '--property=PrivateNetwork=yes', '/usr/local/bin/npm', 'run', 'check')
    run(*common, '--property=PrivateNetwork=yes', '/usr/bin/python3', '-m', 'unittest',
        'discover', '-s', 'deploy', '-p', 'test_*.py')
    for root, dirs, files in os.walk(directory, followlinks=False):
        os.chown(root, 0, 0)
        os.chmod(root, 0o755)
        for name in files:
            path = Path(root) / name
            os.chown(path, 0, 0, follow_symlinks=False)
            if not path.is_symlink():
                path.chmod(0o755 if path.stat().st_mode & 0o111 else 0o644)


def point_to(directory):
    temporary = BASE / '.current-next'
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(directory)
    temporary.replace(BASE / 'current')


def healthy():
    try:
        status = json.loads(STATUS.read_text())
        age = time.time() * 1000 - status['lastHeartbeat']
        return status.get('state') == 'ready' and status.get('ready') is True and 0 <= age < 20000
    except (OSError, ValueError, KeyError, TypeError):
        return False


def wait_ready():
    deadline = time.monotonic() + 100
    while time.monotonic() < deadline:
        if healthy():
            return True
        time.sleep(3)
    return False


def main():
    META.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (META / 'update.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        commit = api('/commits/main')['sha']
        if not re.fullmatch('[a-f0-9]{40}', commit):
            raise ValueError('Invalid commit identifier')
        current = (BASE / 'current').resolve(strict=True)
        if current.name == commit:
            print('Already running ' + commit, flush=True)
            return
        if (META / ('failed-' + commit)).exists():
            raise RuntimeError('This commit previously failed; operator review required: ' + commit)
        runs = api('/actions/workflows/check.yml/runs?branch=main&event=push&head_sha=' + commit)['workflow_runs']
        if not approved_commit(runs, commit):
            print('Waiting for successful GitHub checks: ' + commit, flush=True)
            return
        RELEASES.mkdir(parents=True, exist_ok=True)
        destination = RELEASES / commit
        if destination.exists():
            raise RuntimeError('Unactivated release directory exists; operator review required')
        staging = Path(tempfile.mkdtemp(prefix='.stage-', dir=RELEASES))
        staging.chmod(0o755)
        stopped = False
        try:
            archive = staging / 'source.tar.gz'
            with request('https://codeload.github.com/' + REPO + '/tar.gz/' + commit) as src, archive.open('wb') as dst:
                received = 0
                while chunk := src.read(1024 * 1024):
                    received += len(chunk)
                    if received > 50_000_000:
                        raise ValueError('Download exceeds limit')
                    dst.write(chunk)
            code = staging / 'code'
            code.mkdir()
            safe_extract(archive, code)
            if (code / 'deploy/schema-version').read_text().strip() != SCHEMA:
                raise RuntimeError('Storage migration needs operator review; running bot unchanged')
            build(code)
            code.rename(destination)
            stopped = True
            run('systemctl', 'stop', 'rafiq.service')
            point_to(destination)
            run('systemctl', 'reset-failed', 'rafiq.service')
            run('systemctl', 'start', 'rafiq-register.service')
            run('systemctl', 'start', 'rafiq.service')
            if not wait_ready():
                raise RuntimeError('New version did not become ready')
            (META / 'previous-release').write_text(str(current) + '\n')
            print('Deployed and gateway verified: ' + commit, flush=True)
        except Exception:
            (META / ('failed-' + commit)).touch()
            if stopped:
                run('systemctl', 'stop', 'rafiq.service')
                point_to(current)
                run('systemctl', 'reset-failed', 'rafiq.service')
                try:
                    run('systemctl', 'start', 'rafiq-register.service')
                finally:
                    run('systemctl', 'start', 'rafiq.service')
                print('Rollback ready: ' + str(wait_ready()), flush=True)
            raise
        finally:
            shutil.rmtree(staging)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Update stopped: ' + str(error), file=sys.stderr)
        sys.exit(1)
