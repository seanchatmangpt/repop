# P18 Pack Templates Plan (Wave 2)

Standing: PARTIAL

## Charter

Author the TSX template family for the `cgap-popcorn-aoq` ggen pack
(`packs/cgap-popcorn-aoq/templates/*`), turning the P16 ontology + P17 gates
into a deterministic projection surface. Templates must render byte-identical
across runs, honor the projection profile (R9), and consume the P16 namespace
law without re-inventing it. Precedent anatomy: aoq-pack (E5, E14).

## Resolved decisions

- TSX template conventions from E18 (binding on this lane):
  - Each template opens with a `{% raw %}` wrap so ggen's template engine
    never interprets literal TSX braces.
  - Every emitted component carries `"use client"` and `to:` frontmatter so
    the pack's consumers get stable import routing.
  - `gc:GenerationSubject` is referenced through case variants under the
    pack's own namespace (P16 namespace law), never a bare literal.
  - IRI-mismatch bug fix carried forward: the ai-chatbot-shadcn-pack bug
    (subject IRI generated in one casing, matched in another) must not
    recur — every subject IRI mint is derived from a single canonical case
    form defined once in the P16 ontology, then lowercased consistently at
    match sites.
- SPARQL gate bindings reference template variables through `sparql:`
  bindings in the template frontmatter, not inline string concat.
- Drift gate: regenerate the full template family into a scratch dir, then
  `diff -r scratch packs/cgap-popcorn-aoq/templates/` — zero diff is the
  pass condition; any diff is a hard fail (no manual edits to rendered
  output).
- Template scope split (v26.11.8 vs deferred), per R9 "ship last":
  - v26.11.8 ships: provider scaffold, entity slice template, receipt
    surface template, refusal/drift/boundary template — the minimal set
    P11/P12/P13 consumers need.
  - Deferred: storybook/demo templates, theming variants, non-client
    server-component templates.
- Frontend contracts stay ontology-first: runtime types come from
  `sh:NodeShape` minting → shacl-to-zod projection (E18), never hand-written
  zod schemas inside templates.

## Owned files

- `packs/cgap-popcorn-aoq/templates/*` (exclusive to P18; no other lane
  writes here).

## Gates

- Deterministic render ×2: render the full family twice from the same
  ontology + template inputs; the two outputs must be byte-identical
  (`cmp` exits 0 on every emitted file).
- Drift gate: scratch regeneration + `diff -r` against `packages/` —
  committed output must equal a fresh render.
- Both gates fail-closed: a skip or empty render is a FAIL, not a pass.

## Dependencies

- P16 (`ontology.ttl` + `pack.toml` + namespace law) — templates bind
  against its vocabulary.
- P17 (12 gates, witnesses, `gate-court.toml`, `verify.py`) — witness
  fixtures and refusal classes shape template emission.
- P1/P11/P12/P13 package surfaces (`@repop/abi`, repop provider/hooks/
  boundary) — templates must emit imports that compile against their final
  public APIs; API drift upstream forces a template update here.

## UNVERIFIED-pending

- Exact template-variable names in `sparql:` bindings — UNVERIFIED until
  P16 lands the ontology and the first render round-trips.
- Final import paths for P11/P12/P13 public APIs — UNVERIFIED until those
  packages freeze their exports (P1 ABI pin likewise).
- Witness fixture stems this family must satisfy — UNVERIFIED until P17's
  gate-court.toml names them.
- Byte-identity gate has not been executed yet — plan-stage claim only.
