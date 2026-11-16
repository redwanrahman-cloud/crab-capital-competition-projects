# Evidence Trail — working local V0

Our original contributions are licensed under Apache-2.0; see the repository root LICENSE. The separately installed Relate package retains its own license and terms. Private stores, credentials, wheel binaries and internal receipts are excluded from this public source directory.

Small source-change review app using the **genuine embedded relate-db 1.0.1** engine already installed in `.venv`. Python standard-library HTTP server and plain browser HTML/CSS/JavaScript. No alternative database, adjacency-store substitute, AI, remote API, ingestion or accounts.

## Install from source

Verified platform: Windows x64, Python 3.11.16, relate-db 1.0.1. Other platforms/Python versions have not been tested. Install free Python 3.11 x64, then run these commands in the extracted source directory. No account, paid service, API key, or database server is required.

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe .\test_app.py
.\.venv\Scripts\python.exe .\app.py --store .\data\judge-trail
```

The package-index installation command is the judge-facing route; this workspace's clean check instead used the existing verified Windows wheel with `pip install --no-index .\relate_db-1.0.1-cp39-abi3-win_amd64.whl`, in a newly created `.repro-20261116` environment. No site-packages were copied. All five tests passed there with loopback access permitted. A fresh external machine or network package-index install was not tested. Do not distribute `.venv`, `.repro-*`, private stores or internal evidence logs as source.

## Launch an existing installation

From PowerShell in this directory:

```powershell
.\.venv\Scripts\python.exe .\app.py
```

Open **http://127.0.0.1:8765/**. Stop with Ctrl+C. The server binds only 127.0.0.1. It is not automatically started by this deliverable. Default graph storage is `data/trail`; close before opening a second process on the same graph. Use `--port 8766 --store data/another-trail` for a separate synthetic demonstration. Do not expose it through a proxy or tunnel.

## One visible task

1. Inspect the three initial synthetic sources, original claims, supporting and contradicting quotes.
2. Under Source A, click **Try synthetic change: 12 → 24 ms**, then **Save new revision**.
3. Observe BEFORE and AFTER text and affected paths: A → C1; A → C1 → C2; A → C1 → C2 → D1; A → C1 → D2. C3 and D3 remain outside the affected set.
4. Enter a note on D1 and record human review. Its status becomes reviewed for the current source revisions. D2 remains in need of review.
5. Change A again. D1 needs review again and its previous acknowledgment stays in human review history.
6. Stop, relaunch with the same store, and inspect preserved revisions, excerpts, paths and review history.

## Evidence model and boundaries

- Immutable `SourceRevision` nodes store exact text, SHA-256 and monotonically increasing per-source numbers. `Source.current` advances atomically with creation of a new revision in one Relate transaction. The app exposes no revision-edit/delete endpoint.
- Initial revision-to-claim `SUPPORTS` / `CONTRADICTS` edges store exact quote and zero-based character `[start,end)` offsets. Claim-to-claim and decision-to-claim `DEPENDS_ON` edges are actual graph edges.
- The impact query runs inside Relate, including variable-length traversal up to eight dependency hops. The UI displays that exact query. JavaScript formats returned impact rows into paths using returned dependency edges; it does not determine which nodes are affected.
- A changed source creates a mismatch between the original evidence revision and the source's current revision. It does **not** rewrite original excerpts, claim judgments or decisions, and does not declare anything false. New revisions have no silently inferred support links.
- Repeating current exact text is an explicit duplicate no-op. Reusing historical exact text is rejected rather than rewinding the pointer. Stale browser edits and stale review fingerprints are rejected. Text is not normalized; hashes bind the exact UTF-8 string.
- Human review is an append-only local acknowledgment with note, UTC timestamp, target, a fingerprint of all current sources, and exact acknowledged source revision IDs. Expand an acknowledgment to inspect its original texts after later changes. Legacy acknowledgments that retained only a fingerprint explicitly show that their exact revision IDs were not recorded; no historical binding is invented. Review is conservatively invalidated by *any* source change, including an unrelated one. The path impact remains visible after review. No authenticated reviewer identity or revised judgment is claimed.
- Exact asset routing prevents serving arbitrary files; mutation requests require the exact loopback Host and Origin, JSON and a bounded body. Browser content uses text nodes rather than HTML insertion. CSP disallows external content and framing. This is a local single-user boundary, not protection against malicious local software or direct store editing.

## Verification and honest limits

Run `.\.venv\Scripts\python.exe .\test_app.py`. Original output is under `evidence/working-v0-tests.txt`; the November 16 closeout run is `evidence/build-closeout-tests-2026-11-16.txt` (5 tests). Tests use real Relate stores in isolated temporary directories, verify true transitive impact and unrelated control, immutable history/exact quotes, duplicate/stale handling, exact review bindings/invalidation/reopen, legacy unknown bindings, and an isolated HTTP server's actual mutation/origin/Host/path behavior. The test server is shut down in `finally`.

This is a bounded working slice. The November 16 final Chrome walkthrough exercised A 12→24 ms, the four affected nodes, D1 acknowledgment, A 30 ms, and expansion of the historical exact 24 ms acknowledgment. Observations are retained in `evidence/final-ui-2026-11-16.json`. Independent product acceptance, mobile/cross-browser checks and browser restart remain separate checks; store reopening is covered by integration tests. See `JUDGE-TESTING-GUIDE.md` for the judge walkthrough. No real research corpus, source/claim editor, evidence-link authoring, authentication, parallel writers, migrations, crash-recovery certification, graph beyond depth eight, organizer acceptance, registration, submission, publication or deployment is included. The initial graph is deliberately fixed and synthetic. Source changes are manually entered. The app does not evaluate truth, source independence or performance superiority over a spreadsheet. Existing `prove_graph.py`, `package-provenance.json` and `evidence/proof-*` remain separate unchanged dependency proof.

Implementation attribution: actual Codex engineering, not native Hermes/OpenClaw execution.
