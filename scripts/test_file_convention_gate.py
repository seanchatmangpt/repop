#!/usr/bin/env python3
"""C15 lane (wave v26.11.8) — test file-naming law (P15 D2).

The suffix is the only routing signal between the test projects:

  *.test.ts(x)         -> jsdom unit project
  *.browser.test.ts(x) -> real-chromium browser project
  *.spec.ts(x)         -> playwright smoke runner (playwright/ only)

Refuses, with file:line evidence:
  1. `*.spec.ts(x)` anywhere outside playwright/.
  2. A `.test` file (jsdom-routed) whose code constructs Worker,
     SharedArrayBuffer, WebAssembly, or calls Atomics.* — those
     surfaces need a real browser realm and must be named
     `*.browser.test.ts(x)`.

Exit law: 0 = clean, 1 = violations, 2 = internal/infra error.
"""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

SKIP_DIRS = {"node_modules", "dist", "target", ".git", "scratch", ".pnpm"}

# Real browser-only surfaces. Comment lines are exempt (documentation
# is not construction); a code line constructing/routing the surface
# inside a jsdom-routed file is a violation.
BROWSER_ONLY_PATTERNS = [
    "new Worker(",
    "new SharedArrayBuffer(",
    "SharedArrayBuffer",
    "WebAssembly.",
    "Atomics.",
]


def wanted(p: Path) -> bool:
    return p.suffix in (".ts", ".tsx") and not any(
        part in SKIP_DIRS for part in p.parts
    )


def main() -> int:
    files = sorted(
        p for p in REPO_ROOT.rglob("*") if wanted(p)
    )
    violations = []
    for f in files:
        rel = f.relative_to(REPO_ROOT)
        name = f.name
        parts = rel.parts

        # Rule 1: .spec.ts outside playwright/
        if name.endswith(".spec.ts") or name.endswith(".spec.tsx"):
            if "playwright" not in parts:
                violations.append(
                    "%s: .spec file outside playwright/ (smoke runner only)"
                    % rel
                )
            continue

        # Rule 2: jsdom-routed .test file using browser-only surfaces.
        if not name.endswith(".test.ts") and not name.endswith(".test.tsx"):
            continue
        if name.endswith(".browser.test.ts") or name.endswith(
            ".browser.test.tsx"
        ):
            continue
        for i, line in enumerate(
            f.read_text(errors="replace").splitlines(), 1
        ):
            stripped = line.strip()
            if stripped.startswith(("//", "/*", "*", "<!--")):
                continue
            for pat in BROWSER_ONLY_PATTERNS:
                if pat in line:
                    violations.append(
                        "%s:%d: jsdom-routed .test file touches %r "
                        "(rename to .browser.test.ts)"
                        % (rel, i, pat)
                    )
                    break

    if violations:
        print("GATE test_file_convention: FAIL")
        for v in violations:
            print("  " + v)
        return 1
    print("GATE test_file_convention: PASS (%d files scanned)" % len(files))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # infra failure is loud, never fake-pass
        print("GATE test_file_convention: infra error: %s" % exc, file=sys.stderr)
        sys.exit(2)
