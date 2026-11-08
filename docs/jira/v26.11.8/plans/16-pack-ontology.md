# P16 Wave-2 Plan: ggen Pack Semantic Core (cgap-popcorn-aoq)

Standing: PARTIAL

## Charter

Define the semantic core of the `cgap-popcorn-aoq` ggen pack: its manifest
(`pack.toml`), and the ontology graph (`ontology.ttl`) that serves as the single
source of truth for projected entities, gates, and frontend type contracts.
The pack is the generation contract for the repop frontend surface — generated
code wins over hand-written, determinism law applies (no wall-clock stamping).
Derived from Wave-1 resolution R9 (docs/wave-1-resolutions.md).

## Resolved decisions

- **Projection profile `projection` in `pack.toml`** — templates + gates +
  witnesses; scaffolded via `scripts/new_pack.py cgap-popcorn-aoq --profile
  projection`. No ggen.toml rule-authoring profile.
- **Single pack-scoped IRI namespace** — all ontology individuals minted under
  one base IRI scoped to the pack, matching the aoq-pack anatomy precedent;
  fixes the IRI-mismatch class seen in ai-chatbot-shadcn-pack
  (`gc:GenerationSubject` case variants).
- **Closed enums** — every enumerated vocabulary in `ontology.ttl` is closed:
  each enum class carries an exhaustive member list; consumers must fail loud
  on unlisted values, never default silently.
- **64B field tables in RDF** — the pinned 64-byte record layout (P1 ABI) is
  mirrored as RDF field tables in the ontology so templates project offsets,
  widths, and types from the graph, not literals in TSX.
- **Hyperplane vocabulary** — ontology defines classes/properties for the
  hyperplane solver surface (planes, normals, projection results) consumed by
  useHyperplane templates.
- **`sh:NodeShape` entity contracts** — NTE, GPM, and geofence demo entities
  get SHACL node shapes; these feed `shacl-to-zod` projection for runtime TS
  types (per R9 frontend-contract law). Shapes are the single contract;
  hand-written zod schemas are banned.
- **NO `[dependencies]` table in `pack.toml`** (FM-PACK-014) — pack carries no
  dependency resolution; admission sequence handles the rest.

## Owned files

- `packs/cgap-popcorn-aoq/pack.toml`
- `packs/cgap-popcorn-aoq/ontology.ttl`

These two files are exclusive to lane J16 this wave; gates/, witnesses/, and
templates/ belong to downstream lanes and are not touched.

## Gates

- Pack-schema validation over `pack.toml` (projection profile, no
  `[dependencies]` table) and `ontology.ttl` (IRI scoping, closed enums,
  well-formed SHACL shapes). Gate must exit nonzero on: missing profile key,
  presence of a `[dependencies]` table, IRI outside the pack namespace, or an
  open enum class.

## Dependencies

- **Upstream**: P1 ABI freeze — the 64B layout and field tables cannot be
  minted into RDF until the layout is pinned; pack ships last (R9/E20).
- **Downstream**: P17 (templates) and P18 (gates/witnesses) consume
  `ontology.ttl` and the pack manifest; both block on this lane's output.

## UNVERIFIED-pending

- Exact field list of the 64B layout (awaiting P1 freeze receipt).
- Final enum member sets for NTE/GPM/geofence vocabularies.
- `shacl-to-zod` projection compatibility with the minted NodeShapes.
- Whether `scripts/new_pack.py` supports `--profile projection` as invoked in
  R9 (unexecuted this lane).
