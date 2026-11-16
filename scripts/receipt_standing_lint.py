#!/usr/bin/env python3
"""receipt_standing_lint.py — Gate 3 (receipt-standing-law), repop port (Y4).

Small parse-only port of smalt scripts/receipt_standing_lint.py: scans
receipt *.md files for a parseable standing line (synonym keys
Standing|Status|verdict|Result|Exit code|Gate) in the closed standing
vocabulary. Missing/unparseable -> FAIL, exit 1. --census reports the
missing-standing census and exits 0 (Y4 lane: census only, fix none).

repop targets: docs/jira/v*/receipts/**. Standing map emitted to
docs/jira/receipt-standing-map.json. Stdlib only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

KEY_SYNONYMS = ["Standing", "Status", "verdict", "Result",
                "Exit-code", "Exit code", "Gate"]
KEY_RE = re.compile(
    r"^#?\s*(" + "|".join(KEY_SYNONYMS) + r")\s*[:=]\s*(.+)$", re.IGNORECASE)

VOCAB_CORE = ["ALIVE", "PARTIAL_ALIVE", "PARTIAL", "BLOCKED", "UNVERIFIED",
              "PASS", "REFUSED", "FAIL", "FAIL-HONEST", "UNKNOWN", "VERIFIED",
              "UNSUPPORTED", "CLOSED", "CLOSED-SIMULATED", "OPEN", "LANDED",
              "COMPLETE", "BUILD_BROKEN", "CONFORMANT", "SUSPECT",
              "PROVISIONAL", "PROVISIONAL_ALIVE", "SKIP-LOUD", "NON-VACUOUS",
              "TYPED-RED", "RESOLVED", "GREEN", "DONE", "RED"]
VOCAB = VOCAB_CORE

EXIT_CODE_VALUE_RE = re.compile(r"^\d+$")
REPO = Path(__file__).resolve().parent.parent
MAP_PATH = REPO / "docs" / "jira" / "receipt-standing-map.json"


def map_hash():
    h = hashlib.sha256()
    h.update(json.dumps(
        {"keys": KEY_SYNONYMS, "values": VOCAB,
         "exit_code_rule": "Exit-code: N -> Exit-code-N",
         "annotation_strip": ["backticks", "parenthesized-suffix",
                              "markdown-emphasis", "trailing-punctuation"]},
        sort_keys=True).encode())
    return h.hexdigest()[:16]


def strip_annotation(value):
    v = value.strip().strip("`").strip()
    ann = ""
    m = re.match(r"^(\S+?)\(([^()]*)\)\s*$", v)
    if m:
        v, ann = m.group(1), m.group(2)
    toks = v.split()
    v = toks[0] if toks else ""
    v = v.strip("`")
    v = re.sub(r"^\*+|\*+$", "", v)
    return v.rstrip(".,:;"), ann


def parse_standing(value):
    v, ann = strip_annotation(value)
    if EXIT_CODE_VALUE_RE.match(v):
        return "Exit-code-%s" % v, ann, ""
    if v in VOCAB:
        return v, ann, ""
    return None, "", "value '%s' not in vocabulary" % v


def parse_file(path):
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError as e:
        return {"file": str(path), "ok": False, "reason": "unreadable: %s" % e}
    for i, line in enumerate(lines):
        m = KEY_RE.match(line)
        if m:
            standing, ann, err = parse_standing(m.group(2))
            if standing is None:
                return {"file": str(path), "ok": False,
                        "reason": "line %d: %s" % (i + 1, err)}
            return {"file": str(path), "ok": True, "standing": standing,
                    "line": i + 1}
    return {"file": str(path), "ok": False, "reason": "no parseable standing line"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("targets", nargs="*", default=None)
    ap.add_argument("--census", action="store_true",
                    help="report census and exit 0 (census only, fix none)")
    args = ap.parse_args()
    targets = [Path(t) for t in args.targets] or DEFAULT_TARGETS
DEFAULT_TARGETS = sorted((REPO / "docs" / "jira").glob("*/receipts"),
                         key=lambda p: p.name, reverse=True)

if __name__ != "__main__":
    pass

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("targets", nargs="*", default=None)
    ap.add_argument("--census", action="store_true",
                    help="report census and exit 0 (census only, fix none)")
    args = ap.parse_args()
    targets = [Path(t) for t in args.targets] if args.targets else DEFAULT_TARGETS
    files = []
    for t in targets:
        if t.is_dir():
            files.extend(sorted(t.rglob("*.md")))
        elif t.suffix == ".md":
            files.append(t)
    files = sorted(set(files))
    results = [parse_file(f) for f in files]
    failures = [r for r in results if not r["ok"]]
    print("receipt-standing-lint: standing-map hash %s" % map_hash())
    print("receipt-standing-lint: %d files, %d parse OK, %d FAIL"
          % (len(results), len(results) - len(failures), len(failures)))
    map_data = {
        "standing_map_hash": map_hash(),
        "generated_by": "scripts/receipt_standing_lint.py",
        "entries": {r["file"]: {
            "standing": r.get("standing"), "ok": r["ok"],
            "reason": r.get("reason", ""),
        } for r in results},
    }
    MAP_PATH.write_text(json.dumps(map_data, indent=2, sort_keys=True) + "\n",
                        encoding="utf-8")
    print("receipt-standing-lint: map written -> %s" % MAP_PATH)
    if args.census:
        for r in failures:
            print("CENSUS %s: %s" % (r["file"], r.get("reason", "")))
        print("receipt-standing-lint: census mode — %d files missing standing, "
              "exit 0 (census only, fix none)" % len(failures))
        return 0
    for r in failures:
        print("FAIL %s: %s" % (r["file"], r.get("reason", "")), file=sys.stderr)
    if failures:
        print("receipt-standing-lint: %d FAIL" % len(failures), file=sys.stderr)
        return 1
    print("receipt-standing-lint: PASS (0 missing)")
    return 0


sys.exit(main())
