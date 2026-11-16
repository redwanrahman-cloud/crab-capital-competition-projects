import { DraftDesk } from './desk.mjs';
import { createBrowserRuntime, deviceAvailability, CLOUD_MODEL } from './runtime.mjs';
import { safeFailureText } from './diagnostics.mjs';
const desk = new DraftDesk(), el = id => document.getElementById(id);
let runtime = null, setupBusy = false, deviceReady = false, allowDebug = false;
const status = text => { el('status').textContent = text; };
function refresh() {
  const s = desk.state, busy = s.busy || setupBusy;
  el('original').textContent = s.original ?? 'No original preserved yet.';
  el('preview').textContent = s.preview;
  el('source').readOnly = s.original !== null || busy;
  el('preserve').disabled = s.original !== null || busy;
  el('draft').disabled = s.original === null || busy;
  el('excerpt').disabled = busy;
  el('initialize-device').disabled = !runtime || busy || deviceReady;
  el('rewrite-local').disabled = !deviceReady || s.original === null || busy;
  el('approve-cloud').disabled = !s.cloudReady || s.original === null || !s.excerpt.trim() || busy;
  el('approve-cloud').checked = s.approved;
  el('send-cloud').disabled = !s.approved || !s.cloudReady || busy;
  el('debug-token').disabled = !allowDebug || busy || runtime?.cloudReady;
  el('configure-cloud').disabled = !allowDebug || busy || runtime?.cloudReady || !el('debug-token').value;
  el('result').textContent = s.result?.text ?? 'No model response.';
  el('inference-source').textContent = s.result ? `SDK inferenceSource: ${s.result.inferenceSource}` : 'No inference source reported yet.';
}
function safeFailure(phase, error) {
  status(safeFailureText(phase, error));
}
el('preserve').addEventListener('click', () => {
  try { desk.preserveOriginal(el('source').value); el('draft').value = desk.state.draft; status('Original preserved in this tab. Your working draft is separate.'); }
  catch (error) { status(error.message); } refresh();
});
for (const [id, edit] of [['draft', text => desk.editDraft(text)], ['excerpt', text => desk.editExcerpt(text)]])
  el(id).addEventListener('input', () => { try { edit(el(id).value); } catch (error) { status(error.message); } refresh(); });
el('approve-cloud').addEventListener('change', () => {
  try { if (el('approve-cloud').checked) desk.approveCloud(); else desk.revokeCloud(); }
  catch (error) { status(error.message); } refresh();
});
el('initialize-device').addEventListener('click', async () => {
  setupBusy = true; status('Initializing the on-device model. This explicit action may download model files.'); refresh();
  try {
    // Start within the click handler; no availability await precedes this call.
    await runtime.initializeLocal(value => { el('download').textContent = `Device model download: ${Math.round(value * 100)}%`; });
    deviceReady = true; el('device-state').textContent = 'Initialized · ONLY_ON_DEVICE';
    el('download').textContent = ''; status('Device model initialized. Rewriting is a separate action.');
  } catch (error) { deviceReady = false; el('device-state').textContent = 'Initialization failed · no cloud fallback'; safeFailure('device-init', error); }
  finally { setupBusy = false; refresh(); }
});
async function generate(mode) {
  try {
    const pending = mode === 'local' ? desk.rewriteLocal() : desk.sendApprovedExcerpt();
    refresh(); status(mode === 'local' ? 'Rewriting on this device only…' : 'Sending this approved excerpt once…');
    await pending; status('Response received. The original and your draft remain separate.');
  } catch (error) {
    if (mode === 'local') { deviceReady = false; el('device-state').textContent = 'Device unavailable or rewrite failed · explicit reinitialization required'; }
    safeFailure(mode, error);
  }
  finally { refresh(); }
}
el('rewrite-local').addEventListener('click', () => generate('local'));
el('send-cloud').addEventListener('click', () => generate('cloud'));
el('debug-token').addEventListener('input', refresh);
el('configure-cloud').addEventListener('click', async () => {
  const token = el('debug-token').value; el('debug-token').value = ''; setupBusy = true; refresh();
  status('Checking the separately approved App Check credential. No model prompt is sent during setup.');
  try { await runtime.configureRegisteredDebugToken(token); el('cloud-state').textContent = `App Check configured · ${CLOUD_MODEL} · ONLY_IN_CLOUD`; status('Cloud attestation succeeded. Review and approve the exact excerpt before any model request.'); }
  catch (error) { el('cloud-state').textContent = safeFailureText('app-check', error); safeFailure('app-check', error); }
  finally { setupBusy = false; refresh(); }
});
refresh();
try {
  const response = await fetch('/runtime-config.json', { cache: 'no-store', credentials: 'omit' });
  if (!response.ok) throw Error('Local public configuration unavailable');
  const config = await response.json(); allowDebug = config.allowRegisteredDebugToken === true;
  runtime = await createBrowserRuntime(config); desk.configure(runtime.adapter);
  el('runtime-state').textContent = 'Firebase SDK initialized · no model request sent';
  el('cloud-state').textContent = allowDebug ? 'Approved localhost setup enabled. Supply only a separately registered credential.' : 'Blocked: web App Check registration and specific debug-credential approval are pending.';
  refresh();
  const availability = await deviceAvailability().catch(() => 'unavailable');
  el('device-state').textContent = `Browser device availability: ${availability}`;
  status('Drafting is ready. Device initialization is an explicit action and may download model files.');
} catch { el('runtime-state').textContent = 'Firebase initialization failed. Manual drafting remains available.'; status('Check the local public Firebase configuration and build. No model request was sent.'); }
refresh();
