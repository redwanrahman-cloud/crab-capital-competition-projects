import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Button, Text, Stack, Heading } from '@forge/react';
import { invoke } from '@forge/bridge';

function App() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function refresh() {
    setBusy(true); setError(''); setData(null);
    try { setData(await invoke('refresh')); }
    catch { setError('UNKNOWN: current evidence could not be read. No approval is available.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { refresh(); }, []);
  async function sign() {
    setBusy(true); setError('');
    try { await invoke('approve', { expectedRevision: data.current.revision, deliberate: true }); await refresh(); }
    catch { setData(null); setError('Approval not confirmed. Refresh and review current evidence before trying again.'); }
    finally { setBusy(false); }
  }
  return <Stack space="space.100">
    <Heading as="h2">Release Evidence Gate</Heading>
    <Text>Human readiness recommendation. Each linked Jira issue is a required evidence item. This panel does not enforce release transitions.</Text>
    <Button onClick={refresh} isDisabled={busy}>Refresh evidence</Button>
    {error && <Text>{error}</Text>}
    {data && <>
      <Text>{`Readiness: ${data.state}`}</Text>
      <Text>{`Review revision: ${data.current.revision}`}</Text>
      <Text>{`Release fields in this revision: ${JSON.stringify(data.current.release)}`}</Text>
      {!data.current.requirements.length && <Text>No requirements linked. Readiness is UNKNOWN.</Text>}
      {data.current.requirements.map(item => <Text key={item.requirementId}>{item.state === 'AVAILABLE' ? `${item.issue.key}: ${item.issue.summary}; updated ${item.issue.updated}` : 'Required evidence is missing or inaccessible.'}</Text>)}
      {data.current.requirements.filter(item => item.state === 'AVAILABLE').map(item => <Text key={`fields-${item.requirementId}`}>{`Evidence fields: ${JSON.stringify(item.issue)}`}</Text>)}
      <Button isDisabled={busy || data.state === 'UNKNOWN'} onClick={sign}>I reviewed and approve this evidence revision</Button>
      {data.approvals.map(event => <Stack key={event.eventId} space="space.050">
        <Text>{`${event.snapshot.revision === data.current.revision ? 'Current approval' : 'STALE approval preserved'}: ${event.accountId} at ${event.at}`}</Text>
        {event.snapshot.requirements.map(old => <Text key={old.requirementId}>{old.issue ? `Approved fields: ${JSON.stringify(old.issue)}` : 'Historical fields withheld: this issue is not currently accessible in the requirement set.'}</Text>)}
      </Stack>)}
    </>}
  </Stack>;
}
ForgeReconciler.render(<App />);
