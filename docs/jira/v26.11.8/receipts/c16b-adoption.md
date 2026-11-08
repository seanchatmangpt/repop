# C16b Receipt — three-frame adoption for cgap-popcorn-aoq ontology

Standing: PASS (lane-local)

Lane: C16b REPAIR (pack correctness). Repo: /Users/sac/repop (this checkout carries no .git metadata in the current environment — inventory is file-level: paths + sha256, not git status). Dispatch: C16 landed a single 64B FrameHeader; G1's reconcile (docs/jira/v26.11.8/receipts/g1-abi-reconcile.md) proved the landed kernel pins THREE frames with exact offsets. Registry of truth: kernel/crates/repop-abi/src/layout_spec.rs.

## What changed

- packs/cgap-popcorn-aoq/scripts/gen_ontology.py — generator now emits all three pinned frames as cp:IntentFrame / cp:HyperplaneRegister / cp:ReceiptFrame (subClassOf cp:WireFrame), each with its own field table. Tables are transcribed row-for-row from layout_spec.rs INTENT_FIELDS (11 rows) / HYPERPLANE_FIELDS (12) / RECEIPT_FIELDS (9), plus an envelope digest row (offset 60, width 4, wkU32LE) grounded in layout_spec's envelope-law consts (DIGEST_OFFSET=60; digest at 60..64). ReceiptFrame's digest is its own pinned row (index 8). WireKind enum extended 6→7 members, still closed: wkU16LE / wkU32LE / wkU64LE / wkF64LE / wkBytes8 / wkBytes16 / wkBytes32. Magics adopted: 0x4946 / 0x4850 / 0x5246. Status band 0x5250A001..A009, closed enums, single cp: namespace, and the 4 NodeShapes with demo bounds are all preserved.
- packs/cgap-popcorn-aoq/scripts/self_check.py — gate extended: undefined-cp:-ref sweep; per-frame contiguity 0→64; row-by-row (offset/width/rustName/wireKind) parity vs a PINNED mirror of layout_spec.rs; closed enums with exact member counts (FrameType 3 / StatusCode 9 / AgentTier 3 / HookName 3 / ActorMessageKind 5 / WireKind 7); band 0x5250A001..A009; constants magics {0x4946,0x4850,0x5246} / version 1 / frame-size 64 / algId {0,1} / FNV basis 2166136261 + prime 16777619; 4 NodeShapes with demo bounds NTE 800 / GPM 0.22 / geofence 200m.
- packs/cgap-popcorn-aoq/ontology.ttl — regenerated via the generator (never hand-edited): 637 triples, three frame individuals with contiguous field tables, per-frame magics, FNV constants as StatusConstants, adoption seam note naming layout_spec.rs.
- packs/cgap-popcorn-aoq/pack.toml — [pack].description grounding comment updated from the single-frame law to the three-frame adoption law.

Untouched as directed: gates/, witnesses/, templates/ (C17/C18 own), kernel/ (C1 owns).

## Adoption cross-check (independent of the gate)

A throwaway extraction script parsed layout_spec.rs's three tables with a FieldSpec-row regex and diffed them against the gate's PINNED mirror: all three frames match exactly on (name, offset, width, wireKind) — exit 0. Envelope digest rows for IntentFrame/HyperplaneRegister grounded in layout_spec.rs lines 180-183 (envelope-law consts). This closes the circularity risk of a self-referential gate.

## Gates (real exits, this session)

| Gate | Command | Exit |
|---|---|---|
| Generate | `python3 scripts/gen_ontology.py > ontology.ttl` | 0 |
| Structural self-check | `python3 scripts/self_check.py` | 0 — ALL_GATES_PASS (637 triples; 3 frames contiguous 0→64, row parity vs layout_spec.rs; 6 closed enums; band; constants; 4 NodeShapes) |
| Determinism | two consecutive `python3 scripts/gen_ontology.py > /tmp/dN.ttl` + `cmp` | 0 — byte-identical; landed ontology.ttl matches (sha256 9fe01e153dd39bbc68e201239e338bd43aee54f8ea3188e25fcbf6a151ca4a12) |
| Corruption-signature sweep | `grep -nE '<<<<<<<\|>>>>>>>\|^=======$\|TODO\|PLACEHOLDER\|placeholder\|FIXME\|�' ontology.ttl` | 1 — clean, zero signatures |
| Adoption cross-check vs registry | throwaway extractor diff vs kernel/crates/repop-abi/src/layout_spec.rs | 0 — all three tables match row-for-row |
| Gate stability | self_check.py ×3 consecutive runs | 0,0,0 — ALL_GATES_PASS all three |

Two gate-authoring bugs were found and fixed during the run (both in self_check.py, both real): (1) rdflib strict equality (Literal != int always True — the same class C16's receipt hit), (2) local-name extraction by underscore rsplit truncating multi-word field names (intent_kind → 'kind'); row identity now read from the emitted cp:rustName property. An initial undefined-ref sweep flagged the 10 NodeShape property-path terms — classified lawful (entity surface consumed by shacl-to-zod), allowlisted as ENTITY_TERMS. The first draft of this receipt file itself came out corrupted mid-sentence and was rewritten whole — the same channel C16 documented.

## UNVERIFIED

- C17 gate literal pass pending: gates/ files (C17's lane) are listed in pack.toml but not yet present; gate-10 (parity-with-abi) is the gate that will consume the three-frame tables.
- ggen-marketplace admission deferred (no `ggen sync run` / marketplace receipt this lane).
- templates/ untouched (C18's lane).
- sh:in tier strings and shacl-to-zod compatibility untested.
