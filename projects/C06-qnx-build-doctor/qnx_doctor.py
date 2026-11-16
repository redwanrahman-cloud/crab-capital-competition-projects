"""Read-only QNX 8 qcc invocation-text auditor. Never executes input commands."""
from __future__ import annotations
import argparse
from dataclasses import dataclass, asdict
import hashlib
import html
import json
from pathlib import Path
import re
import sys

DOC = 'https://qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.utilities/topic/q/qcc.html'
CROSS = 'https://qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.prog/topic/devel_SELFORCROSS.html'
TARGETS = {f'gcc_nto{arch}{suffix}': (expected, suffix or 'unspecified')
           for arch, expected in [('aarch64le', 'aarch64le'), ('x86_64', 'x86_64')]
           for suffix in ['', '_cxx', '_gpp']}
SUFFIXES = {'.c', '.i', '.C', '.cc', '.cpp', '.H', '.HPP', '.h++', '.h', '.hh', '.hpp', '.hxx', '.ii'}
X_TYPES = {'c': 'c', 'c-header': 'c', 'cpp-output': 'c',
           'c++': 'c++', 'c++-header': 'c++',
           'assembler': 'assembly', 'assembler-with-cpp': 'assembly', 's': 'assembly', 'S': 'assembly'}
# QNX documents these as extension aliases, not explicit language names. Its
# suffix table selects their parser from the qcc/q++ or -lang driver language.
X_DRIVER_EXTENSIONS = {'i', 'cc', 'cpp', 'C', 'ii'}

@dataclass(frozen=True)
class Token:
    text: str
    raw: str
    start: int
    end: int

def tokenize(line: str, syntax: str = 'posix') -> tuple[list[Token], list[str]]:
    """Literal argument lexer, not a shell. Retains exact raw spans.

    Windows mode handles backslash-before-double-quote argv rules; it is not a
    cmd.exe or PowerShell interpreter. POSIX mode handles literal quotes/escapes.
    Shell operators/expansions are flagged, never evaluated.
    """
    tokens, risks = [], []
    i = 0
    while i < len(line):
        if line[i].isspace():
            i += 1
            continue
        start, out, quote, started = i, [], None, False
        while i < len(line):
            c = line[i]
            if quote is None and c.isspace():
                break
            started = True
            if syntax == 'windows':
                if c == '\\':
                    j = i
                    while j < len(line) and line[j] == '\\':
                        j += 1
                    n = j - i
                    if j < len(line) and line[j] == '"':
                        out.extend('\\' * (n // 2))
                        if n % 2:
                            out.append('"')
                        else:
                            quote = None if quote else '"'
                        i = j + 1
                        continue
                    out.extend('\\' * n)
                    i = j
                    continue
                if c == '"':
                    quote = None if quote else '"'
                    i += 1
                    continue
                if c == '%' or c == '!' or (quote is None and c in '&|<>^'):
                    risks.append('Windows shell expansion/operator is outside literal argv scope')
            else:
                if c == '\\' and quote != "'":
                    if i + 1 >= len(line):
                        raise ValueError('Dangling escape')
                    nxt = line[i + 1]
                    if quote == '"' and nxt not in '$`"\\\n':
                        out.append(c)
                        i += 1
                    else:
                        out.append(nxt)
                        i += 2
                    continue
                if c in "\"'" and quote is None:
                    quote = c
                    i += 1
                    continue
                if c == quote:
                    quote = None
                    i += 1
                    continue
                if (quote is None and c in ';|&<>()#') or (quote != "'" and c in '$`'):
                    risks.append('Shell expansion/operator is outside literal argv scope')
            out.append(c)
            i += 1
        if quote:
            raise ValueError('Unclosed quote')
        if started:
            tokens.append(Token(''.join(out), line[start:i], start, i))
    return tokens, sorted(set(risks))

def parse_selector(value: str) -> dict:
    """Classify qcc -V forms without asserting installed configurations exist."""
    if value == '':
        return {'kind': 'query', 'selector': value, 'architecture': None}
    if value.count(',') > 1:
        return {'kind': 'malformed', 'selector': value, 'architecture': None}
    prefix, target = value.split(',', 1) if ',' in value else ('', value)
    if ',' in value and (not prefix or not target):
        return {'kind': 'query' if prefix and not target else 'malformed', 'selector': value, 'prefix': prefix, 'architecture': None}
    if target in TARGETS:
        arch, library = TARGETS[target]
        return {'kind': 'target', 'selector': value, 'prefix': prefix,
                'prefixInterpretation': ('compiler/version or configuration path' if '/' in prefix else 'compiler or version') if prefix else 'default compiler version inferred from target',
                'target': target, 'architecture': arch, 'targetLibraryHint': library}
    if ',' not in value and (value == 'gcc' or re.fullmatch(r'(?:gcc/)?\d+(?:\.\d+)*', value)):
        return {'kind': 'query', 'selector': value, 'architecture': None}
    return {'kind': 'unrecognized', 'selector': value, 'architecture': None}

def audit_line(raw: str, expected_arch: str, syntax: str = 'posix', expected_language: str | None = None) -> dict:
    result = {'raw': raw, 'syntax': syntax, 'expectedArchitecture': expected_arch,
              'expectedLanguage': expected_language, 'status': 'UNKNOWN', 'architecture': None,
              'recognizedFlags': [], 'selectors': [], 'operands': [], 'findings': [],
              'citations': [DOC, CROSS], 'nextManualCheck': 'On an authorized SDK host, inspect the real qcc configuration and original argv; no compiler command was run here.'}
    if not raw.strip():
        result.update(status='SKIPPED', reason='Blank line')
        return result
    try:
        tokens, opaque = tokenize(raw, syntax)
    except ValueError as exc:
        result.update(reason=str(exc), status='MALFORMED')
        return result
    result['tokens'] = [asdict(t) for t in tokens]
    exe = tokens[0].text.replace('\\', '/').split('/')[-1].lower()
    if exe not in ('qcc', 'q++', 'qcc.exe', 'q++.exe'):
        result['reason'] = 'First literal token is not qcc/q++; wrappers, prompts and shell scripts require original compiler argv'
        return result
    result['driver'] = exe.removesuffix('.exe')
    selectors, langs, libraries, files, response = [], [], [], [], []
    xmode, mode, flags = None, 'invocation', result['recognizedFlags']
    i = 1
    def flag(kind, start, end, value):
        flags.append({'kind': kind, 'raw': raw[tokens[start].start:tokens[end].end], 'value': value,
                      'start': tokens[start].start, 'end': tokens[end].end})
    while i < len(tokens):
        t, begin = tokens[i].text, i
        # Known options consuming one operand must not turn a quoted definition,
        # include directory or output filename into a fake compiler switch.
        takes = ('-o', '-I', '-L', '-D', '-U', '-isystem', '-A', '-a', '-N', '-l')
        if t in takes:
            if i + 1 >= len(tokens):
                opaque.append('Missing operand for ' + t)
            else:
                i += 1
            flag('other-option', begin, i, tokens[i].text if i != begin else None)
        elif t.startswith('-V'):
            value = t[2:]
            if not value and i + 1 < len(tokens) and not tokens[i + 1].text.startswith(('-', '@')):
                i += 1
                value = tokens[i].text
            parsed = parse_selector(value)
            selectors.append(parsed)
            flag('target-selector', begin, i, value)
        elif t in ('-lang-c', '-lang-c++'):
            langs.append('c++' if t == '-lang-c++' else 'c')
            flag('driver-language', i, i, langs[-1])
        elif t.startswith('-x'):
            value = t[2:]
            if not value and i + 1 < len(tokens) and not tokens[i + 1].text.startswith('-'):
                i += 1
                value = tokens[i].text
            xmode = None if value == 'none' else 'DRIVER_EXTENSION' if value in X_DRIVER_EXTENSIONS else X_TYPES.get(value, 'UNKNOWN')
            if xmode == 'UNKNOWN':
                opaque.append('Unrecognized or missing -x language')
            flag('positional-language', begin, i, value)
        elif t.startswith('-Y') or t.startswith('-stdlib='):
            value = t[2:] if t.startswith('-Y') else t.partition('=')[2]
            if t == '-Y' and i + 1 < len(tokens) and not tokens[i + 1].text.startswith('-'):
                i += 1
                value = tokens[i].text
            library = {'libc++': '_cxx', 'libstdc++': '_gpp', '_cxx': '_cxx', '_gpp': '_gpp'}.get(value)
            libraries.append(library or 'UNKNOWN')
            flag('cxx-library', begin, i, value)
        elif t == '-W' or t.startswith(('-Wc,', '-Wp,', '-Wl,', '-Wa,')):
            value = t[2:]
            if t == '-W' and i + 1 < len(tokens):
                i += 1
                value = tokens[i].text
            flag('phase-pass-through', begin, i, value)
            if value.startswith('l,') and '@' in value:
                result['findings'].append('Linker-only response-file reference: not expanded by this tool; it does not establish compiler -V or language overrides.')
            elif value.startswith(('c,', 'p,')):
                opaque.append('Compiler/preprocessor pass-through may change language or code generation; inspect manually')
        elif t in ('-set-default', '--version', '-n', '-c', '-S', '-E'):
            flag('operation', i, i, t)
            if t == '-set-default':
                mode = 'configuration-change'
            elif t == '--version':
                mode = 'version-query'
        elif t.startswith('@'):
            response.append(t)
            flag('qcc-response-file', i, i, t)
        elif t.startswith('-'):
            # Do not certify unrelated switches; preserve them as literal text.
            flag('uninterpreted-option', i, i, t)
        else:
            files.append((t, xmode))
        i += 1
    result.update(selectors=selectors, operation=mode, responseFiles=response)
    if response:
        opaque.append('Unread qcc response file may contain target/language switches; no response file was opened')
    distinct = {s['target'] for s in selectors if s['kind'] == 'target'}
    archs = {s['architecture'] for s in selectors if s['kind'] == 'target'}
    if len(distinct) > 1:
        opaque.append('Conflicting -V targets; precedence is not inferred')
    if any(s['kind'] != 'target' for s in selectors):
        opaque.append('Query, malformed or unrecognized -V selector; installed target configuration is unknown')
    if not selectors:
        opaque.append('No -V: configured default is unknown; omission can be valid and is not a build failure')
    if mode != 'invocation':
        opaque.append('Configuration/version operation, not evidence of a compilation')
    if len(set(langs)) > 1:
        opaque.append('Conflicting -lang flags; precedence is not inferred')
    driver_language = langs[0] if len(set(langs)) == 1 else ('UNKNOWN' if langs else ('c++' if result['driver'] == 'q++' else 'c'))
    result['driverLanguage'] = driver_language
    language_opaque = bool(opaque)
    for name, forced in files:
        suffix = Path(name.replace('\\', '/')).suffix
        kind = ('explicit-type' if forced else 'linker-input' if suffix in ('.o', '.a') else 'assembly' if suffix in ('.s', '.S') else 'source' if suffix in SUFFIXES else 'unknown-input')
        language = driver_language if forced == 'DRIVER_EXTENSION' else forced or (driver_language if suffix in SUFFIXES else 'assembly' if kind == 'assembly' else 'not-applicable' if kind == 'linker-input' else 'UNKNOWN')
        filespec = {'rawOperand': name, 'kind': kind, 'language': language,
                    'languageStatus': 'UNKNOWN' if language_opaque or language == 'UNKNOWN' else 'TEXT_ONLY'}
        result['operands'].append(filespec)
    result['librarySelection'] = libraries
    if any(forced == 'DRIVER_EXTENSION' for _, forced in files):
        result['findings'].append('Positional -x extension aliases use the documented qcc/q++ or -lang parser selection; they do not independently force C or C++.')
    hints = {s.get('targetLibraryHint') for s in selectors if s['kind'] == 'target'} - {'unspecified'}
    if len(set(libraries) | hints) > 1 or 'UNKNOWN' in libraries:
        result['findings'].append('C++ library selectors disagree or are unrecognized; inspect target suffix, -Y and -stdlib manually. Library type is not source language.')
    result['findings'].append('qcc/q++ source language follows driver/-lang selection for documented C/C++ suffixes; .cpp alone is not proof of C++. Positional -x overrides following input types.')
    mismatches = [s['target'] for s in selectors if s['kind'] == 'target' and s['architecture'] != expected_arch]
    result['visibleTargetMismatches'] = mismatches
    result['unknownReasons'] = sorted(set(opaque))
    if opaque:
        result['reason'] = '; '.join(result['unknownReasons'])
    elif len(archs) == 1:
        result['architecture'] = next(iter(archs))
        result['status'] = 'MISMATCH' if mismatches else 'MATCH_TEXT_ONLY'
        result['reason'] = 'Explicit documented target name differs from declared architecture' if mismatches else 'Explicit documented target name aligns with declared architecture; no installed-toolchain or build proof'
    else:
        result['reason'] = 'No recognized explicit target'
    result['languageMismatches'] = []
    if expected_language:
        result['languageMismatches'] = [x['rawOperand'] for x in result['operands'] if x['languageStatus'] == 'TEXT_ONLY' and x['language'] not in (expected_language, 'not-applicable')]
        if result['languageMismatches'] and result['status'] != 'UNKNOWN':
            result['status'] = 'MISMATCH'
            result['reason'] += '; input language differs from declared language'
        elif not result['operands'] or any(x['languageStatus'] == 'UNKNOWN' for x in result['operands']):
            result['status'] = 'UNKNOWN'
            result['reason'] += '; source language cannot be established for every input'
    if response:
        result['nextManualCheck'] = 'Have the SDK owner inspect these qcc response files and flatten the real argv: '+', '.join(response)+'. This auditor never opens or expands them.'
    elif len(distinct) > 1:
        result['nextManualCheck'] = 'Trace each recorded -V back to its build-variable source. Confirm intended target and remove ambiguity manually; this tool does not assume last-option precedence.'
    elif mismatches:
        result['nextManualCheck'] = 'Compare the declared board architecture '+expected_arch+' with the explicit selectors '+', '.join(mismatches)+'. Ask the build owner which declaration is correct before editing anything.'
    elif not selectors or any(s['kind'] != 'target' for s in selectors):
        result['nextManualCheck'] = 'Ask the licensed SDK owner for the installed target list and configured default, including QCC_CONF_PATH. A listing/default cannot be inferred from this text.'
    elif result['languageMismatches']:
        result['nextManualCheck'] = 'Inspect qcc versus q++ and -lang-c/-lang-c++ for the named inputs, plus positional -x switches. Confirm intended C++ link mode for exception support; do not infer it from a .cpp suffix.'
    else:
        result['nextManualCheck'] = 'Verify that the literal -V configuration/prefix exists in the authorized SDK, then obtain genuine compile/link and target-run evidence separately. This report establishes only text alignment.'
    return result

def audit_text(text: str, arch: str, syntax='posix', language=None, label='USER_SUPPLIED_UNVERIFIED') -> dict:
    return {'tool': 'QNX Build Doctor 0.1', 'analysis': 'STATIC_TEXT_ONLY_NO_COMPILER_EXECUTION',
            'inputLabel': label, 'inputSha256': hashlib.sha256(text.encode('utf-8')).hexdigest(),
            'rows': [dict(line=i, **audit_line(line, arch, syntax, language)) for i, line in enumerate(text.splitlines(), 1)]}

def html_report(report: dict) -> str:
    esc = lambda x: html.escape(str(x), quote=True)
    parts = ['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QNX Build Doctor</title><style>body{font:15px system-ui;background:#eef2f5;color:#183342;margin:0}main{max-width:1100px;margin:auto;padding:28px}h1{font-size:36px}article{background:white;border:1px solid #cbd7de;border-radius:12px;padding:20px;margin:18px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#edf3f6;padding:14px}summary{cursor:pointer}code{font-size:12px}.MISMATCH{color:#a42d22}.UNKNOWN,.MALFORMED{color:#895900}.MATCH_TEXT_ONLY{color:#176550}a{color:#174d74}</style><main><p>OFFLINE HOST TOOL · QNX 8 INVOCATION REVIEW</p><h1>QNX Build Doctor</h1><p>Static text evidence only. No compiler or input command executed. No build or target-runtime result.</p>']
    parts.append('<p>Input: '+esc(report['inputLabel'])+' · SHA-256 <code>'+esc(report['inputSha256'])+'</code></p>')
    for row in report['rows']:
        parts.append(f'<article><h2 class="{esc(row["status"])}">Line {row["line"]} · {esc(row["status"])}</h2><pre>{esc(row["raw"])}</pre><p>{esc(row.get("reason", ""))}</p>')
        parts.append('<p>Declared architecture: '+esc(row['expectedArchitecture'])+' · literal architecture: '+esc(row['architecture'])+'</p>')
        for key in ('recognizedFlags', 'selectors', 'operands', 'visibleTargetMismatches', 'languageMismatches', 'findings'):
            if row.get(key):
                parts.append('<details open><summary>'+esc(key)+'</summary><pre>'+esc(json.dumps(row[key], indent=2, ensure_ascii=False))+'</pre></details>')
        parts.append('<p>Next manual check: '+esc(row.get('nextManualCheck', 'Inspect the original literal command line.'))+'</p><p><a href="'+DOC+'">Official qcc flag and language reference</a> · <a href="'+CROSS+'">Official cross-development guide</a></p></article>')
    return ''.join(parts)+'</main></html>'

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path, help='UTF-8 file, one literal compiler invocation per line')
    parser.add_argument('--expect-arch', required=True, choices=['aarch64le', 'x86_64'])
    parser.add_argument('--expect-language', choices=['c', 'c++', 'assembly'])
    parser.add_argument('--syntax', choices=['posix', 'windows'], default='posix')
    parser.add_argument('--label', default='USER_SUPPLIED_UNVERIFIED')
    parser.add_argument('--html', type=Path, help='Create a new offline HTML report; never overwrite a file')
    args = parser.parse_args(argv)
    try:
        original_bytes = args.input.read_bytes()
        text = original_bytes.decode('utf-8-sig')
        report = audit_text(text, args.expect_arch, args.syntax, args.expect_language, args.label)
        report['inputSha256'] = hashlib.sha256(original_bytes).hexdigest()
        report['inputHashBasis'] = 'exact original file bytes, including any BOM and line endings'
        if args.html:
            if args.html.resolve() == args.input.resolve():
                raise ValueError('Report destination must differ from input')
            with args.html.open('x', encoding='utf-8') as stream:
                stream.write(html_report(report))
        print(json.dumps(report, indent=2, ensure_ascii=False))
        statuses = {r['status'] for r in report['rows']}
        return 1 if 'MISMATCH' in statuses else 2 if statuses & {'UNKNOWN', 'MALFORMED'} or not (statuses - {'SKIPPED'}) else 0
    except (OSError, UnicodeError, ValueError) as exc:
        parser.exit(2, 'Read-only audit error: '+str(exc)+'\n')

if __name__ == '__main__':
    sys.exit(main())
