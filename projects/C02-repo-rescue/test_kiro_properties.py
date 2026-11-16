"""Deterministic property tests for Repo Rescue V0 stable regular-file behavior.

Scope (source: app/repo_rescue.py):
  * Stable regular-file classification/hash equivalence: for quiescent trees of regular
    files only, compare() classifies added/modified/missing/identical exactly as an
    independent hashlib baseline, and every reported sha256 equals an independent whole-file
    SHA256. Repeated scans produce equal reports.
  * Unchanged input bytes: compare() leaves every input file's bytes and the set of input
    paths unchanged (read-only; no restore command exists).

Explicit boundaries preserved by these tests:
  * Quiescent-input / non-atomic: inputs are not modified during the scan, so these tests
    exercise the stable-input path only. They do NOT prove atomicity or detection of
    concurrent/adversarial changes (see the report 'limitations' string in repo_rescue.py).
  * No-restore: the report is PLAN ONLY; no restoration is executed or tested.
  * F1 type-conflict (directory vs regular file at one path) is corrected in the inspected
    app/repo_rescue.py: compare() refuses the entire comparison before rows or proposals.
    These regular-file-only tests do NOT exercise that path; it is covered by the
    separately authored F1 regression suite (F1-CORRECTION-RECEIPT.md,
    INDEPENDENT-F1-REVIEW.md). Initial inspection note, preserved as a mistake: an early
    read in this session returned stale pre-correction source and this docstring first
    stated F1 was still absent; corrected after re-reading the current source and receipts.
  * These synthetic fixtures do NOT establish Kiro contest eligibility, novelty, or
    hostile-filesystem safety.

Standard library only. Fixed seed. Temporary directories. No network/install.
"""

import hashlib
import random
import shutil
import tempfile
import unittest
from pathlib import Path

import repo_rescue as rr

# Fixed seed: the generated tree cases are reproducible run-to-run.
SEED = 20261115

# Parent components are drawn from this fixed set and are never used as leaf names, so no
# relative path is simultaneously a directory on one side and a file on the other. The corrected
# compare() refuses such conflicts; these regular-file-only trees simply do not create any.
_SUBDIRS = ("d1", "d2")
_LEAF = "leaf"


def _sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def _build_tree(root, files):
    """files: dict relpath(str) -> content(bytes). Creates parents as needed."""
    root.mkdir(parents=True, exist_ok=True)
    for rel, content in files.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(content)


def _observed(root):
    """Independent observation: relpath -> sha256 for every regular file."""
    out = {}
    for p in sorted(root.rglob("*")):
        if p.is_file() and not p.is_symlink():
            out[p.relative_to(root).as_posix()] = _sha256_bytes(p.read_bytes())
    return out


def _input_bytes(root):
    """relpath -> raw bytes for every regular file (read-only immutability check)."""
    out = {}
    for p in sorted(root.rglob("*")):
        if p.is_file() and not p.is_symlink():
            out[p.relative_to(root).as_posix()] = p.read_bytes()
    return out


def _expected_rows(current_obs, snapshot_obs):
    """Independent classification mirroring repo_rescue.compare for regular files."""
    rows = {}
    for path in sorted(set(current_obs) | set(snapshot_obs)):
        c = current_obs.get(path)
        s = snapshot_obs.get(path)
        if c is None:
            status = "missing"
        elif s is None:
            status = "added"
        elif c == s:
            status = "identical"
        else:
            status = "modified"
        rows[path] = {
            "status": status,
            "current_sha256": c,
            "snapshot_sha256": s,
        }
    return rows


def _gen_case(rng):
    """Generate one (current_files, snapshot_files) pair of varied small regular-file trees.

    Every path is a regular-file leaf; parent components come only from _SUBDIRS and are never
    used as leaf names, so no path is a directory on one side and a file on the other.
    """
    def name(i):
        if rng.random() < 0.5:
            return f"{_SUBDIRS[rng.randrange(len(_SUBDIRS))]}/{_LEAF}{i}"
        return f"{_LEAF}{i}"

    current_files, snapshot_files = {}, {}
    idx = 0

    common = rng.randint(1, 4)
    for _ in range(common):
        path = name(idx)
        idx += 1
        clen = rng.randint(0, 64)
        content_c = bytes(rng.randrange(256) for _ in range(clen))
        if rng.random() < 0.5:
            current_files[path] = content_c
            snapshot_files[path] = content_c
        else:
            current_files[path] = content_c
            snapshot_files[path] = bytes(
                rng.randrange(256) for _ in range(rng.randint(0, 64))
            )

    cur_only = rng.randint(0, 3)
    for _ in range(cur_only):
        path = name(idx)
        idx += 1
        current_files[path] = bytes(
            rng.randrange(256) for _ in range(rng.randint(0, 64))
        )

    snap_only = rng.randint(0, 3)
    for _ in range(snap_only):
        path = name(idx)
        idx += 1
        snapshot_files[path] = bytes(
            rng.randrange(256) for _ in range(rng.randint(0, 64))
        )

    return current_files, snapshot_files


class StableRegularFileProperties(unittest.TestCase):
    N_CASES = 12

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)

    def test_generated_trees_classification_hash_equivalence(self):
        rng = random.Random(SEED)
        for n in range(self.N_CASES):
            current_files, snapshot_files = _gen_case(rng)
            with self.subTest(case=n):
                current = self.base / f"case{n}" / "current"
                snapshot = self.base / f"case{n}" / "snapshot"
                _build_tree(current, current_files)
                _build_tree(snapshot, snapshot_files)

                cur_obs = _observed(current)
                snap_obs = _observed(snapshot)
                expected = _expected_rows(cur_obs, snap_obs)

                before_cur = _input_bytes(current)
                before_snap = _input_bytes(snapshot)

                report1 = rr.compare(current, snapshot)
                report2 = rr.compare(current, snapshot)

                # R1a: classification equivalence vs independent baseline.
                self.assertEqual(
                    {r["path"]: r["status"] for r in report1["files"]},
                    {p: e["status"] for p, e in expected.items()},
                )

                # R1b: hash equivalence vs independent whole-file SHA256.
                for row in report1["files"]:
                    exp = expected[row["path"]]
                    self.assertEqual(row["current_sha256"], exp["current_sha256"])
                    self.assertEqual(row["snapshot_sha256"], exp["snapshot_sha256"])

                # R1c: counts are self-consistent with the rows.
                self.assertEqual(
                    report1["counts"],
                    {k: sum(r["status"] == k for r in report1["files"])
                     for k in ("added", "modified", "missing", "identical")},
                )

                # R1d: determinism — two compares yield identical reports.
                self.assertEqual(report1, report2)

                # R2a: plan only; no restore.
                self.assertIn("NO RESTORE", report1["mode"])

                # R2b: restoration_plan holds exactly the non-identical rows.
                self.assertEqual(
                    len(report1["restoration_plan"]),
                    sum(r["status"] != "identical" for r in report1["files"]),
                )
                self.assertEqual(
                    sorted(p["path"] for p in report1["restoration_plan"]),
                    sorted(r["path"] for r in report1["files"]
                           if r["status"] != "identical"),
                )

                # R2c: unchanged input bytes (read-only).
                self.assertEqual(before_cur, _input_bytes(current))
                self.assertEqual(before_snap, _input_bytes(snapshot))
                # R2d: unchanged input membership.
                self.assertEqual(set(before_cur), set(_input_bytes(current)))
                self.assertEqual(set(before_snap), set(_input_bytes(snapshot)))

    def test_empty_trees_classify_cleanly(self):
        current = self.base / "current"
        snapshot = self.base / "snapshot"
        _build_tree(current, {})
        _build_tree(snapshot, {})
        report = rr.compare(current, snapshot)
        self.assertEqual(report["files"], [])
        self.assertEqual(
            report["counts"],
            dict(added=0, modified=0, missing=0, identical=0),
        )
        self.assertIn("NO RESTORE", report["mode"])

    def test_limitations_disclose_quiescent_nonatomic_boundary(self):
        current = self.base / "current"
        snapshot = self.base / "snapshot"
        _build_tree(current, {"a": b"x"})
        _build_tree(snapshot, {"a": b"x"})
        report = rr.compare(current, snapshot)
        limitations = report["limitations"].lower()
        # R4: source explicitly discloses the quiescent / non-atomic boundary.
        self.assertIn("quiescent", limitations)
        self.assertIn("atomic", limitations)


if __name__ == "__main__":
    unittest.main(verbosity=2)
