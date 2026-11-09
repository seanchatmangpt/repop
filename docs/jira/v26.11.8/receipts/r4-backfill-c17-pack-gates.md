# R4 Backfill: C17 pack gates

Standing: PARTIAL

## Census

LANDED-WITHOUT-RECEIPT (settled ~15:41; gates run post-settlement).

## Files owned (on disk, no receipt existed)

- packs/cgap-popcorn-aoq/scripts/self_check.py
- packs/cgap-popcorn-aoq/scripts/gen_ontology.py
- packs/cgap-popcorn-aoq/pack.toml, targets.toml, ontology.ttl

## Gate (run by R4)

- `python3 scripts/self_check.py` (cwd = packs/cgap-popcorn-aoq) — exit 0,
  ALL_GATES_PASS (637 triples, frame/enum/band/const/shape/demo checks all OK).
- Same script from repo root: exit 2, `PARSE FAIL: No such file or directory:
  '/Users/sac/ontology.ttl'`.

## Findings (real, not repaired)

1. self_check.py resolves ontology.ttl relative to the process cwd, not the script
   directory — invocation from repo root exits 2. Fail-loud (not a fake pass), but
   the script is not root-safe. Left as-is per audit-only scope.

## Notes

Attests current disk state. Re-dispatch list + maxStaleRetries decision: r4-census.md.
