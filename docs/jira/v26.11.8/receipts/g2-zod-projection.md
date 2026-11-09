# G2 zod projection via shacl-to-zod-pack

Standing: PARTIAL — deterministic ×2 render ALIVE in scratch; canonical landing BLOCKED on lane ownership of `packages/repop/src/generated/`; bounds projection is a registered divergence.

## What ran (all real, this session, ggen 26.11.5)

- `ggen --version` → `ggen 26.11.5` (exit 0)
- `ggen sync run --skip-ea-admission` (×2, exit 0, cwd `/Users/sac/repop/scratch/g2-zod/`)
- Run 2 diff: `cmp src/shacl_zod_schemas.js /tmp/g2-run1.js` → byte-identical (`DETERMINISTIC-X2`)
- Pack gates that REFUSED mid-flight and were satisfied lawfully, not bypassed:
  - `[FM-PACK-013]` shacl-projection-pack gate `010_shape_validity.rq`: zero `sp:isPrimaryOutput true` fields — fixed by marking all 13 real property nodes in the scratch consumer copy (`ontology/cgap.ttl`), an honest per-field assertion per the pack README.
  - `[FM-WRITE-008]` duplicate `to:` target — fixed by deleting the redundant vendored template copy; the pack supplies its own template through `[packs]`.
  - `[FM-CONFIG-002]` `[project].description` unknown field; `[templates]` is a required key on the pack-composition schema (both fixed, on-disk manifest is the current truth).
- `--skip-ea-admission`: 26.11.5 EA admission gate; this scratch render has no `ea.graph.json`; the flag is the CLI's documented explicit opt-out. No architecture admission was performed.

## Owned files

- `/Users/sac/repop/scratch/g2-zod/ggen.toml` (pack-composition manifest: ontology + both packs by absolute path, empty consumer templates dir)
- `/Users/sac/repop/scratch/g2-zod/ontology/cgap.ttl` — scratch copy of `/Users/sac/repop/packs/cgap-popcorn-aoq/ontology.ttl` + `sp:isPrimaryOutput true` on all 13 property nodes. sha256 `774a6112af56b6c08d6550f9cc07ee8be560c00624358386387307a1fd645f58`
- `/Users/sac/repop/scratch/g2-zod/ontology/zod-individuals.ttl` — 4 `sp:ZodSchema` individuals (`sp:schemaName` + `sp:derivedFromShape` → the 4 demo-domain NodeShapes)
- `/Users/sac/repop/scratch/g2-zod/src/shacl_zod_schemas.js` — projected output, sha256 `897da55e7234a364f3a916ab9bac4b469798c17ab997abbc4b6dbc8841cd0879`

Rendered `src/shacl_zod_schemas.js` (excerpt; full file in scratch):

```js
export const WorkOrder = z.object({
  gpmLimit: z.number(),
  nteLimit: z.number().int(),
  orderId: z.string(),
  tier: z.enum(["Client", "Boundary", "Server"]),
});
```

## Demo contract grounding

C16 DID land the NodeShapes: `/Users/sac/repop/packs/cgap-popcorn-aoq/ontology.ttl` on disk carries WorkOrder/NteRecord/GpmReading/GeofenceRegion shapes with NTE 800 / GPM 0.22 / geofence 200m. The task's "UNVERIFIED-vs-C16" branch was not needed.

## Registered divergences

1. **Bounds not projected** — `sh:minInclusive`/`sh:maxInclusive` (NTE 800, GPM 0.22, geofence 200m) are not in the pack's field-mapping law (datatype → scalar, `sh:in` → enum, nullable/collection only). Projected output faithfully reflects the pack's law, not the bounds. Fix locus: pack templates/queries (extend field mapping), never the generated file. Registered as the known systemic template-gap class.
2. **Canonical ontology lacks `sp:isPrimaryOutput`** — the C16 ontology has no shacl-projection vocabulary; markers were added only to the scratch copy. Landing the projection canonically requires either adding the markers to `/Users/sac/repop/packs/cgap-popcorn-aoq/ontology.ttl` (C16-owned) or a consumer overlay graph.
3. **Destination** — `/Users/sac/repop/packages/repop/src/generated/` does not exist on disk (verified `ls` exit 2), so output stays in scratch per the task contract; landing is a coordinator decision.

## Replay

```bash
cd /Users/sac/repop/scratch/g2-zod && ggen sync run --skip-ea-admission
cmp src/shacl_zod_schemas.js <(echo ...)  # expect sha256 897da55e…0879
```

## LANDING (G2b, 2026-11-08 15:53 PST)

Standing: PARTIAL_ALIVE — landed + deterministic; compile-vs-zod UNVERIFIED (zod not a dependency of packages/repop).

- Blocker cleared: `packages/repop/src` exists (C11 landed); `src/generated/` absent → created by G2b (G2b-owned dir).
- Mtime gate: newest src/ file mtime 15:39:53 vs landing 15:53 → 12m38s > 10min, gate OPEN (waited via scratch-first ordering).
- Re-render from ADOPTED ontology (packs/cgap-popcorn-aoq/ontology.ttl, sha256 9fe01e153dd39bbc68e201239e338bd43aee54f8ea3188e25fcbf6a151ca4a12): scratch consumer copy rebuilt (sp:isPrimaryOutput true on all 10 property nodes — G2's pre-adoption copy had 13; adopted version has 10), rdflib parse 647 triples exit 0.
- Determinism ×2: `ggen sync run --skip-ea-admission` exit 0 ×2; graph_hash_hex f81019602ecd4117baec0642214039056fcda4d779217ad040e13c813f1a58ff identical both runs; rendered js sha256 897da55e7234a364f3a916ab9bac4b469798c17ab997abbc4b6dbc8841cd0879 — byte-identical to G2's original render (NodeShape surface unchanged by the 3-frame adoption).
- Landed: /Users/sac/repop/packages/repop/src/generated/zodSchemas.ts (sha256 6bb66fa01a210e41c2981bb30136173facd873046fbe2ed68ee02ce881c5a163) = provenance header + rendered bytes verbatim.
- tsc --noEmit -p tsconfig.scoped.json: exit 0 (landed surface green; scoped include list does not cover src/generated/).
- tsc --noEmit on src/generated/zodSchemas.ts directly: exit 2 — TS2307 Cannot find module 'zod'. zod is absent from packages/repop/package.json (C11-owned; not edited per lane law). Registered divergence: the compile claim is UNVERIFIED until zod is added as a dependency.
