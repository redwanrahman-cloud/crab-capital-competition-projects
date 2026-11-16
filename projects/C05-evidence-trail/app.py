"""Evidence Trail: local synthetic source-change review, backed only by Relate."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlsplit
import argparse
import json
import os
import relate

ROOT = Path(__file__).resolve().parent
os.environ['RELATE_SNAPSHOT_FORMAT'] = 'json'


def digest(value):
    return sha256(value.encode('utf-8')).hexdigest()


class Conflict(ValueError):
    pass


class Trail:
    def __init__(self, path):
        self.db = relate.connect(str(path))
        self.db.autocommit = False
        if not self.q('MATCH (s:Source) RETURN s.id AS id'):
            self.seed()
        self.db.commit()

    def q(self, query, **params):
        return self.db.execute(query, params).data()

    def close(self):
        self.db.commit()
        self.db.close()

    def seed(self):
        for sid, text in [('A', 'Synthetic cache evaluation: median latency was 12 ms.'),
                          ('B', 'Synthetic repeat evaluation: median latency was 21 ms.'),
                          ('Z', 'Synthetic documentation check: sample code compiles.')]:
            rid = sid + ':' + digest(text)
            self.q('CREATE (:Source {id:$id, current:$rid})', id=sid, rid=rid)
            self.q('CREATE (:SourceRevision {id:$id, source:$source, text:$text, hash:$hash, number:1})',
                   id=rid, source=sid, text=text, hash=digest(text))
        for cid, text in [('C1', 'The synthetic cache meets the 15 ms target.'),
                          ('C2', 'The synthetic cache is ready for a wider trial.'),
                          ('C3', 'The synthetic code example compiles.')]:
            self.q('CREATE (:Claim {id:$id, kind:"claim", text:$text, judgment:$judgment})',
                   id=cid, text=text, judgment='Initial illustrative judgment; no truth determination.')
        for did, text in [('D1', 'Plan a synthetic wider cache trial.'),
                          ('D2', 'Keep the synthetic latency target.'),
                          ('D3', 'Keep the synthetic documentation example.')]:
            self.q('CREATE (:Decision {id:$id, kind:"decision", text:$text, judgment:$judgment})',
                   id=did, text=text, judgment='Initial illustrative decision; not a real recommendation.')
        for sid, cid, rel in [('A', 'C1', 'SUPPORTS'), ('B', 'C1', 'CONTRADICTS'), ('Z', 'C3', 'SUPPORTS')]:
            rev = self.q('MATCH (r:SourceRevision {source:$source}) RETURN r.id AS id, r.text AS text', source=sid)[0]
            self.q(f'MATCH (r:SourceRevision {{id:$rid}}), (c:Claim {{id:$cid}}) CREATE (r)-[:{rel} {{quote:$quote, start:0, end:$end}}]->(c)',
                   rid=rev['id'], cid=cid, quote=rev['text'], end=len(rev['text']))
        for dependent, claim in [('C2', 'C1'), ('D1', 'C2'), ('D2', 'C1'), ('D3', 'C3')]:
            self.q('MATCH (n {id:$dependent}), (c:Claim {id:$claim}) CREATE (n)-[:DEPENDS_ON]->(c)',
                   dependent=dependent, claim=claim)

    def snapshot(self):
        sources = self.q('MATCH (s:Source), (r:SourceRevision) WHERE s.current = r.id RETURN s.id AS id, r.id AS current, r.text AS text, r.number AS number ORDER BY id')
        baseline = digest(json.dumps(sources, sort_keys=True))
        revisions = self.q('MATCH (r:SourceRevision) RETURN r.id AS id, r.source AS source, r.text AS text, r.hash AS hash, r.number AS number ORDER BY source, number')
        evidence = self.q('MATCH (r:SourceRevision)-[e]->(c:Claim) RETURN r.id AS revision, r.source AS source, c.id AS claim, type(e) AS relationship, e.quote AS quote, e.start AS start, e.end AS end ORDER BY source')
        # This is the actual transitive dependency traversal in the Relate engine.
        impact_query = ('MATCH (s:Source), (r:SourceRevision)-[e]->(c:Claim) '
                        'MATCH (c)<-[:DEPENDS_ON*0..8]-(n) '
                        'WHERE s.id = r.source AND s.current <> r.id '
                        'RETURN DISTINCT s.id AS source, r.id AS prior_revision, s.current AS current_revision, '
                        'c.id AS direct_claim, n.id AS affected, n.kind AS kind ORDER BY source, affected')
        impact = self.q(impact_query)
        nodes = self.q('MATCH (n) WHERE n.kind = "claim" OR n.kind = "decision" RETURN n.id AS id, n.kind AS kind, n.text AS text, n.judgment AS judgment ORDER BY id')
        reviews = self.q('MATCH (r:Review) RETURN r.id AS id, r.target AS target, r.baseline AS baseline, r.note AS note, r.time AS time, r.revisions AS revision_ids ORDER BY time')
        for review in reviews:
            # Older reviews retained only a fingerprint. Never reconstruct a
            # historical acknowledgment from the graph's present source state.
            encoded = review.pop('revision_ids', None)
            review['revisions'] = json.loads(encoded) if encoded else None
        for node in nodes:
            node['affected'] = any(row['affected'] == node['id'] for row in impact)
            matching = [r for r in reviews if r['target'] == node['id'] and r['baseline'] == baseline]
            node['status'] = 'Human reviewed current revisions' if matching else ('Needs review' if node['affected'] else 'No source change detected; not reviewed here')
        self.db.commit()
        return dict(sources=sources, revisions=revisions, evidence=evidence, impact=impact,
                    nodes=nodes, reviews=reviews, baseline=baseline, impact_query=impact_query,
                    dependencies=self.q('MATCH (n)-[:DEPENDS_ON]->(c) RETURN n.id AS dependent, c.id AS claim ORDER BY dependent'))

    def revise(self, source, text, expected):
        if not isinstance(text, str) or not text.strip() or len(text) > 8000:
            raise ValueError('Enter 1–8000 characters of synthetic technical source text.')
        try:
            rows = self.q('MATCH (s:Source {id:$id}) RETURN s.current AS current', id=source)
            if not rows:
                raise ValueError('Unknown synthetic source.')
            current = rows[0]['current']
            if expected != current:
                raise Conflict('Source changed since this view; refresh before updating.')
            rid = source + ':' + digest(text)
            if rid == current:
                self.db.commit()
                return {'duplicate': True, 'revision': rid}
            if self.q('MATCH (r:SourceRevision {id:$id}) RETURN r.id AS id', id=rid):
                raise Conflict('This exact text is already a historical revision; no rewind performed.')
            number = self.q('MATCH (r:SourceRevision {id:$id}) RETURN r.number AS number', id=current)[0]['number'] + 1
            self.q('CREATE (:SourceRevision {id:$id, source:$source, text:$text, hash:$hash, number:$number})',
                   id=rid, source=source, text=text, hash=digest(text), number=number)
            self.q('MATCH (s:Source {id:$id}) SET s.current=$current', id=source, current=rid)
            self.db.commit()
            return {'duplicate': False, 'revision': rid}
        except Exception:
            self.db.rollback()
            raise

    def review(self, target, baseline, note):
        state = self.snapshot()
        if baseline != state['baseline']:
            raise Conflict('Source revisions changed. Inspect the current evidence before reviewing.')
        if target not in {n['id'] for n in state['nodes']}:
            raise ValueError('Unknown review target.')
        if not isinstance(note, str) or not note.strip() or len(note) > 2000:
            raise ValueError('Enter a review note of 1–2000 characters.')
        now = datetime.now(timezone.utc).isoformat()
        try:
            revision_ids = [{'source': s['id'], 'revision': s['current']} for s in state['sources']]
            self.q('CREATE (:Review {id:$id, target:$target, baseline:$baseline, note:$note, time:$time, revisions:$revisions})',
                   id=digest(target + now), target=target, baseline=baseline, note=note, time=now,
                   revisions=json.dumps(revision_ids, sort_keys=True))
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise


def server(path, port):
    trail = Trail(path)
    class Handler(BaseHTTPRequestHandler):
        def respond(self, status, value, content_type='application/json; charset=utf-8'):
            body = value if isinstance(value, bytes) else json.dumps(value).encode()
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'")
            self.end_headers()
            self.wfile.write(body)

        def trusted_host(self):
            return self.headers.get('Host') == f'127.0.0.1:{self.server.server_port}'

        def do_GET(self):
            if not self.trusted_host():
                return self.respond(403, {'error': 'Use the loopback URL printed by the launcher.'})
            route = urlsplit(self.path).path
            if route == '/api/state':
                return self.respond(200, trail.snapshot())
            assets = {'/': ('index.html', 'text/html; charset=utf-8'), '/app.js': ('app.js', 'text/javascript; charset=utf-8'), '/style.css': ('style.css', 'text/css; charset=utf-8')}
            if route not in assets:
                return self.respond(404, {'error': 'Not found'})
            filename, kind = assets[route]
            self.respond(200, (ROOT / 'web' / filename).read_bytes(), kind)

        def do_POST(self):
            origin = f'http://127.0.0.1:{self.server.server_port}'
            if not self.trusted_host() or self.headers.get('Origin') != origin or self.headers.get('Sec-Fetch-Site', 'same-origin') != 'same-origin':
                return self.respond(403, {'error': 'Same-origin local browser requests only.'})
            if self.path not in ('/api/revise', '/api/review'):
                return self.respond(404, {'error': 'Not found'})
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 40000 or self.headers.get('Content-Type') != 'application/json':
                    return self.respond(400, {'error': 'Expected bounded JSON request.'})
                data = json.loads(self.rfile.read(length))
                if self.path == '/api/revise':
                    result = trail.revise(data['source'], data['text'], data['expected'])
                else:
                    trail.review(data['target'], data['baseline'], data['note'])
                    result = {'saved': True}
                self.respond(200, result)
            except Conflict as exc:
                self.respond(409, {'error': str(exc)})
            except (ValueError, KeyError, TypeError) as exc:
                self.respond(400, {'error': str(exc)})
            except Exception:
                trail.db.rollback()
                self.respond(500, {'error': 'Local graph operation failed; inspect terminal.'})
                raise
    httpd = HTTPServer(('127.0.0.1', port), Handler)
    httpd.trail = trail
    return httpd


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--store', type=Path, default=ROOT / 'data' / 'trail')
    args = parser.parse_args()
    args.store.parent.mkdir(parents=True, exist_ok=True)
    httpd = server(args.store, args.port)
    print(f'Evidence Trail: http://127.0.0.1:{httpd.server_port} (Ctrl+C to stop)', flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
        httpd.trail.close()
