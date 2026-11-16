import { createHash } from 'node:crypto';

const clone = value => structuredClone(value);
const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
export function identity(siteId, issueId, generation = 'initial') {
  if (![siteId, issueId, generation].every(x => typeof x === 'string' && x.length > 0)) throw new Error('Release identity required');
  return digest({ siteId, issueId, generation });
}
export function utcInstant(value) {
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:?\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Explicit timezone required');
  return new Date(value).toISOString();
}
// Evidence requirements are the release issue's explicit Jira links, not inferred test success.
export function snapshot(releaseId, release, evidence) {
  if (!releaseId || !release?.id || !release?.updated || !Array.isArray(evidence)) throw new Error('Invalid snapshot');
  const requirements = evidence.map(item => {
    if (!item?.requirementId) throw new Error('Requirement identity required');
    if (item.state !== 'AVAILABLE') return { requirementId: item.requirementId, state: 'UNKNOWN' };
    if (!item.issue?.id || !item.issue?.updated || typeof item.issue?.summary !== 'string') throw new Error('Incomplete evidence');
    return { requirementId: item.requirementId, state: 'AVAILABLE', issue: clone(item.issue) };
  }).sort((a, b) => a.requirementId.localeCompare(b.requirementId));
  if (new Set(requirements.map(x => x.requirementId)).size !== requirements.length) throw new Error('Duplicate requirement');
  const value = { releaseId, release: clone(release), requirements };
  return { ...value, revision: digest(value) };
}
export function readiness(current, approvals = []) {
  const history = approvals.filter(a => a.releaseId === current.releaseId && a.action === 'HUMAN_APPROVED');
  const stale = history.filter(a => a.snapshot.revision !== current.revision);
  if (!current.requirements.length || current.requirements.some(x => x.state !== 'AVAILABLE')) return { state: 'UNKNOWN', history, stale };
  const match = history.filter(a => a.snapshot.revision === current.revision);
  return { state: match.length ? 'APPROVED' : history.length ? 'STALE' : 'NEEDS_HUMAN_APPROVAL', history, stale };
}
export function approve({ current, expectedRevision, accountId, deliberate, at, eventId }) {
  if (!accountId || deliberate !== true || !eventId) throw new Error('Deliberate authenticated human action required');
  if (current.revision !== expectedRevision) throw new Error('Evidence changed; refresh and review again');
  if (readiness(current).state === 'UNKNOWN') throw new Error('Missing or inaccessible evidence');
  return { eventId, action: 'HUMAN_APPROVED', releaseId: current.releaseId, accountId, at: utcInstant(at), snapshot: clone(current) };
}
export function appendApproval(history, event) {
  const existing = history.find(x => x.eventId === event.eventId);
  if (existing && canonical(existing) !== canonical(event)) throw new Error('Conflicting event replay');
  return existing ? clone(history) : [...clone(history), clone(event)];
}
export function resetRelease(siteId, issueId, previousGeneration, nextGeneration) {
  if (!nextGeneration || nextGeneration === previousGeneration) throw new Error('Reset requires a new release generation');
  return identity(siteId, issueId, nextGeneration);
}
