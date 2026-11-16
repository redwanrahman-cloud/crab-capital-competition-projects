# Private Draft Desk: reproduction and judge access

This package rewrites support messages with an explicit boundary between device processing and a separately approved cloud excerpt. An original is preserved beside an editable draft. Cloud approval covers the exact displayed instruction and excerpt once; editing revokes approval. No provider request is part of the offline checks below.

## What is ready

Source, pinned dependency lockfile, synthetic tests and build script are included. Genuine device and cloud generation were observed in the original development project. The original cloud check used `gemini-3.5-flash-lite` with SDK `in_cloud`; the device check reported `on_device`. These observations do not establish the exact on-device model version, clean-machine reproducibility, public-host readiness or organizer acceptance.

## Offline source checks and browser build

From this directory, use Node >=24.12.0 and npm with that same Node runtime. Node 22 is unsupported. Dependencies are Firebase 13.3.0 and esbuild 0.25.12, pinned in `package-lock.json`.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
```

Dependency installation requires network access and review of package terms; it is distinct from the tests/build, which need no account, provider call or Firebase configuration. The real-browser-SDK tests intercept fetch and retain a vendor fallback counterexample. Their synthetic success must not be described as genuine generation. A clean installation on another machine remains unverified. Keep esbuild's generated legal-comment asset with the bundle.

## Configuration and original project binding

`firebase-client-config.example.json` has exactly the six expected web configuration fields. Every value is invented; copying it unchanged is intentionally rejected. Do not put an App Check debug token, service-account credential or private key in this file. Never publish the actual local configuration or credential.

The current validator in `src/config.mjs` accepts only `projectId === 'crab-private-draft-desk'`, the original public project identifier. That identifier grants no access. The unchanged build therefore needs separately authorized access to that original project's registered web app and genuine six-field configuration, supplied privately by its owner. Do not point invented fields at that project or reuse an unauthorized credential.

To prepare a separate authorized project, its owner must review the source and explicitly adapt the single project-ID binding to their real project ID in their own copy, then supply all six fields from that same registered web app. Preserve the nonempty-field checks, app-ID syntax, numeric sender-ID check and app-ID/sender-ID equality. Keep project binding strict; do not remove validation, add a wildcard or relax routing/App Check guards. Record this as an adaptation, run all tests and retain the resulting diff. It is not the unmodified original build. This export has not made or verified that adaptation.

Copy the example to `firebase-client-config.local.json` and replace every invented field with that owner's authorized web-app configuration. The `.local.` filename is ignored by the enclosing source repository. Verify it remains ignored before sharing your copy. Missing or invalid configuration causes `/runtime-config.json` to return 503 and the UI to retain manual drafting.

## Local test build

```sh
node server.mjs
```

Open `http://127.0.0.1:4317/` in a supported Chrome environment. The server binds loopback, requires a localhost Host header and serves an explicit allowlist. It is not a remotely accessible submission URL. Startup loads configuration and checks availability; device initialization and rewriting are separate explicit actions. A compatible device may need a model download after the initialization click. Unavailable or changed device APIs must leave local generation blocked with no cloud fallback.

Cloud setup stays disabled by default. Only after the project owner has separately authorized and registered a localhost App Check debug credential, start a fresh server with its explicit opt-in. PowerShell example:

```powershell
$env:DRAFT_DESK_ALLOW_REGISTERED_DEBUG_TOKEN = '1'
node server.mjs
```

Enter the privately supplied registered credential only in the app's cloud setup field. Do not set the global Firebase debug-token flag, expose tokens in logs/video or commit them. Setup performs App Check attestation and no model prompt. After attestation succeeds, preserve synthetic text, enter a separate excerpt, review the full preview, approve once and send once. The cloud action is a real provider request; the owner must authorize that action and its account/model usage separately. This guide does not authorize it.

## Suggested judge walkthrough

1. Preserve: `Hello support, my demo desk lamp flickers. Please suggest the next troubleshooting step.` Edit the working draft; confirm the original remains unchanged.
2. Initialize the device explicitly, then rewrite locally. Record the real response and SDK `on_device`. If unavailable, record that failure rather than switching to cloud.
3. With separately authorized cloud setup, choose only a short synthetic excerpt. Review the exact prompt, approve once and submit once. Record the real response and SDK `in_cloud`, unchanged original/draft and consumed approval.
4. Approve another excerpt, then edit it. Show that approval clears and sending becomes unavailable. Do not send again solely for this demonstration.

## Submission gates still open

- A judge can build the browser assets, but the unmodified app cannot complete Firebase initialization using the invented sample. Provide an authorized original-project test-build route or finish and verify a separately authorized project adaptation. Neither route is delivered by placeholders.
- Demonstrate **Gemini Nano 4** specifically on Web/Chrome; the current `LanguageModel` availability and SDK `on_device` observations do not identify that version. Record browser/platform and trustworthy version evidence; do not infer it from generic availability.
- Completed: Apache-2.0 approved for original contributions and included at the repository root; third-party licenses remain separate.
- Provide a public YouTube demonstration, at most three minutes, in English or with English subtitles, showing actual platform behavior. No finished public video URL exists in this package.
- Complete the final submission description, selected platform, work-during-contest summary, pre-existing-code/third-party disclosures and entrant/team eligibility review. No submission acceptance is claimed.

[Official rules](https://firebasehybridaihackathon.devpost.com/rules), checked 16 November 2026, require runtime Firebase AI Logic, a public GitHub/GitLab source repository with an open-source license, and the public YouTube video. Web entries specify Gemini Nano 4. Section 6 allows App Check debug tokens. Its testing paragraph asks for free working access through 16 December, while its later submission list describes a hosted-project URL as encouraged. A hosted deployment is therefore not the only route; a functioning authorized test build needs genuine testing instructions and access. Deadline: 30 November 2026, 22:00 UTC / 1 December, 01:00 Riyadh. These instructions do not attest eligibility or accept terms for an entrant.
