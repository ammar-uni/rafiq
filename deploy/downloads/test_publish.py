import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('download_publisher', Path(__file__).with_name('publish.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        root = Path(self.temporary.name)
        self.publisher = module.Publisher(root / 'state', root / 'incoming')
        self.publisher.initialize()

    def installer(self, version='1.2.3', marker=1):
        data = bytearray(1024)
        data[:2] = b'MZ'
        struct.pack_into('<I', data, 60, 128)
        data[128:132] = b'PE\0\0'
        data[-1] = marker
        path = self.publisher.incoming / f'Rafiq-Setup-{version}.exe'
        path.write_bytes(data)
        return path, hashlib.sha256(data).hexdigest()

    def test_init_and_verify_do_not_enable_downloads(self):
        path, sha = self.installer()
        self.assertEqual(self.publisher.status(), module.OFF)
        self.publisher.verify(path, '1.2.3', sha)
        self.assertEqual(self.publisher.status(), module.OFF)
        self.assertEqual(list(self.publisher.downloads.iterdir()), [])

    def test_bad_checksum_and_noninstaller_are_rejected_without_public_changes(self):
        path, sha = self.installer()
        with self.assertRaises(ValueError):
            self.publisher.publish(path, '1.2.3', '0' * 64)
        path.write_bytes(b'not an installer' * 30)
        with self.assertRaises(ValueError):
            self.publisher.publish(path, '1.2.3', module.digest(path))
        self.assertEqual(self.publisher.status(), module.OFF)
        self.assertEqual(list(self.publisher.downloads.iterdir()), [])

    def test_sources_outside_private_incoming_and_symlinks_are_rejected(self):
        path, sha = self.installer()
        external = self.publisher.root / path.name
        external.write_bytes(path.read_bytes())
        with self.assertRaises(ValueError):
            self.publisher.publish(external, '1.2.3', sha)
        link = self.publisher.incoming / 'link' / path.name
        link.parent.mkdir()
        link.symlink_to(path)
        with self.assertRaises(ValueError):
            self.publisher.publish(link, '1.2.3', sha)
        for version in ['../1.2.3', '1.2', '1.2.3/other']:
            with self.assertRaises(ValueError):
                self.publisher.publish(path, version, sha)

    def test_publish_exact_bytes_and_version_are_immutable(self):
        path, sha = self.installer()
        release = self.publisher.publish(path, '1.2.3', sha)
        self.assertEqual(self.publisher.status(), release)
        self.assertEqual(module.digest(self.publisher.downloads / path.name), sha)
        self.assertEqual(self.publisher.publish(path, '1.2.3', sha), release)
        path, changed = self.installer(marker=2)
        with self.assertRaises(ValueError):
            self.publisher.publish(path, '1.2.3', changed)
        self.assertEqual(self.publisher.status(), release)

    def test_a_new_web_release_does_not_own_download_metadata(self):
        path, sha = self.installer()
        release = self.publisher.publish(path, '1.2.3', sha)
        website = Path(self.temporary.name) / 'website' / 'public'
        website.mkdir(parents=True)
        (website / 'release.json').write_text(json.dumps(module.OFF))
        self.assertEqual(self.publisher.status(), release)

    def test_disable_blocks_all_public_installer_urls_and_preserves_rollback(self):
        path, sha = self.installer()
        first = self.publisher.publish(path, '1.2.3', sha)
        path2, sha2 = self.installer('1.2.4', 2)
        self.publisher.publish(path2, '1.2.4', sha2)
        self.assertEqual(self.publisher.disable(), module.OFF)
        self.assertEqual(list(self.publisher.downloads.iterdir()), [])
        self.assertEqual(self.publisher.activate('1.2.3'), first)
        self.assertEqual(module.digest(self.publisher.downloads / path.name), sha)

    def test_failure_updating_metadata_keeps_the_previous_active_release(self):
        path, sha = self.installer()
        first = self.publisher.publish(path, '1.2.3', sha)
        path2, sha2 = self.installer('1.2.4', 2)
        original = module.atomic_json
        def fail_pointer(target, value, mode=0o600):
            if target == self.publisher.pointer:
                raise OSError('Synthetic metadata write failure')
            return original(target, value, mode)
        with patch.object(module, 'atomic_json', side_effect=fail_pointer):
            with self.assertRaises(OSError):
                self.publisher.publish(path2, '1.2.4', sha2)
        self.assertEqual(self.publisher.status(), first)
        self.assertEqual(module.digest(self.publisher.downloads / path.name), sha)

    def test_damaged_archive_cannot_replace_current_release(self):
        path, sha = self.installer()
        first = self.publisher.publish(path, '1.2.3', sha)
        archived = self.publisher.releases / '1.2.3' / path.name
        archived.write_bytes(b'broken')
        with self.assertRaises(ValueError):
            self.publisher.activate('1.2.3')
        self.assertEqual(self.publisher.status(), first)


if __name__ == '__main__':
    unittest.main()
