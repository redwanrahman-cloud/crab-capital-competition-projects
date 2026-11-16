import * as appSDK from 'firebase/app';
import * as aiSDK from 'firebase/ai';
import * as appCheckSDK from 'firebase/app-check';
import { createFirebaseAdapter } from './firebase-adapter.mjs';
import { validateFirebaseConfig } from './config.mjs';
import { diagnosticError } from './diagnostics.mjs';
export { validateFirebaseConfig } from './config.mjs';

export const CLOUD_MODEL = 'gemini-3.5-flash-lite';
export const DEVICE_OPTIONS = Object.freeze({ expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] });

export async function deviceAvailability(languageModel = globalThis.LanguageModel) {
  if (!languageModel || typeof languageModel.availability !== 'function') return 'unavailable';
  const value = await languageModel.availability(DEVICE_OPTIONS);
  return ['available', 'downloadable', 'downloading', 'unavailable'].includes(value) ? value : 'unavailable';
}

// No global debug-token flag: the official SDK's debug mode logs that secret.
// Use the documented token exchange and CustomProvider, only after separate
// registration approval, and never include drafts/excerpts in this request.
export function registeredDebugProvider({ config, debugToken, CustomProvider, fetchImpl = fetch, now = Date.now }) {
  if (typeof debugToken !== 'string' || !/^[a-fA-F0-9-]{32,80}$/.test(debugToken)) throw diagnosticError('desk/app-check-credential-format', 'Enter the separately approved registered debug credential.');
  return new CustomProvider({ getToken: async () => {
    let response;
    try {
      response = await fetchImpl(`https://firebaseappcheck.googleapis.com/v1/projects/${config.messagingSenderId}/apps/${encodeURIComponent(config.appId)}:exchangeDebugToken?key=${encodeURIComponent(config.apiKey)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'omit', cache: 'no-store',
        body: JSON.stringify({ debugToken })
      });
    } catch { throw diagnosticError('desk/app-check-network', 'App Check exchange could not connect. No model request was sent.'); }
    if (!response.ok) throw diagnosticError('desk/app-check-http', 'App Check rejected the registered credential. No model request was sent.', response.status);
    let body;
    try { body = await response.json(); }
    catch { throw diagnosticError('desk/app-check-response-json', 'App Check returned unreadable attestation data. No model request was sent.'); }
    const seconds = typeof body?.ttl === 'string' ? Number(body.ttl.replace(/s$/, '')) : NaN;
    if (typeof body?.token !== 'string' || !body.token || !Number.isFinite(seconds) || seconds <= 0) throw diagnosticError('desk/app-check-attestation', 'App Check returned an invalid attestation. No model request was sent.');
    return { token: body.token, expireTimeMillis: now() + seconds * 1000 };
  } });
}

export async function createBrowserRuntime({ firebaseConfig, allowRegisteredDebugToken = false, hostname = globalThis.location?.hostname,
  apps = appSDK, ai = aiSDK, appCheck = appCheckSDK, fetchImpl = fetch, deviceEnvironment } = {}) {
  const config = validateFirebaseConfig(firebaseConfig);
  const localApp = apps.initializeApp(config, 'private-draft-desk-device');
  const local = await createFirebaseAdapter({ firebaseApp: localApp, sdk: ai, onDeviceParams: { createOptions: DEVICE_OPTIONS }, deviceEnvironment });
  let cloud = null, cloudApp = null;
  return Object.freeze({
    adapter: Object.freeze({ inferenceSources: local.inferenceSources, get cloudReady() { return cloud !== null; }, async generate(mode, prompt) {
      if (mode === 'local') return local.generate(mode, prompt);
      if (mode !== 'cloud') throw new Error('Unknown execution mode.');
      if (!cloud) throw new Error('Cloud is blocked until the approved App Check configuration succeeds.');
      return cloud.generate(mode, prompt);
    } }),
    initializeLocal: onProgress => local.initializeLocal(onProgress),
    get cloudReady() { return cloud !== null; },
    async configureRegisteredDebugToken(debugToken) {
      if (!allowRegisteredDebugToken || !['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) throw diagnosticError('desk/app-check-approval-required', 'Cloud setup is blocked pending specific Captain approval for localhost App Check.');
      if (globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN !== undefined) throw diagnosticError('desk/app-check-global-debug', 'Remove any global SDK debug-mode flag and reload before this private credential setup.');
      if (cloudApp) throw diagnosticError('desk/app-check-already-configured', 'App Check was already configured for this tab. Reload to try a different credential.');
      const provider = registeredDebugProvider({ config, debugToken, CustomProvider: appCheck.CustomProvider, fetchImpl });
      // Separate named app: getAI captures the App Check provider at creation.
      cloudApp = apps.initializeApp(config, 'private-draft-desk-cloud');
      const instance = appCheck.initializeAppCheck(cloudApp, { provider, isTokenAutoRefreshEnabled: false });
      const attestation = await appCheck.getToken(instance, true);
      if (!attestation?.token) throw diagnosticError('desk/app-check-attestation', 'App Check attestation was not confirmed. No model request was sent.');
      cloud = await createFirebaseAdapter({ firebaseApp: cloudApp, appCheckReady: true, cloudModel: CLOUD_MODEL, sdk: ai });
    }
  });
}
