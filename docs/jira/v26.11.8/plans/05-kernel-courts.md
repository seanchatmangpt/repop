# P5 Kernel Courts — Wave-2 Plan

Standing: PARTIAL

## Charter

Build the P5 court suite over the repop kernel (R10 step 2/3 surface):

differential scalar-oracle, boundary sweep, and per-court mutation legs.

Goal: every kernel court can FAIL (named mutation flips it), so a green run

is evidence, not decoration. Plan output only — this file is the edit plan;

implementation lands in a later wave per the inherited read-only law.

Inherits wave-1 laws (`docs/wave-1-resolutions.md`): Chicago testing, no

mocks of owned collaborators, courts carry mutation legs, fail-closed typed

refusals, receipt format with Standing/gates/owned-files/UNVERIFIED.

## Resolved decisions

- **Corpus seed**: SplitMix64, master seed `0xA20C_0FFE_E5A7_E000`.

  Distinct local test seeds derive as `master ^ lane_id` (u64), so each

  test lane gets a deterministic but non-overlapping stream. Corpus is

  generated, committed as fixtures with a pinned seed receipt.
- **Boundary sweep patterns**: for each numeric ABI surface (P1 layouts):

  zero, one, u64::MAX, MAX-1, MAX/2, sign boundary, NaN/±inf payload bits,

  subnormal f64, and cross-over points around every clamp/threshold in the

  solver (P2) and admissions root (P3). Sweep driver:

  `scripts/boundary_gate.py` (owned).
- **Named mutations per court**: each court names exactly one kernel-side

  mutation it must detect (see Gates table). Mutations are applied by the

  mutation harness to a sandbox copy — never in-place on the canonical

  tree (`same-checkout-fanout` law; coordinator owns git transitions).
- **Sandbox mutation mechanics**: copy kernel source into `/tmp/<court>/`,

  apply the named mutation there, run the court against the sandbox build.

  Restore proof = sha256 of originals recorded before mutation, compared

  fail-closed after; mismatch = exit 2 regardless of court outcome. The

  restore check also bumps the original's mtime so stale caching cannot

  mask a bad restore.
- **Exit-code law**: `0` = court passed and mutation flipped (or mutation

  leg N/A for pure differential runs); `1` = court failed on unmutated

  subject; `2` = sandbox/restore integrity failure; `3` = harness/config

  error (bad seed, missing fixture, unknown court name). Fail-closed: any

  unrecognized condition exits nonzero, never silently green.
- **Mutation-free green = VACUOUS**: if a court passes AND its named

  mutation does not flip it, the gate reports VACUOUS (exit 1). A court

  that cannot fail is not evidence (anti-vacuity law,
  `entropic-annealing-doctrine` falsifier clause; smalt shim-court

  precedent: a court that cannot flip is FAIL, a skip is loud).

## Owned files

- `kernel/tests/*` — court definitions, corpus fixtures, oracle harness.
- `scripts/boundary_gate.py` — boundary sweep + mutation sandbox driver.

No other files; P2/P3/P4 own kernel `src/`. Edits outside these two roots

are coordinator-reconciled collisions, not lane work.

## Gates table

| Court | Named mutation | Pass criteria |
|---|---|---|
| differential-oracle | swap solver reduction op (`f64::max`→`f64::min`) | oracle mismatch, exit 0 |
| cas-registry | skip monotonic version bump on adopt path | stale-version accept refused, exit 0 |
| receipt-emit | truncate receipt tier tag by one byte | 64B layout pin fires, exit 0 |
| admissions-root | reorder hash-chain fold to fold-before-timestamp | root mismatch, exit 0 |
| boundary-sweep | widen one clamp threshold by +1 ULP | off-by-one case fails, exit 0 |
| refusal-typing | collapse two typed refusals to one catch-all | refusal classes on wire, exit 0 |

Every row: baseline (unmutated) run must also pass first; then mutation run

must flip the court. Both receipts recorded in the court output.

## Dependencies

- **P2** (hyperplane solver): needs stable solver entry-point signature and

  reduction-op sites to target mutations; oracle mirrors its semantics.
- **P3** (CAS registry + receipt emit): needs `adopt`/`withVersion`-style

  seam names, `UnsealedReceipt` tier tags, admissions-root fold order.
- **P1** (ABI layouts, indirect): boundary patterns follow the 64B pinned

  layout constants; consumed read-only via generated layout module.
- P4 (wasm build) not required for scalar-oracle courts; sandbox builds

  target the native kernel test harness.

## UNVERIFIED-pending

- Exact P2 solver function names for mutation targeting — pending P2 API

  freeze. Court mutation strings are placeholders until then.
- Exact P3 seam/tier-tag names — pending P3 API freeze.
- Corpus fixture format (JSON vs pinned binary) — decide after P1 layout

  generation lands; zero-JSON law may force binary fixtures at the kernel

  boundary.
- Boundary sweep coverage count (cases per surface) — set once P2/P3

  clamp/threshold inventory is real; current list is structural minimum.
