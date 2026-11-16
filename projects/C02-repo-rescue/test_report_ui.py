"""Presentation invariants: preserve evidence, escaping and plan-only semantics."""
from html.parser import HTMLParser
import unittest
import repo_rescue as rr


class Elements(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags = []
        self.attrs = []
    def handle_starttag(self, tag, attrs):
        self.tags.append(tag)
        self.attrs.extend(attrs)


class EvidenceDeskTests(unittest.TestCase):
    def report(self):
        return {'current': 'current', 'snapshot': 'snapshot',
                'counts': dict(added=1, modified=1, missing=1, identical=1),
                'files': [dict(path=f'{state}.txt', status=state,
                               current_sha256=None if state == 'missing' else 'a'*64,
                               snapshot_sha256=None if state == 'added' else 'b'*64)
                          for state in ('added', 'modified', 'missing', 'identical')],
                'restoration_plan': [dict(path='changed.txt', proposal='PROPOSE_REPLACE_FROM_SNAPSHOT_AFTER_BACKUP',
                                          expected_current_sha256='a'*64, proposed_snapshot_sha256='b'*64)],
                'snapshot_trust': 'User-supplied; authenticity not established by hashes',
                'verification': 'Two complete scans', 'limitations': 'Quiescent inputs required'}

    def test_evidence_and_plan_only_remain_visible(self):
        report = self.report()
        rendered = rr.render_html(report)
        for text in ('PLAN ONLY — NO RESTORE', 'no restore command', 'Missing', 'Changed', 'Extra', 'Unchanged',
                     'PROPOSE_REPLACE_FROM_SNAPSHOT_AFTER_BACKUP', 'a'*64, 'b'*64,
                     report['snapshot_trust'], report['limitations']):
            self.assertIn(text, rendered)
        for row in report['files']:
            self.assertIn(row['path'], rendered)
        self.assertIn('scope="row"', rendered)
        self.assertIn('overflow:auto', rendered)

    def test_no_active_controls_or_external_assets_and_escape_every_text_surface(self):
        report = self.report()
        hostile = '<script src="https://example.invalid/x">&'
        report['current'] = hostile
        report['restoration_plan'][0]['path'] = hostile
        report['restoration_plan'][0]['proposal'] = hostile
        rendered = rr.render_html(report)
        parsed = Elements()
        parsed.feed(rendered)
        self.assertFalse(set(parsed.tags) & {'script', 'form', 'button', 'input', 'iframe', 'img', 'link'})
        self.assertNotIn(hostile, rendered)
        self.assertIn('&lt;script', rendered)
        self.assertTrue(all(v == '#files' for k, v in parsed.attrs if k == 'href'))
        self.assertIn("default-src 'none'", rendered)


if __name__ == '__main__':
    unittest.main()
