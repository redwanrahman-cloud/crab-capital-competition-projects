import contextlib
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import qnx_doctor as q

class DoctorTests(unittest.TestCase):
    def test_x_extension_aliases_follow_qnx_driver_not_gcc_language_assumptions(self):
        for extension in ('cpp', 'cc', 'C', 'ii', 'i'):
            for driver, language in (('qcc', 'c'), ('q++', 'c++')):
                for option in ('-x ' + extension, '-x' + extension):
                    with self.subTest(driver=driver, option=option):
                        result = q.audit_line(f'{driver} -Vgcc_ntox86_64 {option} example.input', 'x86_64', expected_language=language)
                        self.assertEqual(result['status'], 'MATCH_TEXT_ONLY')
                        self.assertEqual(result['operands'][0]['language'], language)
                        self.assertEqual(result['operands'][0]['languageStatus'], 'TEXT_ONLY')
                        opposite = 'c++' if language == 'c' else 'c'
                        mismatch = q.audit_line(f'{driver} -Vgcc_ntox86_64 {option} example.input', 'x86_64', expected_language=opposite)
                        self.assertEqual(mismatch['status'], 'MISMATCH')

    def test_x_extension_driver_overrides_position_reset_and_conflicts(self):
        result = q.audit_line('qcc -Vgcc_ntox86_64 -xcpp first.input -xnone second.cpp -lang-c++', 'x86_64', expected_language='c++')
        self.assertEqual(result['status'], 'MATCH_TEXT_ONLY')
        self.assertEqual([operand['language'] for operand in result['operands']], ['c++', 'c++'])
        explicit = q.audit_line('q++ -Vgcc_ntox86_64 -xc first.input -xc++ second.input -xcpp third.input -xnone fourth.cpp', 'x86_64')
        self.assertEqual([operand['language'] for operand in explicit['operands']], ['c', 'c++', 'c++', 'c++'])
        conflict = q.audit_line('qcc -Vgcc_ntox86_64 -lang-c -lang-c++ -xii example.input', 'x86_64', expected_language='c')
        self.assertEqual(conflict['status'], 'UNKNOWN')
        unknown = q.audit_line('qcc -Vgcc_ntox86_64 -xundocumented example.input', 'x86_64', expected_language='c')
        self.assertEqual(unknown['status'], 'UNKNOWN')
        self.assertEqual(unknown['operands'][0]['languageStatus'], 'UNKNOWN')

    def test_documented_vendor_commands_are_text_fixtures_not_execution(self):
        a=q.audit_line('qcc -Vgcc_ntox86_64 myfile.c','x86_64')
        b=q.audit_line('qcc -V gcc_ntoaarch64le hello.c -o hello','aarch64le')
        self.assertEqual(a['status'],'MATCH_TEXT_ONLY')
        self.assertEqual(b['status'],'MATCH_TEXT_ONLY')
        self.assertEqual(b['recognizedFlags'][0]['raw'],'-V gcc_ntoaarch64le')

    def test_all_documented_architecture_and_library_variants(self):
        for target,(arch,lib) in q.TARGETS.items():
            for prefix in ('','12.0,','gcc,','gcc/12.0,'):
                with self.subTest(target=target,prefix=prefix):
                    r=q.audit_line(f'qcc -V{prefix}{target} demo.c',arch)
                    self.assertEqual(r['status'],'MATCH_TEXT_ONLY')
                    self.assertEqual(r['selectors'][0]['targetLibraryHint'],lib)
                    other='x86_64' if arch=='aarch64le' else 'aarch64le'
                    self.assertEqual(q.audit_line(f'qcc -V{prefix}{target} demo.c',other)['status'],'MISMATCH')

    def test_raw_spans_quotes_paths_and_definition_operands(self):
        raw='"/opt/QNX SDK/bin/qcc" -I"/inc with spaces" -D "-Vgcc_ntox86_64" -V "12.0,gcc_ntoaarch64le" "src/my file.cpp"'
        r=q.audit_line(raw,'aarch64le')
        self.assertEqual(r['status'],'MATCH_TEXT_ONLY')
        self.assertEqual(len(r['selectors']),1)
        self.assertEqual(r['operands'][0]['rawOperand'],'src/my file.cpp')
        for f in r['recognizedFlags']:
            self.assertEqual(raw[f['start']:f['end']],f['raw'])
        self.assertEqual(r['recognizedFlags'][-1]['raw'],'-V "12.0,gcc_ntoaarch64le"')
        win=r'"C:\Program Files\QNX\bin\q++.exe" -Vgcc_ntox86_64 "C:\my sources\file.cpp"'
        w=q.audit_line(win,'x86_64','windows')
        self.assertEqual(w['status'],'MATCH_TEXT_ONLY')
        self.assertEqual(w['operands'][0]['rawOperand'],r'C:\my sources\file.cpp')
        self.assertEqual(w['driverLanguage'],'c++')

    def test_windows_literal_quote_and_backslash_lexer(self):
        tokens,risks=q.tokenize(r'qcc "path with space\\" "escaped\"quote.c"','windows')
        self.assertFalse(risks)
        self.assertEqual(tokens[1].text,'path with space\\')
        self.assertEqual(tokens[2].text,'escaped"quote.c')

    def test_conflict_default_queries_and_unknown_targets_never_pass(self):
        lines=['qcc demo.c','qcc -V','qcc -Vgcc,','qcc -Vgcc','qcc -V12.0','qcc -Vgcc/12.0',
               'qcc -Vgcc_ntoarmv7le demo.c','qcc -Vbad,,gcc_ntox86_64 demo.c',
               'qcc -Vgcc_ntox86_64 -Vgcc_ntoaarch64le demo.c','qcc --version -Vgcc_ntox86_64',
               'qcc -Vgcc_ntox86_64 -set-default']
        for line in lines:
            with self.subTest(line=line):
                self.assertEqual(q.audit_line(line,'x86_64')['status'],'UNKNOWN')
        r=q.audit_line('qcc -Vgcc_ntox86_64 -Vgcc_ntox86_64 demo.c','x86_64')
        self.assertEqual(r['status'],'MATCH_TEXT_ONLY')

    def test_responsefiles_remain_unread_and_linker_passthrough_is_distinct(self):
        with patch('builtins.open',side_effect=AssertionError('must not open response files')):
            r=q.audit_line('qcc -Vgcc_ntox86_64 @private.rsp demo.c','aarch64le')
            self.assertEqual(r['status'],'UNKNOWN')
            self.assertEqual(r['visibleTargetMismatches'],['gcc_ntox86_64'])
            l=q.audit_line('qcc -Vgcc_ntox86_64 -Wl,@private.rsp demo.c','x86_64')
            self.assertEqual(l['status'],'MATCH_TEXT_ONLY')
            self.assertEqual(l['responseFiles'],[])
            self.assertIn('Linker-only',l['findings'][0])
            c=q.audit_line('qcc -Vgcc_ntox86_64 -W c,-xc++ demo.c','x86_64')
            self.assertEqual(c['status'],'UNKNOWN')

    def test_qnx_driver_language_and_positional_x(self):
        r=q.audit_line('qcc -Vgcc_ntox86_64 demo.cpp','x86_64',expected_language='c++')
        self.assertEqual(r['status'],'MISMATCH')
        self.assertEqual(r['operands'][0]['language'],'c')
        r=q.audit_line('q++ -Vgcc_ntox86_64 -xc first.header -xnone second.cpp','x86_64')
        self.assertEqual([x['language'] for x in r['operands']],['c','c++'])
        r=q.audit_line('qcc -Vgcc_ntox86_64 first.cpp -lang-c++ second.c','x86_64')
        self.assertEqual([x['language'] for x in r['operands']],['c++','c++'])
        r=q.audit_line('qcc -Vgcc_ntox86_64 -lang-c -lang-c++ demo.c','x86_64')
        self.assertEqual(r['status'],'UNKNOWN')
        self.assertEqual(q.audit_line('qcc -Vgcc_ntox86_64 -x rust demo.c','x86_64')['status'],'UNKNOWN')

    def test_library_type_is_not_source_language(self):
        r=q.audit_line('qcc -Vgcc_ntox86_64_cxx -Y_gpp -stdlib=libc++ demo.cpp','x86_64')
        self.assertEqual(r['status'],'MATCH_TEXT_ONLY')
        self.assertEqual(r['driverLanguage'],'c')
        self.assertTrue(any('Library type' in f for f in r['findings']))

    def test_malformed_missing_args_and_unrecognized_driver(self):
        for line in ['qcc "broken','qcc trailing\\']:
            self.assertEqual(q.audit_line(line,'x86_64')['status'],'MALFORMED')
        for line in ['qcc -Vgcc_ntox86_64 -o','ccache qcc -Vgcc_ntox86_64 demo.c','qcc -Vgcc_ntox86_64 -x']:
            self.assertEqual(q.audit_line(line,'x86_64')['status'],'UNKNOWN')
        self.assertEqual(q.audit_line('   ','x86_64')['status'],'SKIPPED')

    def test_operators_expansions_and_malicious_text_never_execute(self):
        with patch('os.system',side_effect=AssertionError('execution forbidden')),patch('subprocess.run',side_effect=AssertionError('execution forbidden')):
            for raw,syntax in [('qcc -Vgcc_ntox86_64 demo.c; touch should-not-exist','posix'),
                               ('qcc -Vgcc_ntox86_64 $(touch marker).c','posix'),
                               ('qcc -Vgcc_ntox86_64 %SECRET%.c','windows'),
                               ('qcc -Vgcc_ntox86_64 demo.c & never-run','windows')]:
                self.assertEqual(q.audit_line(raw,'x86_64',syntax)['status'],'UNKNOWN')
        self.assertFalse(Path('should-not-exist').exists())

    def test_report_is_deterministic_escaped_and_cli_preserves_input(self):
        text='qcc -Vgcc_ntox86_64 "<script>alert(1)</script>.c"\n'
        a=q.audit_text(text,'x86_64',label='SYNTHETIC_FIXTURE')
        self.assertEqual(a,q.audit_text(text,'x86_64',label='SYNTHETIC_FIXTURE'))
        report=q.html_report(a)
        self.assertNotIn('<script>alert(1)</script>',report)
        self.assertIn('&lt;script&gt;',report)
        self.assertIn(q.DOC,report)
        with tempfile.TemporaryDirectory() as temp:
            src=Path(temp)/'commands.txt';out=Path(temp)/'report.html';src.write_bytes(text.encode())
            before=src.read_bytes()
            with contextlib.redirect_stdout(io.StringIO()) as output:
                code=q.main([str(src),'--expect-arch','x86_64','--html',str(out)])
            self.assertEqual(code,0)
            self.assertEqual(src.read_bytes(),before)
            parsed=json.loads(output.getvalue());self.assertEqual(parsed['inputSha256'],hashlib.sha256(before).hexdigest())
            with contextlib.redirect_stderr(io.StringIO()),self.assertRaises(SystemExit):
                q.main([str(src),'--expect-arch','x86_64','--html',str(src)])
            with contextlib.redirect_stderr(io.StringIO()),self.assertRaises(SystemExit):
                q.main([str(src),'--expect-arch','x86_64','--html',str(out)])
            self.assertEqual(src.read_bytes(),before)

    def test_cli_exit_codes_are_static_findings_not_compiler_codes(self):
        with tempfile.TemporaryDirectory() as tmp:
            src=Path(tmp)/'in.txt'
            for line,code in [('qcc -Vgcc_ntox86_64 demo.c',1),('qcc demo.c',2),('qcc -Vgcc_ntoaarch64le demo.c',0),('',2)]:
                src.write_text(line,encoding='utf-8')
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(q.main([str(src),'--expect-arch','aarch64le']),code)

    def test_bom_and_crlf_original_byte_provenance(self):
        with tempfile.TemporaryDirectory() as tmp:
            src=Path(tmp)/'input.txt';original=b'\xef\xbb\xbfqcc -Vgcc_ntox86_64 demo.c\r\n';src.write_bytes(original)
            with contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(q.main([str(src),'--expect-arch','x86_64']),0)
            self.assertEqual(json.loads(output.getvalue())['inputSha256'],hashlib.sha256(original).hexdigest())
            self.assertEqual(src.read_bytes(),original)

if __name__=='__main__':
    unittest.main()
