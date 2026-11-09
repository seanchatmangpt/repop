#!/usr/bin/env python3
"""cgap-popcorn-aoq semantic-gate witness court (ggen.semantic-gate-witness-court/1).

Executable arm of gate-court.toml (runner = "python3 qualification/verify.py").

For every gate stem in gates/ (sorted; the directory listing is the truth,
never a hand list):

  pass witness (witnesses/pass/<stem>.ttl): gate must return ZERO violations
  fail witness (witnesses/fail/<stem>.ttl): gate must return >= 1 violation

A gate that cannot flip (0 violations on BOTH witnesses) is a VACUOUS-GATE
failure, never a pass. A missing witness is typed (COURT-BROKEN), never
silent. Violation classes:

  SELECT gate: any row = violation.
  ASK gate:    askAnswer true = violation.

Verdict JSON on stdout. Exit codes:
  0 = CONFORMANT   1 = VIOLATION   2 = COURT-BROKEN (missing witness /
                                             unreadable gate or witness)

Run from the repo root or the pack dir alike (paths anchor on __file__): python3 qualification/verify.py
"""
import json
import sys
from pathlib import Path

from rdflib import Graph

PACK_ROOT = Path(__file__).resolve().parent.parent
GATES_DIR = PACK_ROOT / "gates"
PASS_DIR = PACK_ROOT / "witnesses" / "pass"
FAIL_DIR = PACK_ROOT / "witnesses" / "fail"
SCHEMA = "ggen.semantic-gate-witness-court/1"

EXIT_CONFORMANT = 0
EXIT_VIOLATION = 1
EXIT_COURT_BROKEN = 2


def violation_count(gate_path: Path, ttl_path: Path) -> int:
    """Violations of one gate against one witness graph."""
    g = Graph().parse(ttl_path, format="turtle")
    q = gate_path.read_text()
    head = q.split("{", 1)[0].upper()
    if "ASK" in head:
        return 1 if g.query(q).askAnswer else 0
    return len(list(g.query(q)))


def main() -> int:
    gates = sorted(GATES_DIR.glob("*.rq"))
    if not gates:
        print(json.dumps({"verdict": "COURT-BROKEN",
                          "reason": "no gates found under gates/"}))
        return EXIT_COURT_BROKEN

    flips = []
    vacuous = []
    violated = []
    broken = []

    for gate in gates:
        stem = gate.stem
        pw = PASS_DIR / f"{stem}.ttl"
        fw = FAIL_DIR / f"{stem}.ttl"
        if not pw.exists() or not fw.exists():
            broken.append({"gate": stem, "reason": "missing witness",
                           "missing": [p.name for p in (pw, fw) if not p.exists()]})
            continue
        try:
            pv = violation_count(gate, pw)
            fv = violation_count(gate, fw)
        except Exception as e:  # noqa: BLE001 -- typed court failure, not a silent pass
            broken.append({"gate": stem, "reason": f"query error: {e}"})
            continue
        if pv == 0 and fv >= 1:
            flips.append({"gate": stem, "verdict": "FLIP-OK",
                          "pass_rows": pv, "fail_rows": fv})
        elif pv == 0 and fv == 0:
            vacuous.append({"gate": stem, "verdict": "VACUOUS-GATE",
                            "pass_rows": pv, "fail_rows": fv})
        else:
            violated.append({"verdict": "PASS-WITNESS-VIOLATION", "gate": stem,
                             "pass_rows": pv, "fail_rows": fv})

    if broken:
        print(json.dumps({"verdict": "COURT-BROKEN", "schema": SCHEMA,
                          "broken": broken}, indent=2))
        return EXIT_COURT_BROKEN
    if violated:
        print(json.dumps({"verdict": "VIOLATION", "schema": SCHEMA,
                          "violations": violated}, indent=2))
        return EXIT_VIOLATION
    if vacuous:
        print(json.dumps({"verdict": "VACUOUS-GATE", "schema": SCHEMA,
                          "vacuous": vacuous}, indent=2))
        return EXIT_VIOLATION
    print(json.dumps({"verdict": "CONFORMANT", "schema": SCHEMA,
                      "gates": len(flips) + len(vacuous),
                      "flips": len(flips),
                      "per_gate": flips}, indent=2))
    return EXIT_CONFORMANT


if __name__ == "__main__":
    sys.exit(main())
