# Repo Rescue V0 — requirements (Kiro property tests)

Authority: Captain-authorized NEW Repo Rescue task, scoped to `c02-dossier` only.
Mendline and all other projects are preserved (not touched). This spec owns only:

- `.kiro/specs/repo-rescue/requirements.md` (this file)
- `.kiro/specs/repo-rescue/design.md`
- `app/test_kiro_properties.py`

No edits to core source (`app/repo_rescue.py`), existing tests (`app/test_repo_rescue.py`),
or original receipts/evidence (`BUILD-RECEIPT.md`, `INDEPENDENT-REVIEW.md`, `app/evidence/*`).

## Subject (as inspected in `app/repo_rescue.py`)

`compare(current, snapshot)` performs a read-only SHA256 byte comparison of two disjoint,
link/reparse-free regular-file trees. It runs each `scan()` twice and rejects inputs that
change between scans. Before classifying, it intersects each file manifest with the
other tree's directory manifest and refuses the entire comparison (`ScanError`) on any
same-relative-path file/directory conflict, so no row or proposal is emitted for a
conflicting path or its descendants. For every relative path present on either side it
classifies the file
as `added` (current only), `missing` (snapshot only), `identical` (same SHA256), or `modified`
(different SHA256), and emits an inspectable `restoration_plan` of non-executable proposals.
The report `mode` is `PLAN ONLY — NO RESTORE`; no restore command exists. `digest_file`
re-checks file identity (`signature` = dev/ino/mode/size/mtime_ns/ctime_ns + Windows
`st_file_attributes`) before, during and after reading. `export` creates a new file outside
both inputs and refuses overwrite.

## Requirements for the new property tests (`app/test_kiro_properties.py`)

**R1 — Stable regular-file classification/hash equivalence.** For quiescent trees containing
only regular files, `compare()` must classify every path identically to an independent
`hashlib` baseline (added/missing/identical/modified), and every reported
`current_sha256`/`snapshot_sha256` must equal an independent whole-file SHA256. Two
consecutive `compare()` calls must return equal reports.

**R2 — Unchanged input bytes.** `compare()` must leave every input regular file's bytes and
the set of input paths unchanged (read-only). The report must remain `PLAN ONLY` with no
restore, and the `restoration_plan` must contain exactly the non-identical rows.

**R3 — Determinism.** Tree generation uses a fixed seed so the varied small trees are
reproducible run-to-run, with no reliance on imported `app/fixtures` data.

**R4 — Boundary acknowledgment.** The report `limitations` string must disclose the
quiescent-input / non-atomic boundary. Tests assert only this disclosure, not atomicity.

## Constraints

Python standard library only. Fixed seed. Temporary directories. No installations, network,
agents, or spending. Deterministic generated cases only.

## Explicit boundaries and inspection notes

- **F1 type-conflict (corrected).** The current `app/repo_rescue.py` (SHA256 `fb68e3ac…`)
  refuses the entire comparison on any same-relative-path file/directory collision before
  emitting rows or proposals; the prior V0 behavior (path classified `missing` +
  `PROPOSE_COPY_FROM_SNAPSHOT`) is corrected. Correction evidence: `F1-CORRECTION-RECEIPT.md`
  and `INDEPENDENT-F1-REVIEW.md` (PASS within scope).
- **Initial inspection note (preserved as a mistake).** An early read in this session
  returned stale pre-correction source content, so the first draft of these specs stated F1
  was still absent. That was an inspection error, corrected after re-reading the current
  source (`compare()` lines ~118–129) and the two F1 receipts. The corrected framing above
  supersedes it.
- **Test scope remains regular files.** The new tests do not exercise the conflict path
  (covered by the separately authored F1 regression suite); trees are regular-file-only by
  construction (parent components are drawn from a fixed set of subdirectory names never used
  as leaf names, so no path is a directory on one side and a file on the other).
- **Quiescent-input / non-atomic.** Tests use quiescent inputs and do not prove atomicity or
  detection of concurrent/adversarial changes; the two-scan check cannot bound arbitrary
  transients.
- **No-restore.** No restoration is executed or tested.
- **No contest/novelty/hostile claim.** These synthetic fixtures do not establish Kiro
  contest eligibility, novelty, or hostile-filesystem safety.
