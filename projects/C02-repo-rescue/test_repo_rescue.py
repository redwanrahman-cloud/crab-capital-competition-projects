import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import repo_rescue as rr


class RescueTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.current = self.base / 'current'
        self.snapshot = self.base / 'snapshot'
        self.current.mkdir()
        self.snapshot.mkdir()

    def seed(self):
        for directory in (self.current, self.snapshot):
            (directory / 'same.bin').write_bytes(bytes(range(256)))
            (directory / 'empty').mkdir()
        (self.current / 'change').write_bytes(b'new')
        (self.snapshot / 'change').write_bytes(b'old')
        (self.current / 'extra').write_bytes(b'extra')
        (self.snapshot / 'lost').write_bytes(b'lost')

    def manifest(self):
        # Independent byte + metadata observation; excludes access times, which reads may alter.
        return {str(p.relative_to(self.base)): (
            p.read_bytes() if p.is_file() else None,
            p.stat().st_mtime_ns, p.stat().st_mode)
            for root in (self.current, self.snapshot)
            for p in (root, *root.rglob('*'))}

    def test_all_classes_baseline_and_no_mutations(self):
        self.seed()
        before = self.manifest()
        report = rr.compare(self.current, self.snapshot)
        self.assertEqual(report['counts'], dict(added=1, modified=1, missing=1, identical=1))
        self.assertEqual(before, self.manifest())
        for row in report['files']:
            for directory, key in ((self.current, 'current_sha256'), (self.snapshot, 'snapshot_sha256')):
                p = directory / row['path']
                expected = hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None
                self.assertEqual(row[key], expected)
        self.assertEqual(len(report['restoration_plan']), 3)
        self.assertIn('NO RESTORE', report['mode'])

    def test_empty_directories(self):
        self.assertEqual(rr.compare(self.current, self.snapshot)['files'], [])

    def test_file_directory_conflicts_both_directions_empty_nonempty_nested(self):
        for current_is_file in (False, True):
            for nonempty in (False, True):
                for relative in ('conflict', 'nested/deeper/conflict'):
                    with self.subTest(current_is_file=current_is_file,
                                      nonempty=nonempty, path=relative):
                        case = self.base / f'case-{current_is_file}-{nonempty}-{relative.count("/")}'
                        self.current, self.snapshot = case / 'current', case / 'snapshot'
                        self.current.mkdir(parents=True)
                        self.snapshot.mkdir()
                        self.seed()
                        file_root, dir_root = ((self.current, self.snapshot)
                                               if current_is_file else
                                               (self.snapshot, self.current))
                        file_path, dir_path = file_root / relative, dir_root / relative
                        file_path.parent.mkdir(parents=True, exist_ok=True)
                        dir_path.mkdir(parents=True)
                        file_path.write_bytes(b'file at conflicting path')
                        if nonempty:
                            (dir_path / 'child').mkdir()
                            (dir_path / 'child' / 'leaf.txt').write_bytes(b'blocked descendant')
                        before = self.manifest()
                        expected = (f'{relative!r} (current: '
                                    f'{"file" if current_is_file else "directory"}, '
                                    f'snapshot: {"directory" if current_is_file else "file"})')
                        with self.assertRaises(rr.ScanError) as caught:
                            rr.compare(self.current, self.snapshot)
                        self.assertIn(expected, str(caught.exception))
                        self.assertIn('no comparison or restoration proposals', str(caught.exception))
                        self.assertEqual(before, self.manifest())
                        # A refusal must leave no output in either CLI format.
                        for fmt in ('json', 'html'):
                            output = self.base / f'conflict-{fmt}.report'
                            failed = subprocess.run(
                                [sys.executable, '-B', str(Path(rr.__file__)),
                                 str(self.current), str(self.snapshot), '--format', fmt,
                                 '--output', str(output)],
                                capture_output=True, text=True, encoding='utf-8')
                            self.assertEqual(failed.returncode, 2)
                            self.assertEqual(failed.stdout, '')
                            self.assertIn(expected, failed.stderr)
                            self.assertNotIn('PROPOSE_', failed.stderr)
                            self.assertFalse(output.exists())
                        self.assertEqual(before, self.manifest())

    def test_multiple_type_conflicts_reported_in_sorted_order(self):
        (self.current / 'z-file').write_bytes(b'z')
        (self.snapshot / 'z-file').mkdir()
        (self.current / 'a-dir').mkdir()
        (self.snapshot / 'a-dir').write_bytes(b'a')
        with self.assertRaises(rr.ScanError) as caught:
            rr.compare(self.current, self.snapshot)
        message = str(caught.exception)
        self.assertIn("'a-dir' (current: directory, snapshot: file)", message)
        self.assertIn("'z-file' (current: file, snapshot: directory)", message)
        self.assertLess(message.index("'a-dir'"), message.index("'z-file'"))

    def test_missing_file_root_overlap_and_malformed_inputs(self):
        file = self.base / 'file'
        file.write_text('x')
        child = self.current / 'child'
        child.mkdir()
        for a, b in ((file, self.snapshot), (self.base / 'absent', self.snapshot),
                     (self.current, self.current), (self.current, child),
                     (child, self.current), ('bad\0path', self.snapshot),
                     (self.current / '..' / 'current', self.snapshot)):
            with self.subTest(a=a, b=b), self.assertRaises(rr.ScanError):
                rr.compare(a, b)

    def test_unreadable_file_fail_closed(self):
        self.seed()
        original = rr.os.open
        def deny(path, *args, **kwargs):
            if Path(path).name == 'change':
                raise PermissionError('injected unreadable input')
            return original(path, *args, **kwargs)
        with patch.object(rr.os, 'open', side_effect=deny), self.assertRaisesRegex(rr.ScanError, 'unreadable'):
            rr.compare(self.current, self.snapshot)

    def test_unreadable_directory_fail_closed(self):
        with patch.object(rr.os, 'scandir', side_effect=PermissionError('denied')), self.assertRaises(rr.ScanError):
            rr.compare(self.current, self.snapshot)

    def test_modified_between_scans_is_rejected(self):
        self.seed()
        original, calls = rr.scan, []
        def changing(root):
            result = original(root)
            calls.append(root)
            if len(calls) == 2:
                (self.current / 'change').write_bytes(b'changed after first scan')
            return result
        with patch.object(rr, 'scan', side_effect=changing), self.assertRaisesRegex(rr.ScanError, 'between'):
            rr.compare(self.current, self.snapshot)

    def test_added_during_directory_scan_is_rejected(self):
        self.seed()
        original = rr.digest_file
        def changing(path):
            result = original(path)
            (self.current / 'unexpected').write_bytes(b'new')
            return result
        with patch.object(rr, 'digest_file', side_effect=changing), self.assertRaises(rr.ScanError):
            rr.compare(self.current, self.snapshot)

    def test_changed_during_file_read_is_rejected(self):
        self.seed()
        original = rr.os.fstat
        calls = []
        def changing(fd):
            calls.append(fd)
            info = original(fd)
            if len(calls) == 2:
                # Simulate observable post-read metadata change deterministically.
                from types import SimpleNamespace
                fields = {key: getattr(info, key) for key in
                          ('st_dev', 'st_ino', 'st_mode', 'st_size', 'st_mtime_ns', 'st_ctime_ns')}
                fields['st_size'] += 1
                return SimpleNamespace(**fields)
            return info
        with patch.object(rr.os, 'fstat', side_effect=changing), self.assertRaisesRegex(rr.ScanError, 'during read'):
            rr.compare(self.current, self.snapshot)

    def test_export_boundaries_and_no_overwrite(self):
        self.seed()
        report = rr.compare(self.current, self.snapshot)
        before = self.manifest()
        for path in (self.current / 'report.html', self.snapshot / 'report.html',
                     self.base / 'absent' / 'report.html', self.base / '..' / 'bad.html'):
            with self.assertRaises((rr.ScanError, OSError)):
                rr.export(report, path, 'test')
        out = self.base / 'report.html'
        rr.export(report, out, rr.render_html(report))
        with self.assertRaises(FileExistsError):
            rr.export(report, out, 'overwrite')
        self.assertEqual(before, self.manifest())
        self.assertIn('PLAN ONLY', out.read_text(encoding='utf-8'))

    def test_html_escapes_untrusted_paths(self):
        report = rr.compare(self.current, self.snapshot)
        report['current'] = '<script>alert(1)</script>'
        report['files'] = [dict(path='<img onerror=x>', status='added', current_sha256='a', snapshot_sha256=None)]
        rendered = rr.render_html(report)
        self.assertNotIn('<script>', rendered)
        self.assertNotIn('<img ', rendered)
        self.assertIn('&lt;img', rendered)

    def test_windows_stream_device_and_ambiguous_output_rejected(self):
        if os.name != 'nt':
            self.skipTest('Windows path semantics')
        report = rr.compare(self.current, self.snapshot)
        for name in ('NUL', 'report:stream', 'trailing.', 'trailing '):
            with self.subTest(name=name), self.assertRaises(rr.ScanError):
                rr.export(report, self.base / name, 'x')
        with self.assertRaises(rr.ScanError):
            rr.checked_path('\\\\.\\NUL')

    def test_reparse_detection_without_platform_privilege(self):
        from types import SimpleNamespace
        self.assertTrue(rr.unsafe(SimpleNamespace(st_mode=stat_mode_dir(), st_file_attributes=0x400)))

    def test_native_windows_junction_and_linked_ancestor_rejected(self):
        if os.name != 'nt':
            self.skipTest('Windows native junction test')
        target = self.base / 'target'
        target.mkdir()
        (target / 'child').mkdir()
        link = self.current / 'junction'
        result = subprocess.run(['cmd', '/c', 'mklink', '/J', str(link), str(target)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        try:
            with self.assertRaises(rr.ScanError):
                rr.compare(self.current, self.snapshot)
            with self.assertRaises(rr.ScanError):
                rr.compare(link / 'child', self.snapshot)
            report = rr.compare(target, self.snapshot)
            with self.assertRaises(rr.ScanError):
                rr.export(report, link / 'report.html', 'x')
        finally:
            os.rmdir(link)  # Remove junction itself, never the target.
        self.assertTrue(target.is_dir())

    def test_cli_success_invalid_args_and_missing_input(self):
        self.seed()
        script = str(Path(rr.__file__))
        (self.current / 'unicode-\u09ac\u09be\u0982\u09b2\u09be.txt').write_bytes(b'unicode filename')
        success = subprocess.run([sys.executable, '-B', script, str(self.current), str(self.snapshot)], capture_output=True, text=True, encoding='utf-8')
        self.assertEqual(success.returncode, 0, success.stderr)
        self.assertEqual(json.loads(success.stdout)['counts']['identical'], 1)
        for args in ([], [str(self.base / 'absent'), str(self.snapshot)],
                     [str(self.current), str(self.snapshot), '--restore']):
            failed = subprocess.run([sys.executable, '-B', script, *args], capture_output=True, text=True, encoding='utf-8')
            self.assertEqual(failed.returncode, 2)
            self.assertEqual(failed.stdout, '')


def stat_mode_dir():
    import stat
    return stat.S_IFDIR


if __name__ == '__main__':
    unittest.main(verbosity=2)
