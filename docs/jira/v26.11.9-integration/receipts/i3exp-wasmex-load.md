# I3exp — wasmex 0.15+ loads repop_kernel_wasm.wasm (wasm32-unknown-unknown): experiment receipt

Standing: PASS

## Question

Does wasmex ~> 0.15 load the wasm32-unknown-unknown cdylib `repop_kernel_wasm.wasm`
(901 B, 9 raw exports, zero imports) — X20's biggest unknown for seam S3.

## Verdict: GO

S3 proceeds as planned: a plain wasm32-unknown-unknown cdylib with zero imports
loads, instantiates, and executes under wasmex with EMPTY imports. No
wasm32-wasip1 rebuild needed.

## Evidence

### Artifact (built fresh this session)

- `cd /Users/sac/repop/kernel && cargo build --release -p repop-kernel-wasm --target wasm32-unknown-unknown`
- `target/wasm32-unknown-unknown/release/repop_kernel_wasm.wasm`, 901 bytes
- sha256 `3cc67f94d67927d3bed1c995a99538d9c0facb98a211ec4e911a134c21370e6b`

### Load path (smallest on this machine)

beam4pm pins `{:wasmex, "~> 0.15"}` (mix.exs:91) but has NO `_build`/`deps`
(nothing compiled on this machine), so its `mix run` was not the smallest
path. Instead a minimal probe project `scratch/i3exp/wasm_probe` with only
`{:wasmex, "~> 0.15"}` (resolved **wasmex 0.16.0**, precompiled NIF
`libwasmex-v0.16.0-nif-2.15-aarch64-apple-darwin.so`, no rust build) hosted
the test: `mix run /Users/sac/repop/scratch/i3exp/load_test.exs`.

### Real output (verbatim, `mix run` exit 0)

```
artifact: 901 bytes
compiled + instantiated with EMPTY imports
repop_abi_version/0 -> 1 | repop_version/0 -> packed=256 => 0.1.0
repop_solve/2 (64B zero intent frame at 1048592, out reg at 1048656) -> {:ok, [1]}
status = 1 (ERR_BAD_INTENT) — typed status returned, not a trap: ABI LOADS
scratch_remaining after solve = 65392
after scratch_reset, scratch_remaining = 65520
LOAD_TEST_OK
```

### Key observations

1. Compile + instantiate with `%{}` (zero imports) succeeds — the
   eh-personality stub build works under wasmex 0.16 / wasmtime; no WASI
   needed.
2. `repop_abi_version` = 1, `repop_version` packed = 256 = 0.1.0.
3. `repop_solve/2` on a 64B zero intent frame returns **ERR_BAD_INTENT (1)**,
   not ERR_UNWIRED (7) and not a trap: the zero frame fails real
   repop-abi decode before the unwired placeholder is reached. A typed
   status from real codec validation proves the full ABI path (memory
   read, decode, status return) executes inside wasm.
4. Wasmex API notes for the S3 facade (differences from the graphlaw
   pattern in beam4pm `lib/beam4pm_graphlaw.ex`):
   - `repop_version/0` returns a PACKED u32 (major<<16|minor<<8|patch), not
     a string pointer — decode, do not read memory.
   - `repop_solve/2` takes (intent_ptr, out_register_ptr), not one pointer.
   - void exports (`repop_scratch_reset`) return `{:ok, []}` in wasmex.
   - Low-level API (no GenServer): `Wasmex.Store.new` →
     `Wasmex.Module.compile(store, bytes)` → `Wasmex.Instance.new(store,
     module, %{})` → `Wasmex.Memory.from_instance(store, instance)`; calls
     via `Wasmex.Utils.native_request(fn from ->
     Wasmex.Instance.call_exported_function(store, instance, name, args,
     from, timeout) end)`.
5. Error paths seen while iterating (all typed, none fatal): parameter
   mismatch surfaces as `{:error, "number of params does not match.
   expected 2, got 1"}` — clean typed host error, good for facade
   diagnostics.

## Receipt

- Subject: `/Users/sac/repop/kernel` wasm cdylib (sha `3cc67f94…70e6b`) +
  scratch probe `scratch/i3exp/{wasm_probe, load_test.exs}`
- Commands: cargo build (exit 0), mix deps.get (exit 0), mix compile (exit
  0), mix run load_test.exs (exit 0)
- Script kept: `/Users/sac/repop/scratch/i3exp/load_test.exs`
- Cleanup: `mix.lock` deleted; dep sources cleaned via `mix deps.clean
  --all`. `scratch/i3exp/wasm_probe/_build` (compiled NIF) NOT deleted —
  `rm` denied by the session permission system; pending manual cleanup
  (rebuild recipe: `mix deps.get && mix compile` in wasm_probe). No edits
  to beam4pm (read-only).
