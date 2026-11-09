# G2b Landing Receipt — canonical zod projection into packages/repop

Standing: PARTIAL_ALIVE — landed + deterministic ×2; compile-vs-zod UNVERIFIED (real TS2307).

Lane: G2b (small), repo /Users/sac/repop. Parent receipt: g2-zod-projection.md (G2, PARTIAL — canonical landing blocked on packages/repop/src/generated).

## Gates (real exits, this session)

| Gate | Command | Exit |
|---|---|---|
| Blocker cleared | ls packages/repop/src → exists; src/generated/ created by G2b | 0 |
| Mtime gate | newest src/ mtime 15:39:53 vs landing 15:53 → 12m38s ≥ 10min | OPEN |
| rdflib parse, adopted ontology | python3 rdflib parse packs/cgap-popcorn-aoq/ontology.ttl (via marked scratch copy) | 0 — 647 triples |
| Marker gate | sp:isPrimaryOutput true count | 10/10 property nodes |
| Render determinism | ggen sync run --skip-ea-admission ×2 | 0,0 — graph_hash_hex f8101960…a58ff identical; js sha256 897da55e…0879 identical to G2's render |
| Land | write src/generated/zodSchemas.ts | sha256 6bb66fa01a210e41c2981bb30136173facd873046fbe2ed68ee02ce881c5a163 |
| tsc scoped (landed surface) | tsc -p tsconfig.scoped.json --noEmit | 0 |
| tsc direct (generated file) | tsc --noEmit src/generated/zodSchemas.ts | 2 — TS2307 Cannot find module 'zod' |

## Landed artifact

/Users/sac/repop/packages/repop/src/generated/zodSchemas.ts — DO-NOT-EDIT header + ontology sha256 stamp (9fe01e153dd39bbc68e201239e338bd43aee54f8ea3188e25fcbf6a151ca4a12) + rendered js body verbatim (4 schemas: WorkOrder, NteRecord, GpmReading, GeofenceRegion).

## Divergences registered

1. UNVERIFIED: `zod` is not a dependency of packages/repop (package.json C11-owned, untouched per lane law) — direct compile of the generated file is TS2307 until a dependency lane adds it.
2. Bounds (NTE 800 / GPM 0.22 / geofence 200m) still not projected — pack field-mapping law, unchanged from G2's receipt.
3. tsconfig.scoped.json include list (C11-owned) does not cover src/generated/ — scoped gate passes vacuously w.r.t. the generated file; the direct tsc is the honest check.

## Replay

cd /Users/sac/repop/scratch/g2-zod && ggen sync run --skip-ea-admission (rendered js sha256 897da55e…0879)
