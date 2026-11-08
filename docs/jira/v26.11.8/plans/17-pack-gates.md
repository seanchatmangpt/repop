# P17 — Pack Gates + Witnesses (cgap-popcorn-aoq)

Standing: PARTIAL

## Charter

Plan Wave-2 work for P17: author the refusal-class SPARQL gate set, pass AND fail
witnesses for every gate stem, `gate-court.toml`, and `qualification/verify.py` for the
`cgap-popcorn-aoq` ggen pack (`~/repop/packs/cgap-popcorn-aoq`). Grounded in Wave-1
resolutions R9 (pack anatomy + admission sequence) and E14 (gate-court mechanics). The
gates make the ABI/generation vocabulary machine-refusable: a template or ontology edit
that violates the invariants fails loudly at pack qualification, never silently at app
runtime.

## Resolved decisions

1. **Gate count and class**: 9 refusal-class SPARQL gates land in Wave 2 (down from the
   12 named in the ownership table; the remaining 3 are template-mechanism gates owned by
   P18 and wired here by name only). R9/E5: aoq-pack precedent is 12 gates with per-stem
   pass+fail witnesses; this pack starts at 9 and grows when P18's template gates are
   specified.
2. **Gate inventory** (each a `gates/*.rq` ASK/CONSTRUCT that must be EMPTY on conformant
   graphs — violation rows are the refusal):
   - `field-closure.rq` — every ABI field name referenced anywhere resolves to a field
     declared in the P1 ontology (field closure).
   - `offset-contiguity.rq` — declared 64B frame field offsets are contiguous, no gaps,
     no overlap, total exactly 64 bytes.
   - `wire-kind-closure.rq` — every field's wire kind is one of the closed enum of kinds
     minted in the ontology (unknown kind = refusal).
   - `status-band.rq` — status codes fall in the declared band; out-of-band codes refuse.
   - `tier-closure.rq` — receipt tier references resolve to declared tiers
     (UnsealedReceipt 229B / sealed tiers per R3); undeclared tier = refusal.
   - `hook-name-closure.rq` — React hook names emitted by templates resolve to the
     declared hook vocabulary (`useCgapEntity`, `useHyperplane`, `useActor`).
   - `template-linkage.rq` — every template frontmatter `gc:GenerationSubject` links to a
     declared generation subject; dangling or duplicate linkage refuses (fixes the IRI
     mismatch seen in ai-chatbot-shadcn-pack, R9/E18).
   - `grounding-regex.rq` — template-embedded literal patterns match the grounding
     regexes (zero-JSON law at the worker boundary: JSON literals in message paths
     refuse).
   - `hyperplane-closure.rq` — hyperplane register names in solver config resolve to the
     declared register set (P2 vocabulary).
3. **Witness law**: exact-stem pass AND fail witnesses both mandatory (R9/E14). Witness
   for stem `X` = `witnesses/pass/X.ttl` (conformant graph, gate returns empty) +
   `witnesses/fail/X.ttl` (minimal violating graph, gate returns exactly the seeded
   violation row). A fail witness that does not trip its gate, or a pass witness that
   does, is a court failure.
4. **Court config**: `gate-court.toml` declares `ggen.semantic-gate-witness-court/1` per
   stem (aoq-pack precedent, R9/E5). The court runs each gate against both witnesses and
   asserts the flip (pass-witness passes, fail-witness refuses) — non-vacuity by
   construction; a gate whose witnesses cannot flip is `VACUOUS-GATE`.
5. **Qualification**: `qualification/verify.py` is the pack-local entry point in the
   admission sequence (R9/E14: `marketplace.py validate` / catalog ×2 / fingerprint /
   `check_gate_witness_courts.py` / `qualify_packs.py` / pytest / `ci_plan.py`). It
   invokes the ggen witness-court runner over `gate-court.toml` and exits non-zero on any
   refusal; it never skips a missing witness silently — a missing witness is a loud
   `COURT-BROKEN`.
6. **Typed failures**: exactly two refusal codes from this lane — `VACUOUS-GATE` (gate
   passes on its own fail witness or refuses its own pass witness) and `COURT-BROKEN`
   (court cannot run: missing witness file, malformed `gate-court.toml`, runner error).
   All other gate verdicts are the per-gate violation rows themselves.
7. **Ontology dependency**: gates query the pack ontology minted by P16
   (`ontology.ttl`, single pack-scoped IRI, R9/E5). No gate hardcodes an IRI outside the
   pack namespace; IRI drift between P16 and P17 is caught by `template-linkage.rq`.
8. **No `[dependencies]` table** in `pack.toml` (FM-PACK-014, R9/E14) — P16's file, but
   `verify.py` asserts its absence as a cheap precondition.

## Owned files

`packs/cgap-popcorn-aoq/` only:

- `gates/*.rq` (9 gate files, table below)
- `witnesses/pass/*.ttl` + `witnesses/fail/*.ttl` (18 witness files, one pair per stem)
- `gate-court.toml`
- `qualification/verify.py`

## Gates table

| Gate stem | Invariant | Violation shape |
|---|---|---|
| field-closure | ABI field refs resolve to declared fields | row: undeclared field + citing subj |
| offset-contiguity | 64B layout contiguous, no gap/overlap | row: offset != prev offset + size |
| wire-kind-closure | wire kind in closed enum | row: field with non-enum kind IRI |
| status-band | status codes inside declared band | row: out-of-band code literal |
| tier-closure | receipt tier refs resolve (229B/3.5KB, R3) | row: undeclared tier IRI |
| hook-name-closure | hook names in declared vocabulary | row: emitted hook name not declared |
| template-linkage | `gc:GenerationSubject` links resolve | row: dangling / dup subject link |
| grounding-regex | embedded literals match grounding regexes | row: literal + violated regex IRI |
| hyperplane-closure | register names resolve to declared set | row: unknown register name |

P18-dependent (name-wired here, authored there): template-mechanism gates
(`{% raw %}` handling, `"use client"`, `to:` frontmatter) — R9/E18.

## Dependencies

- **P16** (hard): `ontology.ttl` + `pack.toml` + namespace law must exist first; every
  gate queries P16's vocabulary. If P16's IRI scheme changes, all 9 gates + 18 witnesses
  re-pin (they are the consumers that make P16 drift loud).
- **P1** (vocabulary source): 64B field/offset/wire-kind names come from the ABI
  ontology P1 generates; P17 consumes the minted terms, does not invent them.
- **P18** (soft): template-mechanism gate stems wired by name in `gate-court.toml`;
  bodies authored in P18's lane.
- **P5** (pattern): scalar-oracle/boundary-court discipline carries over to witness
  design — witnesses are minimal adversarial graphs, not random corpora.

## UNVERIFIED-pending

- Exact aoq-pack gate file naming convention and `gate-court.toml` schema — re-read
  `ggen-marketplace` aoq-pack on disk before authoring (Wave-1 citations were lane-summarized).
- `check_gate_witness_courts.py` invocation signature in `verify.py` — read the script
  at implementation time.
- Whether ggen's witness-court runner requires ASK or CONSTRUCT gates — verify against
  aoq-pack's 12 `.rq` files.
- Final gate count (9 vs 12) — settles when P18 specifies its template-mechanism gates.
