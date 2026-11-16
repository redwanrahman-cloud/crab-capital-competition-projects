# Repo Rescue · C02

Read-only SHA-256 comparison of a current directory and a user-trusted snapshot. Produces classifications and a restoration PLAN ONLY; it does not restore, copy or delete input content. Python 3.10+ standard library only.

The haunted evidence-desk HTML report uses a ghost to identify missing snapshot traces, readable status cards and explicit plan-only proposals. Twenty-one native tests passed after this renderer-only update; baseline computed reports, input fixture bytes and scanning controls were unchanged. Earlier execution-restriction failures are retained privately rather than rewritten as passes.

Genuine Kiro contribution is limited to two specifications and three property tests. Public `.kiro/specs/repo-rescue/` files retain that work; one machine-specific interpreter path was replaced with `python` for this public copy. No claim that Kiro authored the core engine or the new renderer. Costume Contest is a proposed category; judges determine sufficient Kiro use and theme fit.

From this directory:

```sh
python -B repo_rescue.py fixtures/current fixtures/snapshot
python -B -m unittest discover -s . -p "test_*.py" -v
python -B repo_rescue.py fixtures/current fixtures/snapshot --format html --output my-report.html
```

Use a new output filename. Export refuses overwrite and writes outside both inputs. File/directory conflicts, links, observable concurrent changes and input read errors refuse the whole comparison. Use distinct, non-overlapping, quiescent inputs. Hashes do not establish snapshot trust or restoration approval. Competition-specific development evidence and entry compliance remain pending.
This public export contains source, tests, synthetic fixtures and build manifests. Private receipts, screenshots, local credentials, installed dependencies and generated local builds are omitted. The exact published source copy passed all 21 tests on the development machine; a separate-machine reproduction remains unverified. No submission or organizer acceptance is claimed.

Third-party packages and vendored files retain their own licenses. No blanket license is granted over third-party material. Install dependencies only after reviewing their terms and use your own authorized platform configuration.

Portability: this source export has not been verified by a clean dependency installation on another machine. Original contributions are licensed under Apache-2.0; third-party material retains its own licenses. See the repository root LICENSE and THIRD-PARTY-NOTICES.md.

## Saved synthetic preview

Download [demo.html](demo.html) and open it locally to inspect the report without scanning files. It is an actual fixture-generated report with only machine-specific root display labels replaced by synthetic labels. It contains no scripts or remote assets. It is not a hosted scanner or a substitute for the required demonstration video.
