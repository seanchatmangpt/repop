# D2 Receipt Lint — v26.11.8 wave artifacts

Standing: PARTIAL

Gate table (commands run from `docs/jira/v26.11.8/`, exits captured):

| Check | Command | Exit | Findings |
|---|---|---|---|
| Census counts | `ls plans/*.md \| wc -l` (also receipts) | 0 | plans=15, receipts=4 |
| H1 present | `head -1 f \| grep -q '^# '` loop, 19 files | 0 | 0 missing |
| Standing x1 | `head -5 \| grep -cE` standing-key regex `!= 1` | 0 | 0 bad files |
| Closed vocab | standing grep -vE closed-set loop | 1 (flagged) | 1 file (see below) |
| Lines <=100 | `awk 'length > 100'` over all 19 files | 1 (flagged) | 24 long lines, 3 receipts |

## Census

- plans/: 15 files. **MISSING plan numbers: 09, 12, 13, 19, 20** (5 of 20 slots
  absent — loudly flagged; may be un-dispatched or landed elsewhere).
- receipts/: 4 files (c6, g1, g2, g6).

## Standing vocabulary

- `receipts/g2-zod-projection.md`: Standing line carries a multi-clause value
  ("PARTIAL — ... BLOCKED ... registered divergence.") that does not terminate in
  a closed-set token. Per receipt-standing law it would be repaired — but the
  file mtime is 139s before the lint pass (< 10 min), owning lane in flight,
  so it is recorded **UNVERIFIED-in-flight**, not fixed.

## Over-length lines (>100 chars, awk re-derived)

- `receipts/c6-wasm-glue.md`: lines 9, 10, 11 (198/271/128 chars) — mtime
  482s before pass (< 10 min) → **UNVERIFIED-in-flight**, not fixed.
- `receipts/g2-zod-projection.md`: 12 lines (3, 11-14, 18-21, 36, 40-42) —
  in-flight → **UNVERIFIED-in-flight**.
- `receipts/g6-marketplace-baseline.md`: 7 lines (5, 11, 12, 15, 19-22) —
  mtime 302s before pass (< 10 min) → **UNVERIFIED-in-flight**.
- plans/*.md: zero over-length lines, zero standing violations. No fixes
  required in plans/.

## Fixed files

- (none — every violating file was <10 min old at lint time; owned lanes in
  flight. All receipts exited real commands; no values recalled from memory.)

## Skips (in-flight)

- receipts/g2-zod-projection.md (vocab + 12 over-length lines)
- receipts/c6-wasm-glue.md (3 over-length lines)
- receipts/g6-marketplace-baseline.md (7 over-length lines)

Re-run this lint after the wave drains; the three receipt files above are the
expected residual delta.
