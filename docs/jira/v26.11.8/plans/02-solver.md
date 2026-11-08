# P2 Wave-2 Plan — Kernel Hyperplane Solver

Standing: PARTIAL

## Charter

Design the NET-NEW hyperplane solver for the repop kernel (no_std, wasm32-unknown-unknown):
given a 64B IntentFrame and HyperplaneRegister set, evaluate NTE/GPM/geofence boundaries
branchlessly over f64 lanes, reduce with mask-select, and emit pass/refuse verdicts for P3
receipt emission. Every design claim below cites wave-1 resolution R4
(`docs/wave-1-resolutions.md`) — the solver is new code, but its idioms (SWAR, select,
threshold courts, Divan benches) are proven cgap capital.

Scope: solver algorithm + its benches + its differential courts. Excludes: CAS registry
(P3), wasm glue/exports (P4), court corpora ownership (P5 consumes our oracle seam).

## Resolved decisions

All decided in Wave 1 (R4); this plan refines, does not contradict.

1. **Branchless f64 boundary evaluation.** Three hyperplane families per frame:
   `H_nte` (not-to-exceed), `H_gpm` (burn-rate), `H_geo` (geofence). Each evaluates
   `sign(bitcast_f64_to_u64(x - threshold))` as an integer mask — comparison on the
   integer domain avoids f64 compare branches and NaN-ordering surprises; NaN payloads
   map to the refuse side explicitly (typed, fail-closed per lane law).
   Source idiom: `cgap-branchless/src/{swar,select,arithmetic}.rs` (R4, E15).
2. **Mask-select reduction.** Per-hyperplane verdict bits packed into one u64 SWAR
   register; final verdict = selection network, not control flow. No stream-compact.
   The E15 witness stands: hand-SWAR stream-compact LOST 11% to autovectorized scalar
   code — we measure before claiming any SWAR win, and autovector is the baseline lane
   in every bench.
3. **Stable rustc; no `portable_simd` unless measured.** Nightly SIMD is banned at
   authoring time. A `portable_simd` variant may be added later ONLY behind a Divan
   receipt showing a win over both SWAR and autovector baselines on the wasm target.
   Until that receipt exists, the question is closed (R4, E15/E20).
4. **The 11% SWAR loss warning is load-bearing.** Any lane claim of "SWAR is faster"
   without a min-of-7 Divan receipt naming the autovector comparator is a citation
   defect. Benches always include the plain-iterator baseline.
5. **Named-const threshold courts.** Thresholds are `pub const` with `assert_live`
   anti-pinned probes (pattern: cgap bench `challenger_sales_court.rs`, R4/E15) so a
   court cannot silently pass on a pinned/dead constant.

## Owned files

All under `/Users/sac/repop` (repop keeps its own workspace; deps vendored per R11).

- `crates/repop-kernel/src/solver.rs` — solver entry: `fn evaluate(frame: &IntentFrame,
  regs: &HyperplaneRegisterSet) -> Verdict`. No_std, no alloc on the hot path. Internals:
  `h_nte()`, `h_gpm()`, `h_geo()` returning packed u64 masks; `reduce(masks) -> Verdict`
  via select network. NaN/inf inputs map to `Verdict::Refuse(RefusalKind::DomainViolation)`.
- `crates/repop-kernel/src/solver/boundary.rs` — the f64→u64 integer-domain boundary
  predicate: monotone-ordering-safe bitcast compare, named threshold consts
  (`NTE_LIMIT_F64`, `GPM_RATE_F64`, `GEO_RADIUS_F64`) each with an `assert_live` probe.
- `crates/repop-kernel/src/solver/oracle.rs` — scalar reference implementation (plain
  iterators, obvious to a human) exposed to P5 as the differential oracle. Not a test
  helper: a public `pub fn scalar_evaluate(...)` so P5's courts import it from the crate.
- `crates/repop-kernel/benches/solver_bench.rs` — Divan benches (not criterion, R4):
  lanes = {SWAR, autovector/plain-iterator, scalar-oracle}, min-of-7 harness config,
  `CountingAlloc` non-vacuity probe asserting the hot path performs zero allocations.
- `crates/repop-kernel/tests/solver_differential.rs` — thin integration court wiring
  solver vs oracle over SplitMix64 seed `0xA20C_0FFE_E5A7_E000` corpora; mutation leg:
  flipping one boundary predicate must fail this suite (court carries its own kill).
- File conflicts: `src/solver.rs` + `src/solver/` module dir are P2-exclusive; P3 owns
  `cas.rs`/`receipt.rs` siblings; P5 owns `tests/` corpora beyond the wiring file above.

## Gates

- **Differential vs scalar oracle** — `cargo test -p repop-kernel
  --test solver_differential`; must FAIL when one `h_*` predicate is mutated
  (mutation leg in the suite itself).
- **Threshold-court liveness** — `assert_live` probes on each named const; the
  court refuses to pass when a const is pinned to a trivial value.
- **Divan bench min-of-7** — `cargo bench -p repop-kernel --bench solver_bench`;
  `CountingAlloc` reports 0 hot-path allocs, and the bench prints baseline lanes
  (SWAR vs autovector) — a win claim without the autovector lane is invalid.
- **no_std compile** — `cargo build -p repop-kernel
  --target wasm32-unknown-unknown`; the build itself is the gate, std leak =
  compile error.

Chicago law: real collaborators only — the oracle is a real second implementation, not
a mock of the solver; benches run real code and assert on measured output.

## Dependencies

- **P1 ABI (blocked-on):** `IntentFrame`/`HyperplaneRegisterSet`/`Verdict` types come
  from `@repop/abi` 64B pinned layout. Solver codes against P1's Rust types; until P1
  lands, P2 writes against a local `#[doc(hidden)]` placeholder module and swaps at
  integration. Type-shape changes from P1 are integration events, not P2 drift.
- **P5 courts (provides-to):** P2 owns `oracle.rs` + the differential wiring file; P5
  owns corpora expansion, boundary sweep, and additional mutation legs. P5 needs the
  `scalar_evaluate` public seam to exist — that seam is P2's deliverable, P5's input.
- **P3 receipt emission (downstream):** `Verdict` must be receipt-encodable; P2 keeps
  `Verdict` a plain fixed-width enum (no heap) so P3 can serialize it into the 64B
  UnsealedReceipt path without allocation.

## UNVERIFIED-pending

- Whether SWAR beats autovector on this workload at all — deliberately unknown; the
  bench answers it. No claim either way until the min-of-7 receipt exists (the 11% E15
  loss is the prior, not the verdict).
- Whether `portable_simd` is ever justified — closed unless a measured nightly win
  appears; no receipt exists.
- Exact `IntentFrame` field names/offsets — pending P1's pinned layout.
- wasm32 footprint cost of the solver — pending P4's footprint gate run.
