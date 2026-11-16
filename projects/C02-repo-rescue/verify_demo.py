"""Reproduce saved native demo evidence; only writes app/evidence new files."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys


HERE = Path(__file__).resolve().parent
OUT = HERE / 'evidence'
CURRENT = HERE / 'fixtures' / 'current'
SNAPSHOT = HERE / 'fixtures' / 'snapshot'


def observe(root):
    return {p.relative_to(root).as_posix(): {
        'sha256': hashlib.sha256(p.read_bytes()).hexdigest(),
        'bytes': p.stat().st_size, 'mtime_ns': p.stat().st_mtime_ns,
        'mode': p.stat().st_mode,
    } for p in sorted(root.rglob('*')) if p.is_file()}


def save(name, content):
    with (OUT / name).open('x', encoding='utf-8') as stream:
        stream.write(content)


def main():
    OUT.mkdir(exist_ok=True)
    # Refuse rerun before launching anything if evidence names already exist.
    names = ('demo.json', 'demo.html', 'tests.txt', 'baseline.json')
    if any((OUT / name).exists() for name in names):
        raise SystemExit('Evidence already exists; preserve it. Run CLI/tests directly for a fresh check.')
    before = {'current': observe(CURRENT), 'snapshot': observe(SNAPSHOT)}
    command = [sys.executable, '-B', str(HERE / 'repo_rescue.py'), str(CURRENT), str(SNAPSHOT)]
    demo = subprocess.run(command, capture_output=True, text=True, encoding='utf-8')
    if demo.returncode:
        raise SystemExit(demo.stderr)
    save('demo.json', demo.stdout)
    report = json.loads(demo.stdout)
    baseline = []
    for name in sorted(before['current'].keys() | before['snapshot'].keys()):
        c, s = before['current'].get(name), before['snapshot'].get(name)
        state = ('missing' if c is None else 'added' if s is None else
                 'identical' if c['sha256'] == s['sha256'] else 'modified')
        baseline.append({'path': name, 'status': state,
                         'current_sha256': c['sha256'] if c else None,
                         'snapshot_sha256': s['sha256'] if s else None})
    assert baseline == report['files'], 'Independent hash/list baseline disagrees'
    html_run = subprocess.run(command + ['--format', 'html', '--output', str(OUT / 'demo.html')],
                              capture_output=True, text=True, encoding='utf-8')
    if html_run.returncode:
        raise SystemExit(html_run.stderr)
    tests = subprocess.run([sys.executable, '-B', '-m', 'unittest', 'discover', '-s', str(HERE),
                            '-p', 'test_*.py', '-v'], capture_output=True, text=True, encoding='utf-8')
    save('tests.txt', f'Executable: {sys.executable}\nExit: {tests.returncode}\n' + tests.stdout + tests.stderr)
    after = {'current': observe(CURRENT), 'snapshot': observe(SNAPSHOT)}
    save('baseline.json', json.dumps({'method': 'Independent pathlib listing + hashlib bytes',
         'native_cli_exit': demo.returncode, 'native_html_export_exit': html_run.returncode,
         'baseline_matches_report': baseline == report['files'],
         'fixture_bytes_and_metadata_unchanged': before == after,
         'before': before, 'after': after, 'baseline': baseline}, indent=2))
    assert before == after, 'Fixture inputs changed'
    if tests.returncode:
        raise SystemExit(tests.returncode)
    print('Demo JSON/HTML exported; independent baseline matches; fixture inputs unchanged; tests passed.')


if __name__ == '__main__':
    main()
