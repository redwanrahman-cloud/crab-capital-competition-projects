# Private Draft Desk · C01

Browser integration with the official Firebase SDK. Explicit device initialization, strict device/cloud selection, one-use excerpt consent and fail-closed device guards are implemented. Genuine on-device execution was observed during development. On 16 November, browser App Check attestation and one synthetic cloud submission succeeded; the real SDK reported in_cloud and the original and editable draft remained unchanged. This is local provider evidence, not production hosting or organizer acceptance.

Use Node 24.12 or newer (Node 26 used in development):

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
node server.mjs
```

Open http://127.0.0.1:4317. The server requires a separately configured, ignored `firebase-client-config.local.json` with the six public Firebase web configuration fields. No configuration or credential is supplied. The source currently validates the original public project slug; adapting it to another authorized Firebase project requires explicit source review. App Check setup is default-off and requires your own registered debug credential. Never commit tokens. The UI distinguishes initialization and provider calls; a local test is not provider acceptance.

See [JUDGE-SETUP.md](JUDGE-SETUP.md) for reproduction, the exact original-project binding, authorized adaptation requirements, a synthetic walkthrough and remaining submission gates. [firebase-client-config.example.json](firebase-client-config.example.json) contains six invented placeholders and intentionally fails the unchanged original-project validator. It grants no project access.
This public export contains source, tests, synthetic fixtures and build manifests. Private receipts, reports, screenshots, local credentials, installed dependencies and generated local builds are omitted. Test results described here are historical development evidence; this export has not independently reproduced them. No submission or organizer acceptance is claimed.

Third-party packages and vendored files retain their own licenses. No blanket license is granted over third-party material. Install dependencies only after reviewing their terms and use your own authorized platform configuration.

Portability: this source export has not been verified by a clean dependency installation on another machine. First-party open-source license selection remains pending; public source visibility does not itself grant an open-source license.
