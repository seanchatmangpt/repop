# P4 — Kernel wasm32-unknown-unknown Build (Wave 2 Plan)

Standing: PARTIAL

## Charter

Produce the kernel wasm artifact for the browser worker: build the repop kernel
(solver + CAS registry + 64B receipt emit, R10 step 3) for
`wasm32-unknown-unknown`, expose raw C-ABI exports operating on caller-supplied
linear memory, and gate the artifact on build success, export surface, and size
budget. Precedent: cgap `crates/wasm-footprint` (bump allocator, panic handler,
eh stub), ported from wasm32-wasip1 to wasm32-unknown-unknown (R2, E1, E20).

## Resolved decisions

- **Raw `extern "C"` exports, no wasm-bindgen hot path.** R10 step 3 pins
  "raw linear-memory/SAB exchange — NOT wasm-bindgen JS objects for the hot
  path". Exported functions take/return fixed-width integers and offsets into
  linear memory only; zero-JSON law applies across the ABI (inherited law).
- **Bump allocator + panic handler + eh stub glue** ported from
  `cgap/crates/wasm-footprint` (E1, E20). The allocator serves kernel-internal
  allocations only; the ABI surface itself is allocation-free where possible
  (fixed-width 64B frames, per R3/P1 layouts).
- **Caller-supplied linear memory.** The host (P6/P7 worker) owns the SAB ring
  and passes base offsets/lengths per call; the kernel never mints its own
  exchange buffers. WIR0 slot layout (16B BE header + CRC32 + ordinal, 4KiB
  slots) is the caller-side contract (R5, E2) — P4 consumes offsets, does not
  re-define layout (P6 owns it).
- **Vendored deps.** Kernel deps are vendored copies of cgap-blake3,
  cgap-branchless, cgap-arrow per the P28-SIL default (R11), with
  LICENSE-P28-SIL.md attribution; no path deps into the cgap workspace.

## Owned files

- `~/repop/kernel/glue/` — wasm entry crate: bump allocator, `#[panic_handler]`,
  eh stub, `extern "C"` export table (new crate, e.g. `repop-kernel-wasm`).
- `~/repop/kernel/glue/exports.rs` — export signatures (P1 64B frame ops,
  solver entry, CAS version, receipt emit).
- `~/repop/kernel/justfile` (or root justfile fragment) — wasm build + gate
  recipes.
- `~/repop/kernel/wasm-gates/` — exports-list check script + size-budget gate.

Not owned: kernel solver/CAS internals (P2/P3), SAB ring layout (P6), boot
chain (P7), ABI type definitions (P1 — P4 consumes the generated layouts).

## Gates

| Gate | Command (shape) | Pass condition |
|---|---|---|
| Build | cargo build, target wasm32-unknown-unknown, glue crate | exit 0; artifact exists |
| Exports | exports-check script over release `.wasm` | all P1 exports present; no extras |
| Size | `wc -c` on release `.wasm` vs pinned budget | size <= budget (pinned post-build) |
| Non-vacuity | mutate: remove one export or inflate size | gate REFUSES (court must flip) |

Size budget is a pinned constant, not a vibe: first measured release build
sets the number; the gate then holds it fail-closed.

## Dependencies

- Upstream: P1 (64B layouts — export signatures depend on it), P2 (solver),
  P3 (CAS + receipt emit) — glue crate wraps their APIs.
- Downstream: P6 (SAB ring consumes the export/offset contract), P7 (boot
  chain instantiates this artifact), P9 (frame router binds export IDs).
- Blocked-on plan: if P2/P3 land after P4's glue scaffold, glue compiles
  against P1 layouts + stub kernels, gates stay red until real kernels land.

## UNVERIFIED-pending

- Which crate cgap justfile:150 builds for wasm32-unknown-unknown (E20 flag) —
  verify before porting wasm-footprint glue.
- Initial size budget number — UNVERIFIED until first measured release build.
- eh-stub necessity on wasm32-unknown-unknown vs wasip1 — confirm during
  first build; drop if target does not require it.
- Exact export name list — UNVERIFIED until P1 layouts land; P4 pins the
  allowlist then.
