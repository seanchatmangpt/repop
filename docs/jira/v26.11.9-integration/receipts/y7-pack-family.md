# Y7 Pack Family Extension Receipt

Standing: PARTIAL_ALIVE

Lane: Y7 (pack family extension, per X14 findings) — 2026-11-08.

## Subject

Pack `packs/cgap-popcorn-aoq` fleet work-order family module + 2 semantic
gates + witnesses, addressing X14's finding that no fleet-domain work-order
NodeShapes existed anywhere.

## Files (all under /Users/sac/repop/packs/cgap-popcorn-aoq/)

- `ontology/work-order-shapes.ttl` — NEW family module, 95 triples. Classes
  `cp:FleetWorkOrder` (rdfs:subClassOf cp:WorkOrder), `cp:DispatchIntent`,
  `cp:HyperplaneBounds`; datatype props orderId/orderStatus/dispatchState,
  contractorId/committedCost, boundsNte/boundsGpm/boundsGeofence; object
  link `cp:boundsOf` → cp:Hyperplane (HyperplaneInvariant surface, reference
  not re-mint). NodeShapes sh:closed, plain literals, no value-range pins
  (aic data-shapes-only pattern). Hand-authored standalone — the generator
  `scripts/gen_ontology.py` owns `ontology.ttl` wholesale and was NOT
  modified; the module stages via the concat mechanism.
- `docs/ggen.toml` — concat invocation updated to
  `cat ../ontology.ttl ../ontology/work-order-shapes.ttl targets.ttl > build/graph.ttl`
  (FM-CONFIG-003 single-source law preserved).
- `pack.toml` — description extended with cross-repo vocabulary annotation
  citing acp: chaos-harness-reference and aic: data-shapes-only patterns as
  prose; NO [dependencies] added; URN unchanged under [capabilities].
- `gates/110_work_order_shape_closure.rq` — NEW: every sh:datatype-typed
  path on a fleet shape must resolve to an rdf:Property whose rdfs:range
  EQUALS that datatype (object links out of scope).
- `gates/120_bounds_shape_closure.rq` — NEW: all three bounds fields present
  with minCount 1 and a sh:pattern declaring a digit class (REGEX "0-9").
- `witnesses/pass/` + `witnesses/fail/` for both stems — single-flip
  mutations (110: orderStatus range retyped xsd:boolean vs shape xsd:string;
  120: boundsGpm loses sh:pattern).

## Deviation disclosed (class-naming)

Dispatch named the shapes "WorkOrder", but `cp:WorkOrder` already carries
the single entity contract `cp:WorkOrderShape` in the generator-owned
ontology and gate 080 enforces one shape per class. Resolution: the family
contract targets `cp:FleetWorkOrder` (rdfs:subClassOf cp:WorkOrder) — a
specialization, not a second shape on the same class. DispatchIntent and
HyperplaneBounds minted as named (no collisions).

## Gates / commands

- `python3 qualification/verify.py` from pack dir: exit 0, verdict
  CONFORMANT, 10 gates / 10 flips (was 8/8 pre-Y7; baseline re-run before
  any edit). Both new gates FLIP-OK pass_rows 0 / fail_rows 1.
- Same from repo root (`/Users/sac/repop`): exit 0, CONFORMANT 10/10
  (C17r anchoring — verify.py paths anchor on `__file__`).
- Both new gates return 0 rows against the REAL concat graph
  (ontology.ttl + work-order-shapes.ttl, 733 triples) — the family module
  itself is gate-clean, not just the witnesses.

## Court-engineering findings during the lane

- Gate 120's first form (UNION of FILTER NOT EXISTS groups) does not parse
  in rdflib ("Expected SelectQuery, found '{'") — restructured to
  OPTIONAL/BIND/IF.
- A sh:pattern literal like `^[0-9]+(\.[0-9]+)?$` cannot be validated by
  REGEX-ing it against itself (brackets are not in its own class); gate 120
  therefore checks the pattern literal declares a digit class instead.
- Concat parse requires `Graph().parse(data=...)` in rdflib, not a string
  as location.

## UNVERIFIED

- Marketplace admission deferred (ggen-marketplace pack publication,
  X14/FM-PACK-014 admission sequence) — pack-local standing only.
- Determinism ×2 generator regen: NOT RUN — no generator regen was needed
  (gen_ontology.py and ontology.ttl untouched this lane), so the ×2 regen
  check has no subject.
- `ggen sync run` of the docs projection with the 3-input concat not
  executed (ggen CLI run deferred; concat line verified to build a valid
  graph via rdflib only).
