# P6 Wave-2 Plan: SAB Ring (WIR0 Slot Port, Atomics Ring, Transport Seam)

Standing: PARTIAL

## Charter

Port the WIR0 slot format into an Atomics-based SPSC ring over SharedArrayBuffer
in `packages/worker/src/ring/`, with a transport trait seam so the postMessage
fallback (R5: COI is environment-fragile, non-SAB fallback REQUIRED) swaps only
the I/O backing — ring layout stays fixed. Zero-JSON across the boundary;
binary fixed-width only.

## Resolved decisions (from wave-1 R5 + E2/E20, frozen)

- **Slot format (WIR0, frozen)**: 16B big-endian header + CRC32 + ordinal
  trailer, 4KiB slots, 4080 max payload per slot (4096 - 16 header bytes).
- **Control page**: dedicated leading page of the SAB holding Atomics words:
  write cursor, read cursor, wrap/drop counters, capacity ordinal. All cursor
  movement via `Atomics.add`/`Atomics.compareExchange` — never plain stores.
- **Ordering**: SPSC protocol — producer claims/publishes, consumer
  reads/releases. Publish uses `Atomics.store(..., 'release')`; claim/read uses
  `Atomics.load(..., 'acquire')`. Single producer, single consumer only;
  MPMC is out of scope (see Dependencies).
- **Consumer pacing**: bounded-poll with `Instant`-style deadline (performance
  `now()` budget), never a fixed sleep — no-sleep law applies to the worker
  hot loop. Empty-ring polls are bounded, observable, deadline-checked.
- **Feature detection**: probe `typeof SharedArrayBuffer !== 'undefined'` plus
  COI eligibility (same check shape as atomvm boot, R5 lines 154-167). No-SAB
  => MessageChannel-based yield fallback behind the same transport trait, same
  slot format over postMessage binary frames (transferables, zero-JSON).
- **Transport trait seam**: `Transport` interface with `send(bytes)` /
  `onMessage(cb)`; SAB ring and MessageChannel fallback are two impls.
  Consumer code (P9 router) depends on the trait, never the impl.

## Owned files

- `packages/worker/src/ring/slot.ts` — WIR0 header encode/decode, CRC32,
  ordinal check, 4080 payload clamp.
- `packages/worker/src/ring/control.ts` — control page Atomics word layout.
- `packages/worker/src/ring/ring.ts` — SPSC claim/publish/read/release ring.
- `packages/worker/src/ring/transport.ts` — Transport trait + selection
  (SAB vs fallback) with feature detection.
- `packages/worker/src/ring/fallback.ts` — MessageChannel yield transport.
- `packages/worker/src/ring/ring.browser.test.tsx` — browser courts.

## Gates

### Codec refusal paths

- Court: corrupt CRC32, bad ordinal, oversize payload each yield a typed
  refusal — fail-closed, never silent drop.
- Mutation leg: flip one refusal check per test; the court must flip to FAIL.

### Browser SAB ring

- Court: `.browser.test.tsx` under the vitest browser project (real chromium,
  per R6); producer/consumer round-trip, wrap-around, Acquire/Release
  ordering under load.
- Mutation leg: drop the Release store; consumer must observe a stale read.

### Fallback transport

- Court: no-SAB environment — identical slot bytes traverse MessageChannel;
  ring API unchanged.
- Mutation leg: stub feature detection to force the fallback; the
  transport-selection test must flip.

## Dependencies

- **P4** (kernel wasm exports): ring carries opaque frame bytes only, but max
  frame size and export names must match P4's C-ABI surface — consume P4's
  export list once frozen.
- **P7** (boot chain mode): ring transport selection consumes P7's COI/SAB
  check result; the trait seam is the contract between the two lanes. P6 owns
  the seam type; P7 calls it.
- **P9** (frame router): router is the Transport consumer — correlation-ID
  framing rides inside the 4080B payload. Open question to P9/coordinator:
  **multi-consumer** — if P9 needs fan-out, the SPSC law must be restated
  (per-consumer cursor page or fan-out at router layer). Default: SPSC holds,
  fan-out lives above the trait.

## UNVERIFIED-pending

- CRC32 choice (CRC-32/ISO-HDLC vs Castagnoli) — pending P4 footprint budget.
- Control page word count / cache-line padding — pending browser contention
  measurement (measure, never claim; R4 warning applies).
- Whether MessageChannel fallback needs backpressure counters — pending P9
  router design.
- Exact export-name pins from P4 — UNVERIFIED until P4's receipt lands.
