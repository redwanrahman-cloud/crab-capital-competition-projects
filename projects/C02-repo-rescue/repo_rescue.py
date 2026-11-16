"""Repo Rescue V0: read-only byte comparison and a non-executable recovery plan."""
import argparse
import hashlib
import html
import json
import os
from pathlib import Path
import stat
import sys


class ScanError(Exception):
    pass


def validate_spelling(value):
    path = Path(value)
    if '..' in path.parts:
        raise ScanError('Parent traversal (..) is not accepted; use a direct path')
    if os.name == 'nt':
        if str(path).startswith(('\\\\?\\', '\\\\.\\')):
            raise ScanError('Windows device/extended paths are not supported')
        for part in path.parts:
            if part == path.anchor:
                continue
            if ':' in part or Path(part).is_reserved() or part.endswith((' ', '.')):
                raise ScanError('Windows stream, device or ambiguous path rejected')


def unsafe(info):
    return stat.S_ISLNK(info.st_mode) or bool(
        getattr(info, 'st_file_attributes', 0) & 0x400)


def checked_path(value):
    """Reject links/reparse points in every existing component, before resolve."""
    validate_spelling(value)
    p = Path(os.path.abspath(value))
    for component in reversed((p, *p.parents)):
        info = component.lstat()
        if unsafe(info):
            raise ScanError(f'Link/reparse point rejected: {component}')
    return p


def signature(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_size,
            info.st_mtime_ns, info.st_ctime_ns,
            getattr(info, 'st_file_attributes', 0))


def digest_file(path):
    before = path.lstat()
    if unsafe(before) or not stat.S_ISREG(before.st_mode):
        raise ScanError(f'Not a safe regular file: {path}')
    flags = os.O_RDONLY | getattr(os, 'O_BINARY', 0) | getattr(os, 'O_NOFOLLOW', 0)
    fd = os.open(path, flags)
    with os.fdopen(fd, 'rb') as stream:
        opened = os.fstat(stream.fileno())
        if signature(before) != signature(opened):
            raise ScanError(f'Changed before read: {path}')
        digest = hashlib.sha256()
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
        after = os.fstat(stream.fileno())
    if signature(before) != signature(after) or signature(before) != signature(path.lstat()):
        raise ScanError(f'Changed during read: {path}')
    return {'sha256': digest.hexdigest(), 'bytes': before.st_size,
            'signature': signature(before)}


def scan(root):
    root = checked_path(root)
    if not root.is_dir():
        raise ScanError(f'Expected directory: {root}')
    files, directories = {}, {}

    def walk(folder):
        checked_path(folder)
        before = folder.lstat()
        if not stat.S_ISDIR(before.st_mode):
            raise ScanError(f'Expected safe directory: {folder}')
        directories[folder.relative_to(root).as_posix()] = signature(before)
        with os.scandir(folder) as entries:
            children = sorted(entries, key=lambda entry: entry.name)
        for entry in children:
            path = folder / entry.name
            info = path.lstat()
            if unsafe(info):
                raise ScanError(f'Link/reparse point rejected: {path}')
            if stat.S_ISDIR(info.st_mode):
                walk(path)
            elif stat.S_ISREG(info.st_mode):
                files[path.relative_to(root).as_posix()] = digest_file(path)
            else:
                raise ScanError(f'Special file rejected: {path}')
        if signature(before) != signature(folder.lstat()):
            raise ScanError(f'Directory changed during scan: {folder}')

    walk(root)
    return {'files': files, 'directories': directories}


def contains(parent, child):
    return child == parent or parent in child.parents


def compare(current, snapshot):
    try:
        current, snapshot = checked_path(current), checked_path(snapshot)
        if contains(current, snapshot) or contains(snapshot, current):
            raise ScanError('Input directories must be distinct and non-overlapping')
        first_current, first_snapshot = scan(current), scan(snapshot)
        if first_current != scan(current) or first_snapshot != scan(snapshot):
            raise ScanError('Inputs changed between verification scans; no comparison issued')
        rows, plan = [], []
        left, right = first_current['files'], first_snapshot['files']
        # Use observed directory membership, including empty directories. Refuse
        # the whole comparison before proposing actions on a conflict or its children.
        conflicts = (left.keys() & first_snapshot['directories'].keys()) | (
            right.keys() & first_current['directories'].keys())
        if conflicts:
            details = '; '.join(
                f'{path!r} (current: {"file" if path in left else "directory"}, '
                f'snapshot: {"file" if path in right else "directory"})'
                for path in sorted(conflicts))
            raise ScanError(f'File/directory type conflict: {details}. '
                            'Resolve conflicting path types separately; '
                            'no comparison or restoration proposals issued')
        for path in sorted(left.keys() | right.keys()):
            c, s = left.get(path), right.get(path)
            status = ('missing' if c is None else 'added' if s is None else
                      'identical' if c['sha256'] == s['sha256'] else 'modified')
            rows.append({'path': path, 'status': status,
                         'current_sha256': c['sha256'] if c else None,
                         'snapshot_sha256': s['sha256'] if s else None})
            if status != 'identical':
                plan.append({'path': path, 'proposal': {
                    'added': 'REVIEW_EXTRA (keep or remove by separate human decision)',
                    'missing': 'PROPOSE_COPY_FROM_SNAPSHOT',
                    'modified': 'PROPOSE_REPLACE_FROM_SNAPSHOT_AFTER_BACKUP',
                }[status], 'expected_current_sha256': c['sha256'] if c else None,
                    'proposed_snapshot_sha256': s['sha256'] if s else None})
        return {'product': 'Repo Rescue V0', 'mode': 'PLAN ONLY — NO RESTORE',
                'current': str(current), 'snapshot': str(snapshot),
                'snapshot_trust': 'User-supplied; authenticity not established by hashes',
                'verification': 'Two complete scans with hash and metadata comparison',
                'limitations': 'Not an atomic filesystem snapshot. Quiescent inputs required; '
                'adversarial transient changes may escape detection. File bytes only; '
                'permissions, empty-directory recovery, hard-link topology and authenticity excluded.',
                'counts': {k: sum(r['status'] == k for r in rows)
                           for k in ('added', 'modified', 'missing', 'identical')},
                'files': rows, 'restoration_plan': plan}
    except (OSError, ValueError) as exc:
        raise ScanError(f'Cannot safely compare inputs: {exc}') from exc


def render_html(report):
    """A static evidence desk: visual cues explain states, never execute a plan."""
    esc = lambda value: html.escape(str(value), quote=True)
    labels = {'missing': ('01', 'Missing', 'Present only in the snapshot'),
              'modified': ('02', 'Changed', 'Different bytes need your review'),
              'added': ('03', 'Extra', 'Present only in the current folder'),
              'identical': ('04', 'Unchanged', 'Matching SHA256 file bytes')}
    cards = ''.join(
        f'<a class="card {state}" href="#files"><span class="number">{number}</span>'
        f'<strong>{esc(report["counts"][state])}</strong><span>{label}</span><small>{hint}</small></a>'
        for state, (number, label, hint) in labels.items())
    rows = ''.join(
        f'<tr><th scope="row">{esc(row["path"])}</th><td><span class="badge {row["status"]}">'
        f'{esc(row["status"])}</span></td><td class="hash">{esc(row["current_sha256"] or "—")}</td>'
        f'<td class="hash">{esc(row["snapshot_sha256"] or "—")}</td></tr>'
        for row in report['files'])
    descriptions = {
        'REVIEW_EXTRA (keep or remove by separate human decision)': 'Review this extra file. Decide separately whether to keep or remove it.',
        'PROPOSE_COPY_FROM_SNAPSHOT': 'Consider copying this missing file from your trusted snapshot.',
        'PROPOSE_REPLACE_FROM_SNAPSHOT_AFTER_BACKUP': 'Back up useful current changes before considering replacement from the snapshot.',
    }
    proposals = ''.join(
        f'<article class="proposal"><h3>{esc(item["path"])}</h3>'
        f'<p>{esc(descriptions.get(item["proposal"], item["proposal"]))}</p><details><summary>Inspect proposed hash binding</summary>'
        f'<pre>{esc(json.dumps(item, indent=2, ensure_ascii=False))}</pre></details></article>'
        for item in report['restoration_plan']) or '<p>No restoration proposals: all observed file bytes match.</p>'
    return ("""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Repo Rescue — the evidence desk</title><style>
:root{color-scheme:dark;--bg:#111216;--panel:#1c1e24;--ink:#f3efe4;--muted:#bcb9b0;--line:#45464a;--amber:#ffbc75;--green:#b2d5ae;--pink:#f3a5ae;--blue:#aac8f4}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,sans-serif}
body:before{content:'';position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse at 85% 0, #724b292d,transparent 48%);z-index:-1}
main{max-width:1200px;margin:auto;padding:48px 28px 72px}a{color:inherit}a:focus-visible,summary:focus-visible{outline:3px solid var(--amber);outline-offset:5px}
.eyebrow{color:var(--amber);font:700 12px/1.5 system-ui;letter-spacing:.18em;text-transform:uppercase}
h1{font:clamp(44px,7vw,84px)/1.05 Georgia,serif;letter-spacing:-.04em;margin:16px 0 20px}h2{font:32px/1.2 Georgia,serif;margin:0 0 12px}h3{font-size:17px;overflow-wrap:anywhere;margin:0 0 8px}
.lead{max-width:690px;color:var(--muted);font-size:19px;margin:0 0 28px}.seal{display:inline-block;border:1px solid var(--amber);border-radius:4px;color:var(--amber);padding:8px 13px;font-weight:800;font-size:13px;letter-spacing:.05em}
.banner{border-left:3px solid var(--amber);padding:14px 20px;background:#29231d;margin:28px 0}.banner p{margin:4px 0}.muted,small{color:var(--muted)}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:32px 0 40px}.card{display:flex;flex-direction:column;background:var(--panel);border:1px solid var(--line);border-top:3px solid currentColor;border-radius:7px;padding:20px;text-decoration:none}.card strong{font:52px/1.2 Georgia,serif;margin:14px 0 5px}.number{font-size:12px;opacity:.7;letter-spacing:.15em}.card small{font-size:12px;margin-top:8px}
.card{position:relative}.card.missing:after{content:"";position:absolute;right:20px;top:22px;width:26px;height:31px;border-radius:50% 50% 2px 2px;background:radial-gradient(circle at 32% 36%,#1c1e24 0 2px,transparent 3px),radial-gradient(circle at 68% 36%,#1c1e24 0 2px,transparent 3px),linear-gradient(var(--pink),#f3a5ae77);clip-path:polygon(0 0,100% 0,100% 100%,75% 82%,50% 100%,25% 82%,0 100%)}.missing{color:var(--pink)}.modified{color:var(--amber)}.added{color:var(--blue)}.identical{color:var(--green)}
section{margin-top:36px}.roots{display:grid;grid-template-columns:1fr 1fr;gap:18px}.root{background:var(--panel);border:1px solid var(--line);padding:18px;border-radius:6px}.root p{overflow-wrap:anywhere;margin:6px 0 0;font:13px/1.7 ui-monospace,monospace}
.table-scroll{overflow:auto;border:1px solid var(--line);border-radius:7px;margin-top:20px}table{border-collapse:collapse;width:100%;font-size:13px}caption{text-align:left;padding:14px;background:var(--panel);color:var(--muted)}th,td{text-align:left;padding:16px;vertical-align:top;border-top:1px solid var(--line)}thead th{background:#25262c;font-size:12px}tbody th{min-width:150px;overflow-wrap:anywhere}.hash{font:11px/1.6 ui-monospace,monospace;overflow-wrap:anywhere;min-width:170px;max-width:280px}.badge{font-size:12px;font-weight:700}.proposal{border:1px solid var(--line);border-left:3px solid var(--amber);border-radius:5px;padding:20px;margin:14px 0;background:var(--panel)}.proposal p{font:13px/1.7 ui-monospace,monospace;overflow-wrap:anywhere}summary{cursor:pointer;color:var(--amber);font-size:13px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;color:var(--muted)}footer{margin-top:44px;border-top:1px solid var(--line);padding-top:20px;color:var(--muted);font-size:13px}
@media(max-width:740px){main{padding:30px 18px}.cards{grid-template-columns:repeat(2,1fr)}.roots{grid-template-columns:1fr}.card{padding:16px}h2{font-size:27px}}
@media print{body{background:white;color:black}.card,.root,.proposal,thead th{background:white;color:black}.muted,small,footer,.hash{color:black}.table-scroll{overflow:visible}.cards{break-inside:avoid}details pre{display:block}}
</style></head><body><main><header><div class="eyebrow">The haunted evidence desk · local snapshot inspection</div>
<h1>A ghost in your<br>working tree?</h1><p class="lead">Repo Rescue brings missing files out of the shadows. Inspect what changed before you decide what to recover.</p>
<div class="seal">PLAN ONLY — NO RESTORE</div></header>
<div class="banner"><p><strong>Look closely. Nothing is restored here.</strong></p><p class="muted">This report proposes actions for human review. The application has no restore command.</p></div>
""" + f'<nav class="cards" aria-label="Comparison counts">{cards}</nav>'
        '<section aria-label="Compared folders"><div class="roots">'
        f'<div class="root"><span class="eyebrow">Current folder</span><p>{esc(report["current"])}</p></div>'
        f'<div class="root"><span class="eyebrow">User-supplied snapshot</span><p>{esc(report["snapshot"])}</p></div></div></section>'
        '<section id="files"><div class="eyebrow">01 / Follow the traces</div><h2>The file ledger</h2>'
        '<p class="muted">The ghost marks a missing file: its bytes survive only in your snapshot. Missing and changed files need attention. Extra files need a separate keep-or-remove decision. Unchanged means matching bytes only.</p>'
        '<div class="table-scroll" role="region" aria-label="File comparison" tabindex="0"><table><caption>SHA256 byte comparison · full hashes retained for inspection</caption>'
        '<thead><tr><th scope="col">Path</th><th scope="col">Status</th><th scope="col">Current SHA256</th><th scope="col">Snapshot SHA256</th></tr></thead>'
        f'<tbody>{rows}</tbody></table></div></section>'
        '<section><div class="eyebrow">02 / Review before recovery</div><h2>Inspectable restoration proposals</h2>'
        '<p class="muted">These are descriptions, not commands or approval. Back up useful current changes before considering any replacement.</p>'
        f'{proposals}</section><footer><strong>Trust and limits</strong>'
        f'<p>{esc(report["snapshot_trust"])}</p><p>{esc(report["verification"])}</p>'
        f'<p>{esc(report["limitations"])}</p><p>Self-contained local report · no scripts, remote assets or restore controls.</p>'
        '</footer></main></body></html>')


def export(report, destination, content):
    """Only create a new report outside both inputs. Never overwrite a file."""
    validate_spelling(destination)
    destination = Path(os.path.abspath(destination))
    parent = checked_path(destination.parent)
    if not parent.is_dir():
        raise ScanError('Output parent must be an existing directory')
    for root in (Path(report['current']), Path(report['snapshot'])):
        if contains(root, destination):
            raise ScanError('Report output must be outside both inputs')
    with destination.open('x', encoding='utf-8', newline='\n') as stream:
        stream.write(content + '\n')


def main(argv=None):
    # Stable redirected output on Windows, including Unicode filenames and HTML.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description='Read-only Repo Rescue comparison. No restoration command exists.')
    parser.add_argument('current')
    parser.add_argument('snapshot', help='Trusted snapshot directory supplied by the user')
    parser.add_argument('--format', choices=('json', 'html'), default='json')
    parser.add_argument('--output', help='Create NEW report outside inputs; otherwise print to stdout')
    args = parser.parse_args(argv)
    try:
        report = compare(args.current, args.snapshot)
        content = render_html(report) if args.format == 'html' else json.dumps(report, indent=2, ensure_ascii=False)
        if args.output:
            export(report, args.output, content)
            print(f'Created report: {args.output} (PLAN ONLY; no input writes)')
        else:
            print(content)
        return 0
    except (ScanError, OSError, ValueError) as exc:
        print(f'Repo Rescue refused: {exc}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
