"""Meaningful integration checks against the real installed Relate engine."""
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from queue import Queue
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import json
import unittest
from app import Trail, Conflict, server


class GraphTest(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.path = Path(self.temp.name) / 'graph'
        self.trail = Trail(self.path)

    def tearDown(self):
        self.trail.close()
        self.temp.cleanup()

    def change(self, text='Synthetic cache evaluation: median latency was 24 ms.'):
        state = self.trail.snapshot()
        return self.trail.revise('A', text, state['sources'][0]['current'])

    def test_transitive_impact_immutable_quotes_and_durable_reopen(self):
        before = self.trail.snapshot()
        self.assertEqual(before['impact'], [])
        self.change()
        after = self.trail.snapshot()
        self.assertEqual({p['affected'] for p in after['impact']}, {'C1', 'C2', 'D1', 'D2'})
        self.assertNotIn('D3', {p['affected'] for p in after['impact']})
        self.assertEqual(before['evidence'], after['evidence'])
        self.assertEqual(before['revisions'][0], after['revisions'][0])
        self.assertEqual({n['id']:n['judgment'] for n in before['nodes']}, {n['id']:n['judgment'] for n in after['nodes']})
        for edge in after['evidence']:
            revision = next(r for r in after['revisions'] if r['id'] == edge['revision'])
            self.assertEqual(revision['text'][edge['start']:edge['end']], edge['quote'])
        self.assertEqual({e['relationship'] for e in after['evidence']}, {'SUPPORTS', 'CONTRADICTS'})
        self.trail.close()
        self.trail = Trail(self.path)
        reopened = self.trail.snapshot()
        for field in ('sources', 'revisions', 'evidence', 'impact', 'nodes'):
            self.assertEqual(after[field], reopened[field])

    def test_duplicates_stale_edits_and_history_do_not_rewind(self):
        before = self.trail.snapshot()
        source = before['sources'][0]
        self.assertTrue(self.trail.revise('A', source['text'], source['current'])['duplicate'])
        self.assertEqual(len(self.trail.snapshot()['revisions']), 3)
        self.change()
        with self.assertRaises(Conflict):
            self.trail.revise('A', 'Synthetic stale edit', source['current'])
        current = self.trail.snapshot()['sources'][0]
        with self.assertRaises(Conflict):
            self.trail.revise('A', source['text'], current['current'])
        self.assertEqual(self.trail.snapshot()['sources'][0], current)
        self.assertEqual(len(self.trail.snapshot()['revisions']), 4)

    def test_review_is_explicit_revision_bound_and_historical(self):
        before = self.trail.snapshot()
        self.change()
        with self.assertRaises(Conflict):
            self.trail.review('D1', before['baseline'], 'Stale screen')
        state = self.trail.snapshot()
        self.trail.review('D1', state['baseline'], 'Checked updated latency; defer the synthetic trial.')
        reviewed = self.trail.snapshot()
        self.assertEqual(reviewed['reviews'][0]['revisions'],
                         [{'source': s['id'], 'revision': s['current']} for s in state['sources']])
        self.assertEqual(next(n for n in reviewed['nodes'] if n['id']=='D1')['status'], 'Human reviewed current revisions')
        self.assertEqual(next(n for n in reviewed['nodes'] if n['id']=='D2')['status'], 'Needs review')
        self.change('Synthetic cache evaluation: median latency was 30 ms.')
        state = self.trail.snapshot()
        self.assertEqual(next(n for n in state['nodes'] if n['id']=='D1')['status'], 'Needs review')
        self.assertEqual(state['reviews'], reviewed['reviews'])
        self.trail.close()
        self.trail = Trail(self.path)
        self.assertEqual(self.trail.snapshot()['reviews'], state['reviews'])

    def test_legacy_review_binding_is_unknown_without_rewriting(self):
        state = self.trail.snapshot()
        self.trail.q('CREATE (:Review {id:"legacy", target:"D1", baseline:$baseline, note:"Original note", time:"2026-11-15T00:00:00Z"})',
                     baseline=state['baseline'])
        self.trail.db.commit()
        self.assertIsNone(self.trail.snapshot()['reviews'][0]['revisions'])
        self.change()
        review = self.trail.snapshot()['reviews'][0]
        self.assertIsNone(review['revisions'])
        self.assertEqual(review['note'], 'Original note')
        self.assertEqual(review['baseline'], state['baseline'])


class LocalBoundaryTest(unittest.TestCase):
    def test_http_origin_host_allowlist_and_real_mutation(self):
        with TemporaryDirectory() as directory:
            ready = Queue()
            def run_server():
                httpd = server(Path(directory)/'graph', 0)
                ready.put(httpd)
                try:
                    httpd.serve_forever()
                finally:
                    httpd.server_close()
                    httpd.trail.close()
            thread = Thread(target=run_server)
            thread.start()
            httpd = ready.get(timeout=10)
            base = f'http://127.0.0.1:{httpd.server_port}'
            def request(path, payload=None, headers=None):
                req = Request(base+path, data=json.dumps(payload).encode() if payload is not None else None,
                              headers=headers or {})
                try:
                    with urlopen(req, timeout=5) as res:
                        return res.status, res.read(), dict(res.headers)
                except HTTPError as exc:
                    return exc.code, exc.read(), dict(exc.headers)
            try:
                code, body, _ = request('/api/state')
                self.assertEqual(code,200)
                state = json.loads(body)
                payload={'source':'A','text':'Synthetic HTTP revision: 24 ms.','expected':state['sources'][0]['current']}
                for origin in (None, 'http://evil.example', 'null'):
                    headers={'Content-Type':'application/json'}
                    if origin: headers['Origin']=origin
                    self.assertEqual(request('/api/revise',payload,headers)[0],403)
                self.assertEqual(request('/api/revise', payload, {'Content-Type':'application/json','Origin':base,'Sec-Fetch-Site':'cross-site'})[0],403)
                self.assertEqual(json.loads(request('/api/state')[1])['baseline'],state['baseline'])
                self.assertEqual(request('/api/revise',payload,{'Content-Type':'application/json','Origin':base})[0],200)
                changed=json.loads(request('/api/state')[1])
                self.assertEqual({p['affected'] for p in changed['impact']},{'C1','C2','D1','D2'})
                for path in ('/../app.py','/%2e%2e/app.py','/.venv/pyvenv.cfg','/data/trail','/app.py'):
                    self.assertEqual(request(path)[0],404)
                self.assertEqual(request('/api/state',headers={'Host':'evil.example'})[0],403)
                code, html, headers=request('/')
                self.assertEqual(code,200)
                self.assertIn(b'Evidence Trail', html)
                self.assertIn("frame-ancestors 'none'", headers['Content-Security-Policy'])
            finally:
                httpd.shutdown()
                thread.join(timeout=5)


if __name__ == '__main__':
    unittest.main(verbosity=2)
