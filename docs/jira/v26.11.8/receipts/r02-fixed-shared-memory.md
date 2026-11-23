# R-02 — Fixed-size shared Memory / SAB arena (ECOSYSTEM-SPEC-27.1.1)

Standing: **PARTIAL**

Risk: mobile OOM under large (250k-row) loads when growable shared
`WebAssembly.Memory` (`maximum > initial`) expands toward 64 MiB against a
~32 MB ceiling.

## What this receipt locks

| Surface | Law | Status |
|---|---|---|
| `admitSharedMemoryDescriptor` | typed refuse when `initial !== maximum` or maximum absent | **LOCKED** (court) |
| `allocFixedSharedMemory` | constructs `shared: true` with `initial === maximum`; `memory.grow(1)` throws | **LOCKED** (court) |
| `planFixedArenaPartition` / `allocFixedWorkerArena` | ring SAB + scratch Memory total ≤ 32 MiB | **LOCKED** (court) |
| `allocSab` (existing) | SAB is fixed-size at construct (cousin surface) | already fixed |
| Kernel `repop-kernel-wasm` arena `memory.grow` | growable bump path | **NOT in R-02 scope** (adjacent; left alone) |
| 250k-row soak under fixed arena | no mobile OOM / EXIT 0 | **UNVERIFIED** — exact next |

## Owned files

- `packages/worker/src/ring/fixedSharedMemory.ts` — admit + alloc + partition
- `packages/worker/src/ring/fixedSharedMemory.test.ts` — Chicago court (real Memory/SAB)
- `packages/worker/src/ring/index.ts` — barrel export

## Gates (real exits)

| Gate | Command | Expected |
|---|---|---|
| R-02 court | `pnpm --filter @repop/worker exec vitest run src/ring/fixedSharedMemory.test.ts` | EXIT 0 |
| Ring suite | `pnpm --filter @repop/worker exec vitest run src/ring` | EXIT 0 |

## Exact next verifier (does NOT close R-02)

250k-row soak against `allocFixedWorkerArena` (or successor FFB load path)
on a mobile-class memory ceiling, asserting:

1. Arena still reports `initial === maximum` / `isGrowableMemory === false`
2. Peak resident / buffer byteLength never exceeds 32 MiB
3. Process EXIT 0 (no OOM)

Until that soak EXIT 0 is recorded here, R-02 standing remains **PARTIAL**.
Do **not** claim CLOSED from this receipt alone. Do **not** claim Foundry ALIVE.

## Honesty — what is NOT proved

- No 250k-row load was executed in this lane.
- Kernel wasm linear memory remains growable via `arena.rs` `memory.grow`.
- Browser COI path for the same court is redundant with Node here (Node
  constructs shared Memory); a chromium `.browser.test.tsx` is optional,
  not required to keep the invariant locked.
- FFB GA / Foundry ALIVE are out of scope.
