"""First genuine Relate dependency proof; synthetic content, no AI/provider calls."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
from importlib.metadata import version
import json
import os
import uuid
import relate


def digest(text):
    return sha256(text.encode()).hexdigest()


def prove(directory):
    os.environ['RELATE_SNAPSHOT_FORMAT'] = 'json'
    store = str(directory / 'graph')
    original = digest('Synthetic source A revision 1: trial completed.')
    replacement = digest('Synthetic source A revision 2: trial withdrawn.')
    other = digest('Synthetic source B revision 1: contradictory result.')
    with relate.connect(store) as graph:
        graph.execute('CREATE (:Source {id:$id, current_hash:$hash})',
                      {'id': 'A', 'hash': original})
        graph.execute('CREATE (:Source {id:$id, current_hash:$hash})',
                      {'id': 'B', 'hash': other})
        graph.execute('CREATE (:Claim {id:$id, text:$text})',
                      {'id': 'C1', 'text': 'Synthetic intervention is effective.'})
        for source, relation, captured in [('A', 'SUPPORTS', original), ('B', 'CONTRADICTS', other)]:
            # Relationship labels come exclusively from the fixed internal tuple.
            graph.execute(
                f'MATCH (s:Source {{id:$source}}), (c:Claim {{id:$claim}}) '
                f'CREATE (s)-[:{relation} {{captured_hash:$hash}}]->(c)',
                {'source': source, 'claim': 'C1', 'hash': captured})
        before = graph.execute(
            'MATCH (s:Source)-[e]->(c:Claim) '
            'RETURN s.id AS source, type(e) AS relationship, '
            'e.captured_hash AS captured_hash, s.current_hash AS current_hash, c.id AS claim '
            'ORDER BY source').data()
        assert len(before) == 2
        assert {row['relationship'] for row in before} == {'SUPPORTS', 'CONTRADICTS'}
        graph.execute('MATCH (s:Source {id:$id}) SET s.current_hash=$hash',
                      {'id': 'A', 'hash': replacement})
        affected = graph.execute(
            'MATCH (s:Source)-[e]->(c:Claim) WHERE e.captured_hash <> s.current_hash '
            'RETURN s.id AS source, c.id AS claim, e.captured_hash AS prior_hash, '
            's.current_hash AS new_hash').data()
        assert len(affected) == 1 and affected[0]['source'] == 'A'
        assert affected[0]['prior_hash'] == original
        assert affected[0]['new_hash'] == replacement
    with relate.connect(store, read_only=True) as reopened:
        after = reopened.execute(
            'MATCH (s:Source)-[e]->(c:Claim) WHERE e.captured_hash <> s.current_hash '
            'RETURN s.id AS source, c.id AS claim').data()
        assert after == [{'source': 'A', 'claim': 'C1'}]
    receipt = {
        'status': 'PASS', 'recorded_at': datetime.now(timezone.utc).isoformat(),
        'engine': 'relate-db', 'version': version('relate-db'),
        'content': 'SYNTHETIC; no real-world claim validity asserted',
        'relationships_before': before, 'source_change_impact': affected,
        'reopened_impact': after, 'queries_executed_by_real_relate': True,
        'limitations': ['Not a finished UI', 'Not an AI integration',
                       'Not competition registration or acceptance',
                       'No automated evidence truth judgment'],
    }
    (directory / 'receipt.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    return receipt


if __name__ == '__main__':
    target = Path(__file__).parent / 'evidence' / ('proof-' + uuid.uuid4().hex[:12])
    target.mkdir(parents=True)
    receipt = prove(target)
    print(json.dumps({'status': receipt['status'], 'engine': receipt['engine'],
                      'version': receipt['version'], 'relationships': 2,
                      'changed_sources': 1, 'reopen_passed': True,
                      'receipt': str(target / 'receipt.json')}))
