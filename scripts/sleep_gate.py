#!/usr/bin/env python3
"""sleep_gate.py — no-sleep doctrine Law 1 enforcement, repop TS port (Y4).

Port of smalt's sleep_gate.py retargeted at repop's TypeScript tree. Scans
packages/ for setTimeout(/setInterval(/await sleep( sites and enforces:

  every site FAILS unless:
    (a) it lives inside an AUDITED poll implementation (allowlist in
        scripts/sleep_gate_classes.json — file-tier entries:
        packages/worker/src/ring/poll.ts + packages/worker/src/boot/boot-fsm.ts,
        function-tier: pollUntil),
    (b) it carries an adjacent `// SLEEP-CLASS: <CLASS>` annotation
        (same line or the contiguous // comment block ending on the line
        above), where CLASS is in {TIME-ADVANCE, POLL-STEP, SCHEDULING}, or
    (c) it sits inside a bounded poll loop: the nearest while(/for( above
        carries a time bound (Date.now()/performance.now()/TIMEOUT/deadline)
        and the body inspects an observable (if (, ?., includes(, ===, !==).
        A bare unconditional sleep is a violation.

Fail-closed: zero files scanned -> exit 1; unreadable file -> exit 1;
missing/unreadable classification JSON -> exit 1. Exit 0 = pass,
1 = violations, 2 = usage error. Stdlib only.

Court: scripts/shim_court/sleep_gate_court.sh proves a clean file passes
and a sleep-injected file is REFUSED (BEFORE/AFTER flip under the
shim-court protocol).
"""

import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLASSES_PATH = os.path.join(REPO, "scripts", "sleep_gate_classes.json")

TS_SLEEP_RE = re.compile(r"\b(?:setTimeout\s*\(|setInterval\s*\(|await\s+sleep\s*\()")
TS_ANN_RE = re.compile(r"//\s*SLEEP-CLASS:\s*([A-Za-z-]+)")
LOOP_OPEN_RE = re.compile(r"^\s*(?:while|for)\s*\(")
TIME_BOUND_RE = re.compile(
    r"\b(?:Date\.now|performance\.now)\s*\(|\b(?:TIMEOUT|DEADLINE|deadline|budgetMs)\b")
OBSERVABLE_RE = re.compile(r"\bif\s*\(|\?\.|includes\s*\(|[!=]==|[!=]=")

LAWFUL_CLASSES = {"TIME-ADVANCE", "POLL-STEP", "SCHEDULING"}

SCAN_ROOT = os.path.join(REPO, "packages")


def load_classes():
    try:
        with open(CLASSES_PATH, encoding="utf-8") as f:
            data = json.load(f)
        files = {os.path.normpath(e["path"]) for e in data["files"]}
        fns = {e["name"] for e in data["functions"]}
        return files, fns
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print("[SLEEP-GATE] [FAIL] classification file unreadable: %s" % exc)
        sys.exit(1)


AUDITED_POLL_FILES, AUDITED_POLL_FNS = load_classes()


def strip_line_comments(raw_lines):
    """Per-line // comment strip (// inside string literals is not
    special-cased; it only ever ADMITS or skips, never invents sites)."""
    return [ln.split("//", 1)[0] for ln in raw_lines]


def annotate_class(lines, idx):
    """// SLEEP-CLASS: on the same line or the contiguous // comment block
    ending on the line above."""
    m = TS_ANN_RE.search(lines[idx])
    if m:
        return m.group(1)
    j = idx - 1
    found = None
    while j >= 0 and lines[j].lstrip().startswith("//"):
        mm = TS_ANN_RE.search(lines[j])
        if mm:
            found = mm.group(1)
            break
        j -= 1
    return found


def fn_name_at(lines, idx):
    """Nearest enclosing function-ish name above idx (const x = ..., function
    x, async x, method shorthand) for the function-tier allowlist."""
    FN_RE = re.compile(
        r"^\s*(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)"
        r"|const\s+(\w+)\s*=\s*(?:async\s*)?\()"
        r"|^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{")
    for j in range(idx, -1, -1):
        m = FN_RE.match(lines[j])
        if m:
            return next(g for g in m.groups() if g)
    return None


def in_bounded_poll_loop(lines, idx):
    """(c) bounded-poll admission: nearest while(/for( above (fenced by a
    bare closing brace) carries a time bound and the body inspects an
    observable."""
    for j in range(idx - 1, max(-1, idx - 200), -1):
        if lines[j].strip() == "}":
            return False
        if LOOP_OPEN_RE.search(lines[j]):
            span = "\n".join(lines[j:idx + 1])
            return bool(TIME_BOUND_RE.search(span) and OBSERVABLE_RE.search(span))
    return False


def scan_file(path, rel):
    violations = []
    try:
        with open(path, encoding="utf-8") as f:
            src = f.read()
    except OSError as exc:
        return [(rel, 0, "FAIL-CLOSED: unreadable file: %s" % exc)]

    lines = src.split("\n")
    # Block-comment toggle (/* ... */): approximate toggle-style — only ever
    # skips, never invents sites.
    in_block = [False] * len(lines)
    in_blk = False
    for i, line in enumerate(lines):
        opens = line.count("/*")
        closes = line.count("*/")
        if in_blk:
            in_block[i] = True
            if closes:
                in_blk = False
        elif opens > closes:
            in_block[i] = True
            in_blk = True

    for i, line in enumerate(lines):
        if in_block[i]:
            continue
        raw = line.split("//", 1)[0]
        if not TS_SLEEP_RE.search(raw):
            continue
        if os.path.normpath(rel) in AUDITED_POLL_FILES:
            continue
        fn = fn_name_at(lines, i)
        if fn in AUDITED_POLL_FNS:
            continue
        cls = annotate_class(lines, i)
        if cls in LAWFUL_CLASSES:
            continue
        if in_bounded_poll_loop(lines, i):
            continue
        violations.append(
            (rel, i + 1,
             "unclassified sleep primitive (// SLEEP-CLASS: "
             "<TIME-ADVANCE|POLL-STEP|SCHEDULING> required, audited-poll "
             "allowlist, or bounded-poll-loop evidence): `%s`" % raw.strip()))
    return violations


def main(argv):
    paths = argv[1:] or [SCAN_ROOT]
    violations = []
    files_scanned = 0
    seen = set()

    def walk(p):
        if os.path.isfile(p):
            yield p
        elif os.path.isdir(p):
            for root, dirs, names in os.walk(p):
                dirs[:] = [d for d in dirs if d not in
                           ("node_modules", ".git", "dist", "__pycache__")]
                for n in sorted(names):
                    yield os.path.join(root, n)

    for p in paths:
        if not os.path.exists(p):
            print("[SLEEP-GATE] [FAIL] path not found: %s" % p)
            return 1
        for f in walk(p):
            if not re.search(r"\.(ts|tsx|js|jsx|mjs|cjs)$", f):
                continue
            rel = os.path.relpath(os.path.abspath(f), REPO)
            if rel in seen:
                continue
            seen.add(rel)
            files_scanned += 1
            violations.extend(scan_file(f, rel))

    if files_scanned == 0:
        print("[SLEEP-GATE] [FAIL] no ts/tsx/js files scanned — fail-closed")
        return 1

    if violations:
        print("[SLEEP-GATE] %d violation(s) across %d files — REFUSED"
              % (len(violations), files_scanned))
        for rel, ln, why in violations:
            print("  [FAIL] %s:%d %s" % (rel, ln, why))
        print("[SLEEP-GATE] lawful forms: audited bounded poll "
              "(scripts/sleep_gate_classes.json), // SLEEP-CLASS: annotation, "
              "or bounded-poll-loop evidence. See docs/NO_SLEEP_DOCTRINE.md")
        return 1

    print("[SLEEP-GATE] PASS — %d files, 0 unclassified sleep primitives"
          % files_scanned)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
