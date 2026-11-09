# C17-r Path Hardening — self_check.py cwd-independent

Standing: PASS

## Scope

Lane C17-r (small). R4 census defect: `packs/cgap-popcorn-aoq/scripts/self_check.py`
resolved `ontology.ttl` against process cwd — passed from the pack dir, exit 2
(PARSE FAIL) from repo root. Fix limited to path anchoring; gate semantics untouched.

## Diff

- `packs/cgap-popcorn-aoq/scripts/self_check.py`:
  - Added `import os`; added `ONT = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, "ontology.ttl")` (pack-root-relative, anchored on `__file__`).
  - `g.parse("ontology.ttl", ...)` → `g.parse(ONT, ...)`
  - `open("ontology.ttl")` → `open(ONT)`
- Sibling sweep: `gen_ontology.py` has **zero file IO** (stdout-only generator;
  grep for `open|parse|Path|os.|sys.argv` — no hits), no cwd defect. No render
  harness exists (`scripts/` contains only these two files). No other file changed.

## Gates (real exits)

- From pack dir: `python3 scripts/self_check.py` → exit **0**, ALL_GATES_PASS.
- From repo root: `python3 packs/cgap-popcorn-aoq/scripts/self_check.py` → exit **0**,
  ALL_GATES_PASS (637 triples; FRAME_OK 12/13/9 rows contiguous 0->64; all enums,
  bands, constants, shapes pass).

## Regression court (non-vacuous)

- MUTATED leg: court copy at `/tmp/ontcourt3/` (self_check.py in `scripts/`,
  ontology.ttl sibling) with pinned constant `cFrameSize` value 64→63 →
  `CONST_FAIL frame-size 0x3f != 0x40`, exit **2**. Gate refuses. (Note: two
  earlier legs — cwd-parse miss on a mislaid court layout, then an "800"→"801"
  mutation that did NOT flip any gate, exit 0 — are recorded as court-tuning,
  the second confirming a mutation outside pinned surfaces carries no bits.)
- RESTORED leg: sha-exact original copied in → exit **0**, ALL_GATES_PASS.
- Subject untouched: `shasum -a 256 packs/cgap-popcorn-aoq/ontology.ttl` →
  `9fe01e153dd39bbc68e201239e338bd43aee54f8ea3188e25fcbf6a151ca4a12` before and after.

## Standing

PASS — both-cwd run executed this session with real exits; mutation court flips.
