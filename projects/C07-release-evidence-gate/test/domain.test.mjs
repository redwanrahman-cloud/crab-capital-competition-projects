import test from 'node:test';
import assert from 'node:assert/strict';
import { identity, snapshot, readiness, approve, appendApproval, resetRelease, utcInstant } from '../src/domain.mjs';

const releaseId = identity('site-a', '100');
const release = { id: '100', summary: 'Release 1', updated: '2026-11-15T10:00:00Z', fixVersions: [{ id: '1' }] };
const item = { requirementId: 'link-1', state: 'AVAILABLE', issue: { id: '200', key: 'TEST-2', summary: 'Reviewed tests', updated: '2026-11-15T10:00:00Z', description: null, status: 'done' } };
const current = () => snapshot(releaseId, release, [item]);
const sign = (s = current(), extra = {}) => approve({ current: s, expectedRevision: s.revision, accountId: 'human-1', deliberate: true, at: '2026-11-15T13:00:00+03:00', eventId: 'event-1', ...extra });

test('complete evidence alone never grants approval', () => {
  assert.equal(readiness(current()).state, 'NEEDS_HUMAN_APPROVAL');
});
test('no requirements or unavailable requirement remains UNKNOWN; cannot sign', () => {
  for (const requirements of [[], [{ requirementId: 'missing', state: 'MISSING' }], [{ requirementId: 'denied', state: 'INACCESSIBLE' }]]) {
    const s = snapshot(releaseId, release, requirements);
    assert.equal(readiness(s).state, 'UNKNOWN');
    assert.throws(() => sign(s), /Missing or inaccessible/);
  }
});
test('human identity, deliberate action and exact reviewed revision required', () => {
  assert.throws(() => sign(current(), { accountId: '' }), /human action/);
  assert.throws(() => sign(current(), { deliberate: false }), /human action/);
  assert.throws(() => sign(current(), { expectedRevision: 'old' }), /changed/);
});
test('evidence change preserves approval bytes and classifies STALE', () => {
  const approval = sign(); const before = JSON.stringify(approval);
  const changed = snapshot(releaseId, release, [{ ...item, issue: { ...item.issue, updated: '2026-11-15T10:01:00Z' } }]);
  assert.equal(readiness(changed, [approval]).state, 'STALE');
  assert.equal(JSON.stringify(approval), before);
  assert.equal(readiness(changed, [approval, sign(changed, { eventId: 'event-2' })]).state, 'APPROVED');
});
test('same version replay is stable; content change with unchanged updated is stale', () => {
  const approval = sign();
  assert.equal(readiness(current(), [approval]).state, 'APPROVED');
  assert.equal(appendApproval([approval], approval).length, 1);
  assert.throws(() => appendApproval([approval], { ...approval, accountId: 'other' }), /Conflicting/);
  const changed = snapshot(releaseId, release, [{ ...item, issue: { ...item.issue, summary: 'Changed without timestamp change' } }]);
  assert.equal(readiness(changed, [approval]).state, 'STALE');
});
test('revision digest ignores object insertion order, binds release versions and requirement set', () => {
  const reordered = snapshot(releaseId, { fixVersions: release.fixVersions, updated: release.updated, summary: release.summary, id: release.id }, [item]);
  assert.equal(reordered.revision, current().revision);
  assert.notEqual(snapshot(releaseId, { ...release, fixVersions: [{ id: '2' }] }, [item]).revision, current().revision);
  assert.notEqual(snapshot(releaseId, release, [item, { ...item, requirementId: 'link-2' }]).revision, current().revision);
});
test('audit is UTC and timezone-free timestamps fail closed', () => {
  assert.equal(sign().at, '2026-11-15T10:00:00.000Z');
  assert.equal(utcInstant('2026-11-15T05:00:00-05:00'), sign().at);
  assert.throws(() => sign(current(), { at: '2026-11-15T10:00:00' }), /timezone/);
});
test('release/site/reset identities never inherit prior approval', () => {
  const approval = sign();
  for (const id of [identity('site-b', '100'), identity('site-a', '101'), resetRelease('site-a', '100', 'initial', 'reset-1')]) {
    assert.equal(readiness(snapshot(id, release, [item]), [approval]).state, 'NEEDS_HUMAN_APPROVAL');
  }
  assert.throws(() => resetRelease('site-a', '100', 'initial', 'initial'), /new release generation/);
});
test('missing evidence takes precedence over previously approved status', () => {
  const unknown = snapshot(releaseId, release, [{ requirementId: 'link-1', state: 'UNKNOWN' }]);
  assert.equal(readiness(unknown, [sign()]).state, 'UNKNOWN');
});
test('approval snapshot is detached from future input edits', () => {
  const s = current(); const approval = sign(s);
  s.requirements[0].issue.summary = 'Later mutation';
  assert.equal(approval.snapshot.requirements[0].issue.summary, 'Reviewed tests');
});
