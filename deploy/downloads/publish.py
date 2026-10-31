#!/usr/bin/env python3
"""Publish one approved Windows installer; never reads bot state or credentials."""
import argparse
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import tempfile

ROOT = Path('/var/opt/rafiq-downloads')
INCOMING = Path('/var/cache/rafiq-downloads/incoming')
OFF = dict(available=False, version=None, url=None, sha256=None, sizeBytes=None)
VERSION = re.compile(r'[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}')
SHA256 = re.compile(r'[a-fA-F0-9]{64}')
MAX_BYTES = 512 * 1024 * 1024


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def atomic_json(path, value, mode=0o600):
    fd, temporary = tempfile.mkstemp(prefix='.next-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            os.fchmod(stream.fileno(), mode)
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def copy_verified(source, target, expected, mode):
    if target.is_symlink():
        raise ValueError('Symlink destinations are not permitted')
    if target.exists():
        if digest(target) != expected:
            raise ValueError('This version already has different bytes; use a new version')
        return
    fd, temporary = tempfile.mkstemp(prefix='.next-', dir=target.parent)
    try:
        with os.fdopen(fd, 'wb') as output, source.open('rb') as stream:
            os.fchmod(output.fileno(), mode)
            shutil.copyfileobj(stream, output, 1024 * 1024)
            output.flush()
            os.fsync(output.fileno())
        if digest(Path(temporary)) != expected:
            raise ValueError('Installer changed during copying')
        os.replace(temporary, target)
    finally:
        Path(temporary).unlink(missing_ok=True)


def inspect_installer(path, version, expected):
    if not VERSION.fullmatch(version) or not SHA256.fullmatch(expected):
        raise ValueError('Use version X.Y.Z and the reviewed SHA-256')
    if path.is_symlink() or not path.is_file() or path.name != f'Rafiq-Setup-{version}.exe':
        raise ValueError('Only the canonical user installer is accepted')
    size = path.stat().st_size
    if not 128 <= size <= MAX_BYTES:
        raise ValueError('Unexpected installer size')
    with path.open('rb') as stream:
        header = stream.read(64)
        offset = struct.unpack_from('<I', header, 60)[0]
        if header[:2] != b'MZ' or not 64 <= offset <= min(size - 4, 1024 * 1024):
            raise ValueError('Installer is not a Windows PE executable')
        stream.seek(offset)
        if stream.read(4) != b'PE\0\0':
            raise ValueError('Installer has no PE signature')
    actual = digest(path)
    if actual != expected.lower():
        raise ValueError('SHA-256 differs from the reviewed release')
    return dict(available=True, version=version, url=f'/downloads/{path.name}', sha256=actual, sizeBytes=size)


class Publisher:
    def __init__(self, root=ROOT, incoming=INCOMING):
        self.root, self.incoming = Path(root), Path(incoming)
        self.public = self.root / 'public'
        self.downloads = self.public / 'downloads'
        self.releases = self.root / 'releases'
        self.pointer = self.public / 'release.json'

    def initialize(self):
        for directory, mode in [(self.root, 0o755), (self.public, 0o755), (self.downloads, 0o755), (self.releases, 0o700), (self.incoming, 0o700)]:
            if directory.is_symlink():
                raise ValueError('Symlink directories are not permitted')
            directory.mkdir(parents=True, exist_ok=True)
            directory.chmod(mode)
        if self.pointer.is_symlink():
            raise ValueError('Symlink metadata is not permitted')
        if not self.pointer.exists():
            atomic_json(self.pointer, OFF, 0o644)

    @contextlib.contextmanager
    def locked(self):
        self.initialize()
        with (self.root / '.publish.lock').open('a') as lock:
            os.fchmod(lock.fileno(), 0o600)
            fcntl.flock(lock, fcntl.LOCK_EX)
            yield

    def verify(self, file, version, expected):
        candidate = Path(file)
        # Uploads remain private until an explicit publish operation succeeds.
        if candidate.is_symlink() or not candidate.resolve(strict=True).is_relative_to(self.incoming.resolve(strict=True)):
            raise ValueError('Installer must be uploaded to the private incoming directory')
        return inspect_installer(candidate, version, expected)

    def publish(self, file, version, expected):
        with self.locked():
            release = self.verify(file, version, expected)
            directory = self.releases / version
            if directory.is_symlink():
                raise ValueError('Symlink releases are not permitted')
            directory.mkdir(mode=0o700, exist_ok=True)
            archive = directory / Path(release['url']).name
            manifest = directory / 'release.json'
            if manifest.exists() and json.loads(manifest.read_text()) != release:
                raise ValueError('Published version metadata is immutable; use a new version')
            copy_verified(Path(file), archive, release['sha256'], 0o600)
            atomic_json(manifest, release)
            return self._activate(release, archive)

    def _activate(self, release, archive):
        inspected = inspect_installer(archive, release['version'], release['sha256'])
        if inspected != release:
            raise ValueError('Archived release does not match its metadata')
        copy_verified(archive, self.downloads / archive.name, release['sha256'], 0o644)
        old = json.loads(self.pointer.read_text())
        if old != release:
            atomic_json(self.root / 'previous.json', old)
            atomic_json(self.pointer, release, 0o644)
        return release

    def activate(self, version):
        if not VERSION.fullmatch(version):
            raise ValueError('Use a version X.Y.Z')
        with self.locked():
            directory = self.releases / version
            if directory.is_symlink():
                raise ValueError('Symlink releases are not permitted')
            release = json.loads((directory / 'release.json').read_text())
            if release.get('version') != version:
                raise ValueError('Archived version mismatch')
            return self._activate(release, directory / f'Rafiq-Setup-{version}.exe')

    def disable(self):
        with self.locked():
            files = []
            for public_file in self.downloads.iterdir():
                match = re.fullmatch(r'Rafiq-Setup-([0-9]+\.[0-9]+\.[0-9]+)\.exe', public_file.name)
                if public_file.is_symlink() or not match or not public_file.is_file():
                    raise ValueError('Unexpected public download; review before disabling')
                archive = self.releases / match[1] / public_file.name
                if not archive.is_file() or digest(archive) != digest(public_file):
                    raise ValueError('Private rollback copy is missing or differs')
                files.append(public_file)
            old = json.loads(self.pointer.read_text())
            if old != OFF:
                atomic_json(self.root / 'previous.json', old)
                atomic_json(self.pointer, OFF, 0o644)
            for public_file in files:
                public_file.unlink()
            return dict(OFF)

    def status(self):
        return json.loads(self.pointer.read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='operation', required=True)
    for operation in ['verify', 'publish']:
        command = sub.add_parser(operation)
        command.add_argument('--file', required=True)
        command.add_argument('--version', required=True)
        command.add_argument('--sha256', required=True)
    activate = sub.add_parser('activate')
    activate.add_argument('--version', required=True)
    for operation in ['init', 'status', 'disable']:
        sub.add_parser(operation)
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error('Use the existing administrator SSH connection')
    publisher = Publisher()
    try:
        publisher.initialize()
        if args.operation in ['verify', 'publish']:
            result = getattr(publisher, args.operation)(args.file, args.version, args.sha256)
            if args.operation == 'verify':
                result = dict(verified=True, published=False, candidate=result)
        elif args.operation == 'activate':
            result = publisher.activate(args.version)
        elif args.operation == 'disable':
            result = publisher.disable()
        else:
            result = publisher.status()
        print(json.dumps(result, ensure_ascii=False))
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, 'Download release failed: ' + str(error) + '\n')


if __name__ == '__main__':
    main()
