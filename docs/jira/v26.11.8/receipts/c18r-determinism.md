# C18-r Receipt — determinism court for pack templates (cgap-popcorn-aoq)

Standing: PASS (gate exit 0, lane-local; drift finding recorded non-gating)

Lane: C18-r CONSTRUCT. Repo: /Users/sac/repop. Trigger: R4 census — 7 .tmpl
files in packs/cgap-popcorn-aoq/templates/ with NO render/determinism gate
anywhere. C16b's three-frame adopted ontology (c16b-adoption.md) is the
binding source. Owned files this lane: scripts/render_templates.py,
scripts/render_baseline.json, docs/jira/v26.11.8/receipts/c18r-determinism.md.
Templates NOT owned (C18's lane) — mutated only inside the shim court, with
byte-exact restores verified by sha256.

## What landed

- **scripts/render_templates.py** — deterministic render harness:
  parses each .tmpl frontmatter (yaml), resolves every `sparql:` binding
  with rdflib against ontology.ttl (rows .toPython()'d, deterministically
  sorted by full row tuple so an ORDER BY gap in a template query cannot
  cause run-to-run drift), renders via jinja2 StrictUndefined (the loud
  UNBOUND-SUBJECT fallback is rendered, never a silent fake), and fails
  closed on: frontmatter parse error, SPARQL prefix-IRI mismatch vs the
  ontology namespace, render nondeterminism (x2 differ), or pinned-baseline
  sha256 mismatch. Zero-row bindings are recorded UNVERIFIED-template, not
  faked. `--update-baseline` re-pins after a REVIEWED change; `--check`
  compares against the pinned baseline (fail-closed exit 1).
- **scripts/render_baseline.json** — pinned sha256 per template render
  (7 entries) with the regeneration law in-file.

## Gates (real exits, this session)

| gate | command | exit | result |
|---|---|---|---|
| Determinism + baseline | `python3 scripts/render_templates.py --check --update-baseline` | 0 | BASELINE: updated (7 templates); all renders byte-identical x2 |
| Check | `python3 scripts/render_templates.py --check` | 0 | GATE: PASS (7 templates, 7 UNVERIFIED-template, 1 drift finding) |
| Non-vacuity: template mutation | body `export` → `export /* MUTATED */` in worker_boot_vocab.ts.tmpl | 1 | GATE: FAIL — render sha256 99fbd04d...713fda != pinned 9b619da8...f0fab (fail-closed flip witnessed) |
| Restore | mv .bak → original, sha256 assert | — | byte-exact; --check exit 0 after |
| Non-vacuity: ontology drift | 2166136261 → ...62 in ontology.ttl | 1 | GATE: FAIL (data-drift class also flips the court) |
| Restore | .bak restore + equality assert | — | byte-exact; --check exit 0 after |

## Per-template UNVERIFIED list (loud, not faked)

All 7 templates mark UNVERIFIED-template on exactly one zero-row binding:
`subject` — `cp:subject a gc:GenerationSubject` is NOT minted in
ontology.ttl (C16b UNVERIFIED list; C18 receipt finding 1, unowned here).
Renders carry the deterministic UNBOUND-SUBJECT fallback. Every DATA binding
(fields/consts/frameTypes/agentTier/statusCode/entityShapes/hyperplanes)
returned >=1 row against the adopted three-frame ontology, so the render
payloads are real data, not skeletons.

## Drift finding (recorded, NOT repaired — landed file unowned)

abi_mirror.ts.tmpl to: packages/abi/src/generated/layout.ts — landed file
EXISTS but render-vs-landed = MISMATCH (finding, non-gating). Grounding: the
landed layout.ts header says `Generator: scripts/gen_ts_mirror.py`, source of
truth layout_spec.rs — the landed file was produced by a DIFFERENT generator
than the pack template, so byte divergence is expected until a coordinator
decides which generator owns the file. Not repaired (lane law: you don't own
the landed file). Recorded non-gating per dispatch.

## Findings for coordinator (unowned, recorded only)

1. cp:subject GenerationSubject individual un-minted — all 7 templates stuck
   at UNVERIFIED-template until C16 mints it case-exact (C18 finding 1,
   still open).
2. abi_mirror vs gen_ts_mirror.py generator-of-record conflict for
   packages/abi/src/generated/layout.ts — needs an ownership decision, not a
   template edit.
   DECISION (D9, 2026-11-08): gen_ts_mirror.py is generator of record;
   drift is named, known, non-blocking; reconciliation deferred to pack
   admission — see d9-generator-of-record.md.
3. Earlier non-vacuity weakness found and FIXED this session: render-x2
   alone could not flip on a deterministic corruption (MUT_EXIT was 0); the
   pinned-baseline sha256 comparison was added, after which both mutation
   courts flip exit 1. A determinism gate without a pinned baseline is
   vacuous against content drift.

## Harness-authoring corruption note

Two long Write-tool drafts of this script came out corrupted mid-file (same
channel class C16b documented); landed via heredoc writes with
ast.parse syntax checks between appends, placeholder-hack lines patched out
before first run.
