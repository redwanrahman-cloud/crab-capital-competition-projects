# Repo Rescue · C02

Read-only SHA-256 comparison of a current directory and a user-trusted snapshot. Produces classifications and a restoration PLAN ONLY; it does not restore, copy or delete input content. Python 3.10+ standard library only.

From this directory:

```sh
python -B repo_rescue.py fixtures/current fixtures/snapshot
python -B -m unittest discover -s . -p "test_*.py" -v
python -B repo_rescue.py fixtures/current fixtures/snapshot --format html --output my-report.html
```

Use a new output filename. Export refuses overwrite and writes outside both inputs. File/directory conflicts, links, observable concurrent changes and input read errors refuse the whole comparison. Use distinct, non-overlapping, quiescent inputs. Hashes do not establish snapshot trust or restoration approval. Competition-specific development evidence and entry compliance remain pending.
This public export contains source, tests, synthetic fixtures and build manifests. Private receipts, reports, screenshots, local credentials, installed dependencies and generated local builds are omitted. Test results described here are historical development evidence; this export has not independently reproduced them. No submission or organizer acceptance is claimed.

Third-party packages and vendored files retain their own licenses. No blanket license is granted over third-party material. Install dependencies only after reviewing their terms and use your own authorized platform configuration.

Portability: this source export has not been verified by a clean dependency installation on another machine. First-party open-source license selection remains pending; public source visibility does not itself grant an open-source license.
