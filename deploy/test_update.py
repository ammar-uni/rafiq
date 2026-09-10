import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('updater', Path(__file__).with_name('update.py'))
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)


class UpdateTests(unittest.TestCase):
    def archive(self, name='repo/package.json', kind=tarfile.REGTYPE):
        data = io.BytesIO()
        with tarfile.open(fileobj=data, mode='w:gz') as out:
            item = tarfile.TarInfo(name)
            item.type = kind
            if kind == tarfile.REGTYPE:
                item.size = 2
                out.addfile(item, io.BytesIO(b'{}'))
            else:
                item.linkname = '/etc/rafiq/rafiq.env'
                out.addfile(item)
        data.seek(0)
        return data

    def test_safe_release_extracts(self):
        with tempfile.TemporaryDirectory() as temp:
            src = Path(temp) / 'release.tgz'
            src.write_bytes(self.archive().read())
            target = Path(temp) / 'code'
            updater.safe_extract(src, target)
            self.assertEqual((target / 'package.json').read_text(), '{}')

    def test_rejects_traversal_absolute_links_and_devices(self):
        for name, kind in [('../outside', tarfile.REGTYPE), ('repo/../../outside', tarfile.REGTYPE),
                           ('/tmp/outside', tarfile.REGTYPE), ('repo/link', tarfile.SYMTYPE),
                           ('repo/link', tarfile.LNKTYPE), ('repo/device', tarfile.CHRTYPE)]:
            with self.subTest(name=name, kind=kind), tempfile.TemporaryDirectory() as temp:
                src = Path(temp) / 'release.tgz'
                src.write_bytes(self.archive(name, kind).read())
                with self.assertRaises(ValueError):
                    updater.safe_extract(src, Path(temp) / 'code')

    def test_requires_latest_success_for_exact_main_commit(self):
        ok = dict(head_sha='a' * 40, head_branch='main', event='push',
                  run_number=1, status='completed', conclusion='success')
        self.assertTrue(updater.approved_commit([ok], 'a' * 40))
        self.assertFalse(updater.approved_commit([ok], 'b' * 40))
        for changes in [dict(event='pull_request'), dict(head_branch='feature'),
                        dict(status='in_progress'), dict(conclusion='failure')]:
            self.assertFalse(updater.approved_commit([dict(ok, **changes)], 'a' * 40))
        newer = dict(ok, run_number=2, conclusion='failure')
        self.assertFalse(updater.approved_commit([ok, newer], 'a' * 40))

    def test_stale_or_missing_gateway_status_is_unhealthy(self):
        with tempfile.TemporaryDirectory() as temp:
            status = Path(temp) / 'status.json'
            with patch.object(updater, 'STATUS', status):
                self.assertFalse(updater.healthy())
                status.write_text(json.dumps(dict(state='ready', ready=True, lastHeartbeat=time.time()*1000)))
                self.assertTrue(updater.healthy())
                status.write_text(json.dumps(dict(state='ready', ready=True, lastHeartbeat=1)))
                self.assertFalse(updater.healthy())

    def test_failed_activation_restores_previous_code_and_marks_commit(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp) / 'app'
            releases = base / 'releases'
            previous = releases / ('a' * 40)
            previous.mkdir(parents=True)
            (base / 'current').symlink_to(previous)
            meta = Path(temp) / 'meta'
            commit = 'b' * 40
            run_info = dict(head_sha=commit, head_branch='main', event='push', run_number=1,
                            status='completed', conclusion='success')
            def extract(_archive, code):
                (code / 'deploy').mkdir()
                (code / 'deploy/schema-version').write_text('2')
            with patch.multiple(updater, BASE=base, RELEASES=releases, META=meta), \
                 patch.object(updater, 'api', side_effect=[{'sha':commit}, {'workflow_runs':[run_info]}]), \
                 patch.object(updater, 'request', return_value=io.BytesIO(b'archive')), \
                 patch.object(updater, 'safe_extract', side_effect=extract), \
                 patch.object(updater, 'build'), patch.object(updater, 'run') as run, \
                 patch.object(updater, 'wait_ready', side_effect=[False, True]):
                with self.assertRaisesRegex(RuntimeError, 'did not become ready'):
                    updater.main()
            self.assertEqual((base / 'current').resolve(), previous)
            self.assertTrue((meta / ('failed-' + commit)).exists())
            self.assertEqual(sum(call.args == ('systemctl','start','rafiq.service') for call in run.call_args_list), 2)


if __name__ == '__main__':
    unittest.main()
