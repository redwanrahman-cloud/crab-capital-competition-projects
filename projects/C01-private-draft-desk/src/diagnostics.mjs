const SAFE_CODES = new Set([
  'desk/app-check-credential-format', 'desk/app-check-network', 'desk/app-check-http',
  'desk/app-check-response-json', 'desk/app-check-attestation', 'desk/app-check-approval-required',
  'desk/app-check-global-debug', 'desk/app-check-already-configured', 'desk/device-unavailable',
  'appCheck/fetch-network-error', 'appCheck/fetch-parse-error', 'appCheck/fetch-status-error',
  'appCheck/storage-open', 'appCheck/storage-get', 'appCheck/storage-set',
  'appCheck/initial-throttle', 'appCheck/throttled', 'appCheck/already-initialized', 'appCheck/use-before-activation',
  'app/duplicate-app', 'app/invalid-app-argument', 'ai/api-not-enabled', 'ai/unsupported',
  'ai/error', 'ai/fetch-error', 'ai/http-error', 'ai/parse-failed'
]);
const HTTP_CODES = new Set(['desk/app-check-http', 'appCheck/fetch-status-error', 'appCheck/initial-throttle', 'appCheck/throttled']);
export function diagnosticError(code, message, httpStatus) {
  const error = new Error(message);
  error.code = SAFE_CODES.has(code) ? code : 'desk/unknown-error';
  if (HTTP_CODES.has(error.code) && Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599) error.httpStatus = httpStatus;
  return error;
}
export function safeDiagnostic(error) {
  const code = SAFE_CODES.has(error?.code) ? error.code : 'desk/unknown-error';
  const candidate = error?.httpStatus ?? error?.customData?.httpStatus;
  return Object.freeze({ code, ...(HTTP_CODES.has(code) && Number.isInteger(candidate) && candidate >= 100 && candidate <= 599 ? { httpStatus: candidate } : {}) });
}
export function safeFailureText(phase, error) {
  const labels = { 'app-check': 'App Check setup', 'device-init': 'Device initialization', local: 'On-device rewrite', cloud: 'Approved cloud excerpt' };
  const d = safeDiagnostic(error), detail = d.code + (d.httpStatus ? `; HTTP ${d.httpStatus}` : '');
  return `${labels[phase] ?? 'Operation'} failed [${detail}]. ` + (phase === 'app-check'
    ? 'No model request was sent during setup. Reload before another credential attempt.'
    : 'No automatic retry or cloud fallback was attempted. Review runtime status before trying again.');
}
