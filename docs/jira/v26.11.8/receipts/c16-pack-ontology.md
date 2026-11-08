# C16 Receipt — cgap-popcorn-aoq ggen pack semantic core

Standing: PASS

Lane: C16 (Wave-3 CONSTRUCT). Repo: /Users/sac/repop. Plan: docs/jira/v26.11.8/plans/16-pack-ontology.md. Resolution: R9/R10/R11 (docs/wave-1-resolutions.md).

## Owned files landed

- packs/cgap-popcorn-aoq/pack.toml — [pack] name/version/description; [capabilities] provides urn:ggen:pack:cgap-popcorn-aoq; [validation] gates list (12 gate paths, files owned by C17); NO [dependencies] table (FM-PACK-014, named in a comment).
- packs/cgap-popcorn-aoq/targets.toml — languages rs+ts, generated-output dirs.
- packs/cgap-popcorn-aoq/ontology.ttl — GENERATED, do not hand-edit.
- packs/cgap-popcorn-aoq/scripts/gen_ontology.py — deterministic generator (hex-derived literals only; no wall-clock).
- packs/cgap-popcorn-aoq/scripts/self_check.py — structural self-check gate.

gates/ and witnesses/ NOT touched (C17); templates/ NOT touched (C18).

## Ontology contents

- Namespace: single pack-scoped prefix cp: <urn:cgap-popcorn-aoq:>; no canonical rebind. Foreign IRIs only as prov/seeAlso citations to cgap crates (urn:cgap:crate:...).
- Classes: FrameHeader, FrameField, StatusConstant, SeamNote, Hyperplane.
- Closed enums (owl:oneOf, exhaustive): FrameType(3), StatusCode(9), AgentTier(3), HookName(3), ActorMessageKind(5), WireKind(6).
- Props: offset, sizeBytes, nextOffset, wireKind, cName/rustName/tsName, value, fieldOf, constantId, docBand, seam, tierId, algorithmId, hookName, planeDim, planeNormal.
- 64B field table (10 rows) with nextOffset contiguity chain 0→64: magic(0,4)=0x52503031, version(4,2)=1, algId(6,2)={0x0000,0x0001} seam, status(8,2)=band 0x5250A001..A009, flags(10,2), frameSeq(12,4), binding(16,32) keyed-BLAKE3 of 229B UnsealedReceipt, rootPrefix(48,8), payloadLen(56,4), fnv1a32(60,4) over [0x00,0x3C) — matches the header-grounding contract.
- Status band individuals scA001..scA009 with exact hex-derived decimals.
- algId constants 0x0000 keyed-BLAKE3 / 0x0001 ML-DSA-65 + algId-upgrade-seam, determinism, zero-JSON, and header-grounding SeamNotes; prov individuals cite cgap-aoq header.rs / generated_aoq_header_layout.rs / pin_table.rs.
- 4 sh:NodeShapes (WorkOrder / NteRecord / GpmReading / GeofenceRegion), sh:closed, with demo values NTE 800 / GPM 0.22 / geofence 200m as sh:maxInclusive / sh:minInclusive / sh:maxInclusive bounds.

## Gates (real exits, this session)

| Gate | Command | Exit |
|---|---|---|
| rdflib parse | `python3 -c "from rdflib import Graph; Graph().parse('ontology.ttl', format='turtle')"` (inside self_check PARSE_OK) | 0 (395 triples) |
| Structural self-check | `python3 scripts/self_check.py` | 0 — ALL_GATES_PASS (prefix scope, no rebind, contiguity 0→64, 6 closed enums with exact member counts, band 0x5250A001..A009, magic/version/algId/FNV-basis constants, 4 NodeShapes, demo values) |
| Determinism | `python3 scripts/gen_ontology.py > /tmp/regen.ttl && cmp /tmp/regen.ttl ontology.ttl` | 0 — byte-identical |

Mutation note (honesty, not a court): the first hand-written ontology.ttl draft WAS a corrupted write (garbled Turtle, duplicate subjects, wrong hand-computed decimals like 0x5250A001→1382713345) — the gate process caught it and the file was replaced by the deterministic generator. The generator is the standing anti-corruption guard: no hand-written decimals or hand-maintained tables remain.

## Process finding (operator-relevant)

A mid-session content-corruption channel garbled one Write and several heredoc payloads (placeholder text + missing content — the known signature). All downstream checks were re-run from committed scripts on disk, which are stable: self_check.py passes 3/3 consecutive runs. Two false-failure loops during the session were real bugs, not corruption: (1) rdflib URIRef-vs-str type-strict equality in the gate, (2) GPM 0.22 bound probed in the wrong shape.

## UNVERIFIED

- ggen-marketplace admission deferred (no `ggen sync run` / marketplace receipt this lane).
- offsets-vs-P1 reconciliation pending: P1 crates/abi does not exist yet; the 64B map here encodes the dispatch contract (magic 0x52503031, version 1, FNV-1a32 @0x3C over [0x00,0x3C)) and P1's envelope discipline; when P1 freezes generated_layout.rs, this ontology's field table must be reconciled row-by-row.
- gates/ listed in pack.toml are paths only — C17 owns their content; gate-06 (header grounding) and gate-10 (parity-with-abi) will consume this ontology.
- templates/ appeared in the pack dir mid-session (C18's lane, timestamps 15:16) — not touched or validated by C16.
- sh:in on cp:tier uses plain strings ("Client"/"Boundary"/"Server") matching AgentTier labels; shacl-to-zod compatibility untested.
