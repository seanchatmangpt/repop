# D9 Receipt — generator-of-record decision for packages/abi layout.ts

Standing: ALIVE

Lane: D9 DECISION-PIN. Repo: /Users/sac/repop. Resolves C18r finding 2
(c18r-determinism.md): abi_mirror.ts.tmpl render-vs-landed MISMATCH for
packages/abi/src/generated/layout.ts. Coordinator decision pinned 2026-11-08;
not open for re-litigation in-lane.

## Decision

**scripts/gen_ts_mirror.py is the GENERATOR OF RECORD for
packages/abi/src/generated/layout.ts.**

- gen_ts_mirror.py is the Rust-parity-gated leg: it renders from
  kernel/crates/repop-abi/src/layout_spec.rs and is covered by the C2/C2b
  golden-byte courts.
- The pack template (packs/cgap-popcorn-aoq/templates/abi_mirror.ts.tmpl)
  is an ADMISSION-STAGE projection, not the owner of the landed file.

## Consequence for the drift

The C18r MISMATCH is a named, known, NON-BLOCKING delta. It is not a defect
in gen_ts_mirror.py, in the landed layout.ts, or in
scripts/render_templates.py. render_templates.py keeps recording the
mismatch honestly — it is the guard, not the defect. No code changes under
this decision; C18r's gates and pinned baseline stand unchanged.

## Reconciliation plan (pack admission precondition)

At ggen-marketplace admission of cgap-popcorn-aoq, the pack must render
content byte-compatible with the generator of record:

- The abi_mirror template's SPARQL bindings are updated to the adopted
  field tables such that render output == gen_ts_mirror.py output
  (byte-identical on the adopted ontology).
- Until that lands, the drift remains a registered non-blocking delta.

Owner: the pack-admission lane. Deferred to marketplace landing (not
scheduled in the current wave; admitted as a precondition there).
