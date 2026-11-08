# C6w — repop-kernel-wasm ABI re-attach + codec wire-up — Wave-3 CONSTRUCT receipt

Standing: PASS

## Scope

Lane C6w, repo `/Users/sac/repop` (no git repository present on this checkout
— no commit made; coordinator owns git transitions). Owned files edited:

- `/Users/sac/repop/kernel/crates/repop-kernel-wasm/Cargo.toml`
- `/Users/sac/repop/kernel/crates/repop-kernel-wasm/src/lib.rs`

repop-abi sources (C1-owned) and repop-kernel (C3/C4-owned) untouched.

## Wire-up (flips recorded honestly)

1. **Path dep re-attached**: `repop-abi = { path = "../repop-abi" }` in
   `Cargo.toml`; the C6 decoupling comment removed (one line, disclosure
   comment retained pointing at the P2/P3 repop-kernel future dep).
2. **`repop_abi_version` now reads repop-abi**: `ABI_VERSION` is derived from
   `repop_abi::layout_spec::LAYOUT_VERSION as u32` — the ad-hoc `= 1`
   constant is gone. `repop_version` still mirrors `CARGO_PKG_VERSION`
   statically (no alloc). (Flip: C6's UNVERIFIED "export signatures not yet
   validated against real P1 layouts" → wired, exported, runtime-observed
   value 1.)
3. **Frame validation wired to real codecs**: `repop_solve` decodes the
   64-byte intent frame via `repop_abi::frame::IntentFrame::decode`
   (magic/version/reserved-zero/FNV digest laws); `repop_receipt_emit`
   decodes via `repop_abi::receipt::ReceiptFrame::decode` (adds alg_id seam +
   flags/payload_len-zero laws). Read path is bounds-checked against
   `memory.size` (fail-closed typed refusal, never a trap). `repop_cas_*`
   stay unconditional `ERR_UNWIRED = 7` — P2/P3 own those surfaces; the value
   frame type crossing `repop_cas_commit` is not mechanical (untyped slot
   semantics), so no codec wiring was applied there.
4. **Capability status unchanged**: a VALID intent/receipt still returns
   `ERR_UNWIRED` — the solve/seal capabilities remain P2/P3 work; C6w wired
   validation only.

## Gates (ran this session, real exits)

| Gate | Command (cwd `/Users/sac/repop/kernel`) | Exit | Result |
|---|---|---|---|
| Build | `cargo build --release --target wasm32-unknown-unknown -p repop-kernel-wasm` | 0 | artifact 901 bytes |
| Footprint gate | `python3 scripts/footprint_gate.py` | 0 | all 4 legs PASS |
| — exports leg | via gate | — | 9-of-9 exact match, no extras (wasm-objdump) |
| — size leg | via gate | — | 901 <= 131072 (budget holds; +342 B vs C6's 559 B for the codecs — 0.69% of budget) |
| — mutation leg | via gate | 0 | mutated module FAILS exports leg (missing `repop_abi_version`) → gate refuses; non-vacuous |

## Runtime probe (Chicago-style falsifier, real wasm run)

`node /tmp/c6w-probe.js` instantiates the release artifact (node
WebAssembly), writes real sealed frames into linear memory, calls the wired
exports. Observed (exact outputs):

- `abi_version 1` (from repop-abi `LAYOUT_VERSION`), `version 256` (0.1.0)
- `solve_valid 7` — sealed `IntentFrame` accepted by the real codec, then
  ERR_UNWIRED (capability placeholder preserved)
- `solve_garbage 1` — non-frame bytes → `ERR_BAD_INTENT`
- `receipt_valid 7` / `receipt_garbage 5` — `ERR_RECEIPT_INVALID` for
  garbage
- `solve_oob 1` — offset `0x7ffff000` beyond memory size → typed refusal,
  no trap

Probe-defect note (honesty): the first probe run reported valid frames as
refused — the defect was in the probe (JS FNV-1a multiply losing precision
past 2^53; low bits wrong → digest mismatch). Cross-checked the exact byte
vector through the real codec via a scratch Rust probe (`/tmp/abi-probe`,
path-dep on repop-abi, roundtrip `Ok`, raw decode `Ok`, digest 4294020509):
codec accepted the same bytes the wasm module later accepted. The wasm
module was correct; the probe was fixed (BigInt multiply) and re-run.

## UNVERIFIED / remaining

- `repop_solve`/`repop_receipt_emit`/`repop_cas_*` still return
  `ERR_UNWIRED` on valid input: solve/seal/CAS capabilities land with P2/P3.
- Mutation-leg python-fallback export parser still not independently
  exercised (objdump present, same as C6).
- Size budget re-pin consideration (post-P2/P3) carried over from C6.
- Scratch probes live in `/tmp` (`c6w-probe.js`, `abi-probe/`) — disposable,
  not repo capital.
