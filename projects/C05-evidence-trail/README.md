# Evidence Trail · C05

Embedded Relate integration with source-linked review history and exact reviewed-source revision binding. Five integration tests passed in the development checkout; fresh browser and packaging acceptance remain pending.

The originally verified distribution is a Python CPython 3.9+ stable-ABI Windows x64 `relate-db==1.0.1` wheel. Python/platform combinations outside the development environment are unverified. The binary wheel and private database are omitted. See `package-provenance.json` for the original distribution/hash; other platforms are unverified.

```sh
python -m venv .venv
# Activate the environment using your operating system's supported command.
python -m pip install relate-db==1.0.1
python -B -m unittest -v test_app
python -B app.py
```

Inspect command help and source for local database paths before running. Use synthetic input; no private project database or personal records are supplied.
This public export contains source, tests, synthetic fixtures and build manifests. Private receipts, reports, screenshots, local credentials, installed dependencies and generated local builds are omitted. Test results described here are historical development evidence; this export has not independently reproduced them. No submission or organizer acceptance is claimed.

Third-party packages and vendored files retain their own licenses. No blanket license is granted over third-party material. Install dependencies only after reviewing their terms and use your own authorized platform configuration.

Portability: this source export has not been verified by a clean dependency installation on another machine. First-party open-source license selection remains pending; public source visibility does not itself grant an open-source license.
