# C18 Receipt — pack templates (cgap-popcorn-aoq, Wave-3 write lane)

Standing: PASS (lane-local)

## Owned surface landed (7 templates, packs/cgap-popcorn-aoq/templates/)

| template | to: target |
|---|---|
| abi_kernel.rs.tmpl | kernel/crates/repop-abi/src/generated_layout.rs (`pub mod generated`) |
| abi_mirror.ts.tmpl | packages/abi/src/generated/layout.ts (GENERATED_ namespaced) |
| repop_provider.tsx.tmpl | packages/repop/src/RepopProvider.tsx |
| use_cgapp_entity.ts.tmpl | packages/repop/src/hooks/useCgapEntity.ts |
| use_hyperplane.ts.tmpl | packages/repop/src/hooks/useHyperplane.ts |
| repop_boundary.tsx.tmpl | packages/repop/src/RepopBoundary.tsx |
| worker_boot_vocab.ts.tmpl | packages/worker/src/boot/generatedVocab.ts |

## Gates (all executed this session; harness at /tmp/c18_harness.py, exit 0)

| gate | mechanism | result |
|---|---|---|
| G1 ontology parse | rdflib `Graph.parse(ontology.ttl)` (637 triples) | PASS |
| G2 frontmatter | yaml-parse per .tmpl; required keys to/force/freeze_policy/freeze_slots_dir/sparql | PASS |
| G3 SPARQL syntax | rdflib `prepareQuery` per binding, exit nonzero on fail | PASS |
| G4 non-empty bindings | every data binding (fields/consts/enums/frameTypes/agentTier/statusCode/entityShapes/hyperplanes) returns >=1 row against the LANDED ontology | PASS |
| G5 prefix integrity | every PREFIX cp: IRI byte-equals the ns literal derived from the landed ontology.ttl (ai-chatbot-shadcn-pack IRI-mismatch class) | PASS |
| G6 render x2 | jinja2 render twice, byte-identical, StrictUndefined (no silent-undefined fakes) | PASS |
| G7 conventions | TSX: "use client" + {% raw %} wrap; every template has to: + sparql: | PASS |

Render sizes (byte-identical x2): abi_kernel 12659, abi_mirror 5834, repop_boundary 1728,
repop_provider 2886, use_cgapp_entity 1452, use_hyperplane 1569, worker_boot_vocab 923.

## Subject-IRI contract (the R9/E18 bug fix)

One GenerationSubject individual: `cp:subject a gc:GenerationSubject`
(cp: = urn:cgap-popcorn-aoq:). Every template queries that exact IRI — same
prefix, casing, local name — so minted and matched IRIs cannot diverge.
Empty binding = deterministic UNBOUND fallback + gate fails closed. This is
written into every template's frontmatter contract block.

## Projections bound to the landed graph (real values, not plan-stage)

- Per-frame field tables: INTENT 12 rows / HYPERPLANE 13 / RECEIPT 9, projected
  from cp:FrameField rows (cp:fieldOf cp:frameIntent | cp:frameHyperplane |
  cp:frameReceipt), ordered by cp:offset, contiguity courts per row.
- Constants: ALG_BLAKE3=0, ALG_ML_DSA=1, C_FNV_OFFSET_BASIS=2166136261,
  C_FNV_PRIME=16777619, C_FRAME_SIZE=64, C_INTENT_MAGIC=18758 (0x4946),
  C_HYPERPLANE_MAGIC=18512 (0x4850), C_RECEIPT_MAGIC=21062 (0x5246), C_VERSION=1.
- Mid-flight re-pins survived: the ontology moved TWICE under this lane during
  the write (single-header -> three-frame adoption, c16b). All 7 templates were
  re-pinned and re-gated against the final landed graph; a mid-write parse race
  (blank-node-shaped subjects at 15:31) was detected and re-run after landing.

## Findings for coordinator (C16 gaps, not repaired here — C16/C17 own)

1. cp:subject a gc:GenerationSubject is NOT minted in ontology.ttl. All
   templates render the deterministic UNBOUND-SUBJECT fallback. Either C16
   mints the individual (case-exact) or the subject gate stays fail-closed.
2. StatusCode members carry cp:value but NO rdfs:label — semantic labels
   (DRIFT/BREACH/...) are not projectable. repop_boundary projects the DRIFT
   refusal value via label lookup; with labels absent it emits the loud
   sentinel UNBOUND_DRIFT_STATUS_VALUE (compile-broken by design, fails the
   consumer build until labels land) rather than a silently wrong literal.
   Recommend C16 add rdfs:label per StatusCode member in gen_ontology.py.
3. On-disk render court missing (R4 backfill finding r4-backfill-c18-templates.md
   confirms): the G1-G7 harness lives at /tmp/c18_harness.py, not committed.
   Recommend C17 adopt it into gates/ + verify.py so the pack admission
   sequence runs it. Real exits reproducible: `python3 /tmp/c18_harness.py` (exit 0).
4. targets.toml still says "crates/abi/src/generated" + "layouts.ts" while the
   actual surfaces are kernel/crates/repop-abi/src/generated_layout.rs and
   packages/abi/src/generated/layout.ts (targets.toml is C16-owned; drift noted,
   not edited).

## UNVERIFIED (open, by design)

- Freeze-slot checksums pending P17 gate court (dispatch-stated dependency).
- cp:subject minting (C16) — subject binding UNBOUND everywhere.
- StatusCode member labels (C16) — boundary DRIFT value sentinel active.
- Regen-diff gate against package surfaces — pending P1/P11-P13 freezes.
- Byte-identity claims are render-court claims only; no committed on-disk gate
  yet (finding 3).
