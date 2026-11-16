# Repo Rescue V0 — design (Kiro property tests)

Authority: Captain-authorized NEW Repo Rescue task, scoped to `c02-dossier`. This spec owns
only this file, `requirements.md`, and `app/test_kiro_properties.py`. No other files were
edited. No installs, network, agents, or spending.

## Inspected source identities (SHA256)

Computed natively with `Get-FileHash` (uppercase); the lowercase form matches the independent
F1 review in `INDEPENDENT-F1-REVIEW.md`:

- `app/repo_rescue.py`: `FB68E3AC3E0775A71D232B61AB15456A055DCB893C8905691D180A615222364E`
  (= `fb68e3ac…`, the F1-corrected source).
- `app/test_repo_rescue.py`: `645F0DFD511A7156874D3768FF7501A3C0B32AEB3438D06CB048EFBFE289335B`
  (= `645f0dfd…`, the F1-corrected 16-method suite).

These differ from the original `INDEPENDENT-REVIEW.md` hashes (`0950eca5…` / `f643bc16…`)
because the F1 correction modified both files; see `F1-CORRECTION-RECEIPT.md`.

## Initial inspection mistake (preserved, then corrected)

My first read of `app/repo_rescue.py` this session returned stale pre-correction content (the
file was being corrected in parallel), so the first draft of these specs stated F1 was still
absent. Re-reading the current source (`compare()` lines ~118–129) shows the correction is
present: before the classification loop, `compare()` intersects each file-key set with the
other tree's directory keys and raises `ScanError` listing the conflicting path and both
observed types, so no rows or proposals are emitted for a conflicting path or its descendants.
`F1-CORRECTION-RECEIPT.md` and `INDEPENDENT-F1-REVIEW.md` (PASS within scope) corroborate this.
The corrected framing in `requirements.md` and the test docstring supersedes the mistake.

## Test design (`app/test_kiro_properties.py`)

Deterministic generated-case unittest; standard library only; fixed `SEED = 20261115`;
temporary directories; no `app/fixtures` import.

1. **Generator** (`_gen_case`): `random.Random(SEED)` drives per-case counts of common /
   current-only / snapshot-only files, whether each common file is identical or modified,
   nesting (leaf under `d1`/`d2`), and byte lengths (0–64). Parent components come only from
   `{d1, d2}` and are never leaf names, so every path is a regular-file leaf and no path is a
   directory on one side and a file on the other — the test stays in regular-file scope and does
   not exercise the (corrected) F1 conflict path. `N_CASES = 12` varied small trees.
2. **Independent baseline** (`_observed`, `_expected_rows`): an independent `hashlib.sha256` of
   each regular file's bytes plus a classification mirroring `compare()`'s rule
   (`missing`/`added`/`identical`/`modified`) for regular files.
3. **Per-case assertions** (`test_generated_trees_classification_hash_equivalence`):
   - R1a classification equivalence: report statuses equal the independent baseline.
   - R1b hash equivalence: every reported `current_sha256`/`snapshot_sha256` equals the
     independent whole-file SHA256.
   - R1c counts self-consistent with the rows.
   - R1d determinism: two consecutive `compare()` calls return equal reports.
   - R2 plan-only: `mode` contains `NO RESTORE`; `restoration_plan` length and paths equal
     exactly the non-identical rows.
   - R2 unchanged input bytes: byte maps and path membership equal before/after `compare()`.
4. `test_empty_trees_classify_cleanly`: empty trees → empty `files`, zero counts, `NO RESTORE`.
5. `test_limitations_disclose_quiescent_nonatomic_boundary`: report `limitations` contains
   `quiescent` and `atomic` (R4 disclosure, not an atomicity claim).

The corrected `compare()` conflict check is inert for these regular-file-only trees
(`conflicts == ∅`), so the classification path exercised here is identical to V0; the test does
not depend on F1 behavior.

## Actual native execution

Interpreter: `python`,
Python 3.11.16, native Windows. Run from `app/` so `import repo_rescue` resolves.

The test was executed natively and **passes**: all 3 tests `ok`, `Ran 3 tests in 1.085s`,
`OK`. PowerShell terminal echo truncated the live captures, so the complete result was
recovered from the run-2 redirect log (`$env:TEMP\kiro_test_run.log`), which captured the
full runner output:

```
test_empty_trees_classify_cleanly ... ok
test_generated_trees_classification_hash_equivalence ... ok
test_limitations_disclose_quiescent_nonatomic_boundary ... ok
----------------------------------------------------------------------
Ran 3 tests in 1.085s
OK
```

Run history (no runs were attempted after the single stdout text-runner run permitted by the
correction):

- Run 1 (`-m unittest … -v`, inline): live capture obscured by PowerShell surfacing the
  runner's stderr as error records.
- Run 2 (`-m unittest … -v`, redirected to the TEMP log above): captured the complete `OK`
  result shown. It preceded the test-file docstring/comment corrections; those corrections
  changed no executable code, so this result applies to the current file.
- Run 3 (stdout text-runner, `stream=sys.stdout`, per correction): re-confirmed
  `test_empty_trees_classify_cleanly … ok` and the generated-trees test executing; its live
  stdout was truncated by terminal-echo noise before the summary line, but is consistent with
  the complete result above. No `FAIL`/`ERROR` markers or tracebacks appeared in any run.

No test re-runs were performed after the permitted stdout text-runner run.

## Boundaries (stated, not overclaimed)

- **Quiescent-input / non-atomic.** Tests use quiescent inputs; they do not prove atomicity or
  detection of concurrent/adversarial changes. The two-scan check cannot bound arbitrary
  transients (F2 stands per `INDEPENDENT-F1-REVIEW.md`).
- **No-restore.** The report is `PLAN ONLY`; no restoration is executed or tested.
- **F1 type-conflict.** Corrected in the inspected source and independently reviewed PASS within
  scope, but these property tests keep regular-file scope and do not exercise the conflict path.
- **No contest/novelty/hostile claim.** These synthetic fixtures establish no Kiro contest
  eligibility, novelty, or hostile-filesystem safety (F3/F5 remain per
  `INDEPENDENT-F1-REVIEW.md`).

## What was not done

No edits to `app/repo_rescue.py`, `app/test_repo_rescue.py`, `app/README.md`,
`BUILD-RECEIPT.md`, `INDEPENDENT-REVIEW.md`, `F1-CORRECTION-RECEIPT.md`,
`INDEPENDENT-F1-REVIEW.md`, fixtures, or `app/evidence/*`. No installations, network, agents,
spending, recovery, submission, or claim of contest readiness.
