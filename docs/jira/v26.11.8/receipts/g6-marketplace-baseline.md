# G6 Marketplace Baseline Receipt (ggen-marketplace, READ-ONLY lane)

Standing: PARTIAL_ALIVE

Date: 2026-11-08. Repo: `/Users/sac/ggen-marketplace` @ `693291330` ("docs(receipts): xstate-v5 pack extraction receipt (M-wave evidence)"), working tree clean. ggen binary: 26.11.5. No marketplace files modified.

## Commands executed (real exits)

| Command | Exit | Output |
|---|---|---|
| `python3 scripts/marketplace.py validate` | **2** | `REFUSED:GATE_SOURCE_EXTENSION:packs/xstate-v5-machine-pack/gates/baselines.toml` and same for `gates/shapes.toml` |
| `python3 scripts/marketplace.py catalog` (run 1) | **2** | Same two REFUSED lines only (2 lines total, no catalog body) |
| `python3 scripts/marketplace.py catalog` (run 2) | **2** | Byte-identical to run 1 (`cmp` clean) |
| `python3 scripts/marketplace.py fingerprint` | **2** | Same two REFUSED lines |
| `python3 scripts/check_gate_witness_courts.py` | **0** | `standing: ALIVE`; 52 configured packs, 53 courts all `standing: ALIVE` (incl. `cgap-pack` 19 cases, `aoq-pack` 12 cases, `capability-ecology-pack` 59 cases, `workflow-corpus-pack` 18 cases) |

## Findings

1. **Pre-existing red gate**: `marketplace.py validate/catalog/fingerprint` all refuse (exit 2) with `GATE_SOURCE_EXTENSION` on `packs/xstate-v5-machine-pack/gates/{baselines,shapes}.toml`. The gate law is `GATE_SOURCE_SUFFIXES = {".rq", ".py", ".sh"}` (scripts/marketplace.py:42, refusal at :377-378) — `.toml` gate files are refused. HEAD's commit message names the xstate-v5 extraction, so this landed with that commit; it is pre-existing to this lane and per instructions NOT fixed here. Catalog/fingerprint determinism was verified only on the refusal output (byte-identical), not on real catalog bodies.
2. **Sibling courts green**: `check_gate_witness_courts.py` passes repo-wide (exit 0, 53/53 ALIVE) — the future repop pack landing will not break existing witness courts, provided it adds its own court to the same schema (`ggen.semantic-gate-witness-court/1`).
3. **CI court coverage for `packs/cgap-popcorn-aoq/**`**: **zero courts fire.** `ci/courts.json` has 94 courts; none has a glob matching that path (exact-fnmatch and loose cgap/popcorn/aoq substring sweeps both empty). Note the repo contains `packs/cgap-pack` but no `cgap-popcorn-aoq` pack exists yet — the repop pack is net-new, and a new pack needs its own `ci/courts.json` entry or it will only be covered by full/infra runs (`INFRA = ("ci/", ".github/actions/", ".github/workflows/ci.yml", "scripts/ci_plan.py")`).
4. Landing prerequisite for the repop pack: any `gates/` files must be `.rq`/`.py`/`.sh` only (no `.toml`) or `marketplace.py validate` will refuse the whole catalog including the new pack.

## Repro

```bash
cd /Users/sac/ggen-marketplace
python3 scripts/marketplace.py validate          # rc=2, GATE_SOURCE_EXTENSION x2
python3 scripts/marketplace.py catalog > a; python3 scripts/marketplace.py catalog > b; cmp a b
python3 scripts/marketplace.py fingerprint       # rc=2, same refusals
python3 scripts/check_gate_witness_courts.py     # rc=0, 53 courts ALIVE
python3 - <<'EOF'
import fnmatch, json
d=json.load(open('ci/courts.json'))
t='packs/cgap-popcorn-aoq/pack.toml'
print([c['name'] for c in d if any(fnmatch.fnmatch(t,p) for p in c.get('paths',[]))])
EOF  # -> []
```
