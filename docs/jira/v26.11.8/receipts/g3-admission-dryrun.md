# G3 admission dry-run: cgap-popcorn-aoq (no landing)

Standing: PARTIAL

Lane: G3 (maximize ggen usage), wave v26.11.8, 2026-11-08. Dry-run of the full
marketplace admission sequence for `cgap-popcorn-aoq` WITHOUT landing it.
Read-only wrt `/Users/sac/ggen-marketplace` (no admission edits); scratch at
`/tmp/g3-dryrun-v2` (mirrors scripts/, scaffolds/, marketplace.toml,
lifecycle.toml, monetization.toml, docs/, tests/, and all 358 packs including
the candidate). Source of truth for the candidate: `/Users/sac/repop/packs/cgap-popcorn-aoq/`
(re-synced mid-run via rsync — the C16/C17 lane landed `docs/` and
`servengine-projection/` into the source while the dry-run was in flight).

## ggen binary ground truth

`ggen --version` → `ggen 26.11.5` (exit 0).

## Per-command receipts

All commands run from `/tmp/g3-dryrun-v2` (scratch marketplace root) unless noted.

| # | command | exit | outcome |
|---|---|---|---|
| 1 | `python3 scripts/new_pack.py cgap-popcorn-aoq --profile projection` | 1 | `REFUSED:PACK_EXISTS:/private/tmp/g3-dryrun-v2/packs/cgap-popcorn-aoq`. No `--dry-run` flag exists; refusal-on-existing-dir is the closest dry-run semantic. Scaffolds (scaffolds/pack-skeleton/{common,projection,project}) carried into scratch and intact. |
| 2 | `python3 scripts/marketplace.py check cgap-popcorn-aoq --no-qualify` (first attempt, docs/ not yet mirrored) | 2 | 21 `REFUSED:DIATAXIS_DOCUMENT_MISSING` lines (docs/ tree absent) + 2 pre-existing `GATE_SOURCE_EXTENSION` + 1 pre-existing `LIFECYCLE_EVIDENCE_MISSING`. Scratch-fidelity artifact, fixed by mirroring docs/ + tests/. |
| 2b | `python3 scripts/marketplace.py check cgap-popcorn-aoq --no-qualify` (docs mirrored) | 2 | Blocked repo-wide by pre-existing refusals, NOT the candidate pack. Unmasked scratch-only (see below) → `check ok packs=1 turtle=ok qualify=skipped`, exit 0. |
| 3 | `python3 scripts/marketplace.py check cgap-popcorn-aoq` (full, real ggen qualification) | 0 | `check ok packs=1 turtle=ok qualify=ok`. Real 26.11.5 double `ggen sync run --skip-ea-admission` determinism court against a temp consumer built from the scratch pack — PASSED. |
| 4 | `python3 scripts/check_gate_witness_courts.py --packs /tmp/g3-dryrun-v2/packs` | 0 | 52 configured packs, all standing ALIVE. **cgap-popcorn-aoq is NOT among the 52** — the court gate does not evaluate it (no gate-court config). Gap, not a refusal. |
| 5 | `cd packs/cgap-popcorn-aoq && python3 qualification/verify.py` | 2 | FileNotFoundError — `qualification/verify.py` does not exist. Expected C16/C17 mid-flight gap. |

## Pre-existing repo-wide failures (verified NOT candidate-caused)

The check gate refuses repo-wide before per-pack verdicts. Baseline re-run in the
REAL repo: `python3 scripts/marketplace.py check cgap-popcorn-aoq --no-qualify`
from `/Users/sac/ggen-marketplace` → exit 2 with exactly:

- `REFUSED:GATE_SOURCE_EXTENSION:packs/xstate-v5-machine-pack/gates/baselines.toml`
- `REFUSED:GATE_SOURCE_EXTENSION:packs/xstate-v5-machine-pack/gates/shapes.toml` (same class, same pack)

Both verified pre-existing in the real repo (same lines, exit 2) — not introduced
by the candidate or the scratch. To unmask the candidate-level verdict, the scratch
moved those two files out of the gates/ dir and created the root `tests/` evidence
file (root-relative path, exists in the real repo; scratch did not copy tests/).
All unmasking was scratch-only and disclosed here; nothing in the real marketplace
repo was modified.

## Candidate pack structure at dry-run time

`pack.toml` (name `cgap-popcorn-aoq`, version 0.1.0, [validation].gates referencing
12 `gates/gate-NN-*.yaml` files) + `ontology.ttl` + `targets.toml` + `templates/abi_kernel.rs.tmpl`
+ `docs/` (3 queries, targets.ttl, wire_law template) + `servengine-projection/`
(ggen.toml.canonical, ontology patch, 4 queries, 9 templates) + `scripts/` dir.
**Missing for admission: `gates/` (all 12 referenced .yaml gate files), `qualification/verify.py`,
and gate-court/witness configuration** (hence the courts gate does not see the pack at all).

## Gaps C16/C17/C18 must close before real admission

1. **gates/ missing** — pack.toml declares 12 gates (gate-01-parse … gate-12-refusal-class)
   as `gates/*.yaml`; none exist on disk. Until they land, the pack is a thin pack
   (2 static signals: readme/verify absent → "thin" tier by marketplace_tiers.signals).
2. **qualification/verify.py missing** — command #5. The marketplace probe double-sync
   court (qualify_packs.qualify_pack) passes today only because the pack has no
   `qualification/marketplace-probe.txt` requirement at profile level; the dedicated
   pack verifier contract is unimplemented.
3. **Not in gate-witness-courts configuration** — command #4 evaluates 52 packs; this
   one absent. Needs a gate-court.toml / witness corpus so the fail-closed structural
   qualification actually evaluates the pack.
4. **lifecycle.toml registration missing** — no `[packs.cgap-popcorn-aoq]` entry
   (grep verified empty). `require_admitted()` discovers by directory, so check()
   passes, but lifecycle evidence expectations (root-relative evidence paths) are
   unregistered.
5. **marketplace.toml/marketplace.active.toml registration** — grep verified: no
 registries include the pack. Whether admission requires it is UNKNOWN (untested).
6. **Pre-existing xstate-v5-machine-pack GATE_SOURCE_EXTENSION refusals** — real repo
   exit 2. Every `marketplace.py check` (any pack, real repo) is red until cleared.
   Blocks a clean full-corpus release-check during admission.
7. **new_pack.py has no --dry-run** — refusal-on-existing-dir (exit 1,
   `REFUSED:PACK_EXISTS`) is the observed closest semantic; scaffolding the pack
   via new_pack.py was therefore not part of the candidate's provenance.
8. **ggen surface drift note** — installed binary is 26.11.5; the run-ggen skill
   doc (last-verified 26.10.11/26.11.3-era) lists several flags as absent that may
   now exist (e.g. `--skip-ea-admission` IS accepted by 26.11.5 sync run — used by
   qualify_packs). Skill doc refresh is a registered item elsewhere, not G3's defect.

## Falsifier

Re-run `python3 scripts/marketplace.py check cgap-popcorn-aoq` against a fresh
scratch mirror after C16/C17 land gates/ + qualification/; expect exit 0 with
gates evaluated and qualification/verify.py exit 0 from the pack root. Until then
this receipt is PARTIAL: the two highest-signal courts (pack's own verify.py,
gate-witness courts) have nothing to evaluate — they will be exercised for the
first time at real admission, not before.
