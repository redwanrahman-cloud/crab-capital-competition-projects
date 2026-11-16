# Release Evidence Gate · C07

Forge issue panel and resolver with exact reviewed-revision approval binding, append-only review records, and UNKNOWN/stale handling. The preview uses synthetic local state and a local rendering adapter; it is not hosted Atlassian acceptance.

Use a Node release supported by the pinned Forge CLI:

```sh
npm ci --ignore-scripts --no-audit --no-fund
node --test test/domain.test.mjs test/preview.test.mjs
node scripts/forge-local-check.cjs
node scripts/build-preview.mjs
node preview/server.mjs
```

The local official lint/bundle helper reads public Atlassian schemas/runtime artifacts. The preview binds http://127.0.0.1:3407. Forge registration remains a placeholder. Authentication, registration, site selection, deployment/installation and native Jira acceptance require separate authorized setup. The Forge build command can upload project code; it is not a local-only build. No login helper or credential is included.
This public export contains source, tests, synthetic fixtures and build manifests. Private receipts, reports, screenshots, local credentials, installed dependencies and generated local builds are omitted. Test results described here are historical development evidence; this export has not independently reproduced them. No submission or organizer acceptance is claimed.

Third-party packages and vendored files retain their own licenses. No blanket license is granted over third-party material. Install dependencies only after reviewing their terms and use your own authorized platform configuration.

Portability: this source export has not been verified by a clean dependency installation on another machine. Original contributions are licensed under Apache-2.0; third-party material retains its own licenses. See the repository root LICENSE and THIRD-PARTY-NOTICES.md.
