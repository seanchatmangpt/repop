# R-02 — Fixed-size shared Memory / SAB arena (ECOSYSTEM-SPEC-27.1.1)

Standing: **CLOSED**

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
| 250k-row soak under fixed arena | no mobile OOM / EXIT 0 | **VERIFIED** (soak court) |

## Owned files

- `packages/worker/src/ring/fixedSharedMemory.ts` — admit + alloc + partition
- `packages/worker/src/ring/fixedSharedMemory.test.ts` — Chicago court (real Memory/SAB)
- `packages/worker/src/ring/fixedSharedMemory.soak.test.ts` — 250k-row-equivalent soak
- `packages/worker/src/ring/index.ts` — barrel export

## Gates (real exits)

| Gate | Command | Expected | Observed |
|---|---|---|---|
| R-02 court | `pnpm --filter @repop/worker exec vitest run src/ring/fixedSharedMemory.test.ts` | EXIT 0 | **10** passed; EXIT **0** |
| R-02 soak | `pnpm --filter @repop/worker exec vitest run src/ring/fixedSharedMemory.soak.test.ts` | EXIT 0 | **1** passed; EXIT **0** |
| Ring suite | `pnpm --filter @repop/worker exec vitest run src/ring` | EXIT 0 | **29** passed; EXIT **0** |

## Soak — what was proved

Command:

```
pnpm --filter @repop/worker exec vitest run src/ring/fixedSharedMemory.soak.test.ts
→ 1 passed; EXIT 0
```

Against a real `allocFixedWorkerArena` (ring SAB + fixed shared Memory):

1. Arena stayed fixed: `isGrowableMemory === false`; `memory.grow(1)` threw
   throughout a 250_000-row stream.
2. Peak `ringSab.byteLength + scratch.memory.buffer.byteLength` equaled the
   planned total and never exceeded `MOBILE_SHARED_MEMORY_CEILING_BYTES`
   (32 MiB).
3. Process EXIT 0 (no OOM).

Load shape (honesty): product FFB 250k-row ingest does **not** exist on disk
yet. The soak streams **250_000 × 128 B = 32_000_000 B** of synthetic row
bytes through fixed scratch (circular overwrite) plus ring publish/drain —
Chicago-real Memory/SAB, no mocks. That is the closest real equivalent that
exercises the fixed arena under 250k-row-class cumulative write pressure.

Standing is **CLOSED** for the R-02 arena/OOM risk on that evidence.
Do **not** claim Foundry ALIVE from this receipt.

## Honesty — what is NOT proved

- No product FFB / GraphQL / table 250k-row ingest path was executed (none on disk).
- Kernel wasm linear memory remains growable via `arena.rs` `memory.grow`.
- Browser COI path for the same court is redundant with Node here (Node
  constructs shared Memory); a chromium `.browser.test.tsx` is optional,
  not required to keep the invariant locked.
- FFB GA / Foundry ALIVE are out of scope.
