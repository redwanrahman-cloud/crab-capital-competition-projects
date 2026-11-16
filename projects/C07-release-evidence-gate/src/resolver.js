import ResolverModule from '@forge/resolver';
import api, { route } from '@forge/api';
import { kvs, WhereConditions } from '@forge/kvs';
import { randomUUID } from 'node:crypto';
import { identity, snapshot, readiness, approve } from './domain.mjs';

// Forge's documented default import is bundler-oriented; native Node ESM sees
// the CommonJS module wrapper. Accept either without inventing a hosted runtime.
const Resolver = typeof ResolverModule === 'function' ? ResolverModule : ResolverModule.default;
const resolver = new Resolver();
const fields = 'summary,description,status,updated,fixVersions,issuelinks';
async function readIssue(id) {
  const response = await api.asUser().requestJira(route`/rest/api/3/issue/${id}?fields=${fields}`);
  if (!response.ok) throw new Error('Evidence unavailable');
  const issue = await response.json();
  return { id: issue.id, key: issue.key, summary: issue.fields.summary,
    description: issue.fields.description, status: issue.fields.status?.id,
    updated: issue.fields.updated, fixVersions: issue.fields.fixVersions,
    links: issue.fields.issuelinks };
}
async function load(context) {
  const issueId = context.extension?.issue?.id;
  if (!context.accountId || !context.cloudId || !issueId) throw new Error('Authenticated Jira issue context required');
  const releaseId = identity(context.cloudId, issueId);
  const release = await readIssue(issueId); // Never read historical data before current access succeeds.
  const evidence = [];
  for (const link of release.links ?? []) {
    const target = link.outwardIssue ?? link.inwardIssue;
    if (!target?.id) { evidence.push({ requirementId: String(link.id), state: 'UNKNOWN' }); continue; }
    try {
      const issue = await readIssue(target.id);
      // Nested links are not part of this first slice's selected evidence fields.
      delete issue.links;
      evidence.push({ requirementId: String(link.id), state: 'AVAILABLE', issue });
    } catch { evidence.push({ requirementId: String(link.id), state: 'UNKNOWN' }); }
  }
  return snapshot(releaseId, release, evidence);
}
async function history(releaseId) {
  let cursor;
  const rows = [];
  do {
    let query = kvs.query().where('key', WhereConditions.beginsWith(`approval:${releaseId}:`)).limit(20);
    if (cursor) query = query.cursor(cursor);
    const page = await query.getMany();
    rows.push(...page.results.map(row => row.value));
    cursor = page.nextCursor;
  } while (cursor);
  return rows;
}
resolver.define('refresh', async ({ context }) => {
  const current = await load(context);
  const state = readiness(current, await history(current.releaseId));
  // Permission revocation must never leak old snapshots to the current viewer.
  if (state.state === 'UNKNOWN') return { current, state: 'UNKNOWN', approvals: [] };
  const accessible = new Set(current.requirements.map(x => x.issue.id));
  // Removed links may refer to issues this viewer can no longer read. Preserve
  // stored originals, but return old field values only for currently readable IDs.
  const approvals = state.history.map(event => ({ ...event, snapshot: {
    revision: event.snapshot.revision,
    requirements: event.snapshot.requirements.map(item => accessible.has(item.issue?.id)
      ? item : { requirementId: item.requirementId, state: 'UNKNOWN' })
  } }));
  return { current, state: state.state, approvals };
});
resolver.define('approve', async ({ context, payload }) => {
  const current = await load(context); // Reject stale browser revision after fresh server-side retrieval.
  const event = approve({ current, expectedRevision: payload.expectedRevision,
    accountId: context.accountId, deliberate: payload.deliberate,
    at: new Date().toISOString(), eventId: randomUUID() });
  // Unique immutable keys avoid lost approval history from simultaneous reviewers.
  await kvs.set(`approval:${current.releaseId}:${event.eventId}`, event);
  return { recorded: true };
});
export const handler = resolver.getDefinitions();
