import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('entry', Path(__file__).with_name('unify-entry.py'))
entry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(entry)


class EntryTests(unittest.TestCase):
    def test_repeated_copy_preserves_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, target = root/'source.exe', root/'current.exe'
            source.write_bytes(b'new release')
            target.write_bytes(b'old release')
            entry.replace_file(source, target)
            entry.replace_file(source, target)
            self.assertEqual(entry.digest(source), entry.digest(target))
            self.assertFalse(list(root.glob('.floward-update-*')))

    def test_staging_failure_preserves_original(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, target = root/'source.exe', root/'current.exe'
            source.write_bytes(b'new')
            target.write_bytes(b'old')
            with patch.object(entry.shutil, 'copy2', side_effect=OSError('disk full')):
                with self.assertRaises(OSError):
                    entry.replace_file(source, target)
            self.assertEqual(target.read_bytes(), b'old')
            self.assertFalse(list(root.glob('.floward-update-*')))

    def test_running_process_blocks_before_writes(self):
        with patch.object(entry, 'probe_writable') as probe:
            with self.assertRaisesRegex(RuntimeError, 'normally'):
                entry.apply(None, None, {'running': [{'pid': 1}]}, {}, {})
            probe.assert_not_called()

    def test_plan_identifies_stale_copy_and_wrong_shortcut(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, fixed, old = root/'source.exe', root/'current.exe', root/'floward.exe'
            source.write_bytes(b'new')
            fixed.write_bytes(b'new')
            old.write_bytes(b'old')
            inv = {'links': [{'path': str(root/'app.lnk'), 'target': str(old)}],
                   'processes': [{'pid': 3, 'path': str(old)}]}
            with patch.object(entry.Path, 'home', return_value=root):
                plan = entry.plan(source, fixed, inv)
            self.assertEqual(plan['updates'], [str(old)])
            self.assertEqual(len(plan['shortcuts']), 1)
            self.assertEqual(plan['running'][0]['pid'], 3)


if __name__ == '__main__':
    unittest.main()
