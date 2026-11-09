# C17b — Pack Gates + Witness Court (cgap-popcorn-aoq)

Standing: ALIVE

## Charter

CONSTRUCT lane C17b: author the refusal-class gate set, pass+fail witnesses,
`gate-court.toml`, and `qualification/verify.py` for `packs/cgap-popcorn-aoq`
(original C17 never landed gates/ — confirmed absent before work started).

## Per-gate flip table (real exits, run 2026-11-08)

Court: `python3 packs/cgap-popcorn-aoq/qualification/verify.py`
from repo root → exit 0 CONFORMANT; from pack dir → exit 0 CONFORMANT.

| Gate stem | pass_rows | fail_rows | flip |
|---|---|---|---|
| 010_frame_field_closure | 0 | 1 | FLIP-OK |
| 020_offset_contiguity | 0 | 1 | FLIP-OK |
| 030_wire_kind_closure | 0 | 1 | FLIP-OK |
| 040_status_band | 0 | 1 | FLIP-OK |
| 050_alg_id_closure | 0 | 1 | FLIP-OK |
| 060_hook_enum_closure | 0 | 1 | FLIP-OK |
| 080_node_shape_closure | 0 | 1 | FLIP-OK |
| 090_grounding | 0 | 1 | FLIP-OK |

8 gates, 8/8 FLIP-OK, zero vacuous. Non-vacuity of the court itself witnessed:
sabotaged court copy (emptied `witnesses/fail/010_frame_field_closure.ttl`)
→ verdict VACUOUS-GATE, exit 1; scratch copy removed after the run.

Gate-vs-ontology probe (all 8 gates run directly against
`packs/cgap-popcorn-aoq/ontology.ttl`, 637 triples):

| Gate | rows on real ontology |
|---|---|
| 010/020/030/040/060/080/090 | 0 |
| 050_alg_id_closure | 1 (`frameReceipt_alg_id` "missing-value") |

## Findings

- **P16 ontology gap (not owned by this lane)**: `cp:frameReceipt_alg_id`
  carries no `cp:value`, so the algId seam law {0x0000,0x0001} is uncheckable
  on the field row itself. Gate 050 is the consumer that makes this loud.
  Owner: P16 (`scripts/gen_ontology.py` / `ontology.ttl`). The gate's fail
  witness still flips on `cp:value 2`, and the pass witness seeds `cp:value 0`
  (the lawful client emission per `cp:snAlgId`).
- **rdflib evaluation quirk (documented in gate 020 comment)**: a shared lead
  pattern + nested-brace UNION-branch shape mis-evaluates to 0 rows on rdflib
  (branch patterns proven to match when flat). All 020 branches are written
  fully self-contained — the court-proven shape.
- **Divergence from dispatch wording**: status band law is expressed numerically
  (1381015553..1381015561 = 0x5250A001..A009) rather than by REGEX, because the
  ontology mints `cp:value` as xsd:integer, not hex strings. Same closed band,
  typed comparison.
- **verify.py hardening over precedent**: the aoq-pack precedent court exits 0
  even when a gate is vacuous (vacuous list never checked). This lane's
  `verify.py` adds `if vacuous: → VACUOUS-GATE verdict, exit 1` — a 0-flip
  gate is a typed lane failure, never a pass.

## Owned files

- `packs/cgap-popcorn-aoq/gates/` — 8 gates (010/020/030/040/050/060/080/090)
- `packs/cgap-popcorn-aoq/witnesses/pass/` — 8 exact-stem pass witnesses
- `packs/cgap-popcorn-aoq/witnesses/fail/` — 8 exact-stem fail witnesses
  (each fail = seed + exactly one mutation)
- `packs/cgap-popcorn-aoq/gate-court.toml` — ggen.semantic-gate-witness-court/1,
  case_key exact-stem, require_pass + require_fail true
- `packs/cgap-popcorn-aoq/qualification/verify.py` — structural copy of the
  aoq-pack court runner, __file__-anchored (CWD-independent), vacuous-hole
  closed

`scripts/` untouched (C17r ownership respected).

## UNVERIFIED

- Marketplace admission deferred (not this lane's charter).
- P16's alg_id `cp:value` gap fix — deferred to ontology owner.
- `scripts/`-side wiring of `gate-court.toml` into the admission sequence —
  deferred to C17r / P18.
