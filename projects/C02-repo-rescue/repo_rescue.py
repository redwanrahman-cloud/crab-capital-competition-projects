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
    esc = lambda value: html.escape(str(value))
    rows = ''.join('<tr>' + ''.join(f'<td>{esc(row[key] or "—")}</td>' for key in
                   ('path', 'status', 'current_sha256', 'snapshot_sha256')) + '</tr>'
                   for row in report['files'])
    return ('<!doctype html><html lang="en"><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width">'
            '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">'
            '<title>Repo Rescue — inspection report</title><style>'
            'body{font:16px system-ui;margin:2rem;background:#101923;color:#ecf2f8}'
            'table{border-collapse:collapse;width:100%}td,th{border:1px solid #526478;padding:.6rem;text-align:left}'
            'td{overflow-wrap:anywhere}pre{white-space:pre-wrap}h1{color:#9fe3bd}'
            '</style><h1>Repo Rescue</h1><h2>PLAN ONLY — NO RESTORE</h2>'
            f'<p>Current: {esc(report["current"])}<br>Snapshot: {esc(report["snapshot"])}</p>'
            f'<p>{esc(report["counts"])}</p><p>{esc(report["snapshot_trust"])}</p>'
            f'<p>{esc(report["verification"])}</p><p>{esc(report["limitations"])}</p>'
            '<table><caption>SHA256 byte comparison</caption><tr><th>Path</th><th>Status</th>'
            f'<th>Current SHA256</th><th>Snapshot SHA256</th></tr>{rows}</table>'
            '<h2>Inspectable restoration proposals</h2><pre>' +
            esc(json.dumps(report['restoration_plan'], indent=2, ensure_ascii=False)) +
            '</pre></html>')


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
