# S3 — wasmex facade for repop_kernel_wasm.wasm (BeamPM.Repop session-style host)

Standing: ALIVE

## Scope

- WRITE repo: /Users/sac/beam4pm — owned files only, no other beam4pm file touched.
- Read-only: /Users/sac/repop (kernel artifact source + receipt dir).
- GO source: i3exp receipt (same dir), Standing PASS — wasmex 0.16 loads the
  901 B wasm32-unknown-unknown artifact with EMPTY imports.

## Landed files (beam4pm, all untracked-new; coordinator owns git)

- `lib/beam4pm_repop.ex` — hand-authored facade, NOT ggen-generated; two
  modules in one file: `BeamPM.Repop.Session` (opaque store+module+instance+memory
  struct) + `BeamPM.Repop` (session-style host, template family BeamPM.Tract,
  lighter session pattern per dispatch).
- `test/beam4pm_repop_test.exs` — 15 ExUnit tests against the REAL engine
  (zero mocks; every assertion executes the pinned artifact inside wasmex).
- `priv/repop/repop_kernel_wasm.wasm` — copied from
  /Users/sac/repop/kernel/target/wasm32-unknown-unknown/release/, sha256
  3cc67f94d67927d3bed1c995a99538d9c0facb98a211ec4e911a134c21370e6b, 901 bytes
  (byte-identical rebuild after the post-i3exp target cleanup; sha verified
  equal to the i3exp pin before copy).
- `priv/repop/MANIFEST.json` — sha256, byte size, ABI/packed version, export
  list, 0..7 status vocabulary, provenance (build recipe + load receipt).

## Gates actually run (beam4pm, this session)

- `mix deps.get` — exit 0 (first-ever deps on this machine; wasmex resolved
  0.16.0, precompiled NIF aarch64-apple-darwin).
- `mix compile` — exit 0, no errors. Compile-time artifact pin: module body
  reads priv artifact at compile time, asserts sha256 == pinned literal,
  raises CompileError on absence/sha drift/size drift (missing-artifact and
  drift refusals are loud, not silent).
- `mix test test/beam4pm_repop_test.exs` — exit 0, **15 tests, 0 failures**.
  Asserts the LANDED artifact's actual behavior: abi_version 1, version
  "0.1.0", zero frame → :err_bad_intent, random garbage frame →
  :err_bad_intent, codec-VALID frame (magic 0x4946, version 1, zero
  reserved, FNV-1a32 digest of [0,60)) → :err_unwired, host-side size guard
  (63/65/0-byte frames → {:error, {:bad_frame_size, n}}), cas_commit/cas_read
  → :err_unwired, scratch-remaining invariant across 5 solves (per-call
  reset), MANIFEST.json agrees with pin, status_name vocabulary 0..7.
- Full `mix test` NOT run (lane isolation; other lanes' files are in
  flight in the same tree) — coordinator runs the full gate at drain.

## API notes honored (from i3exp receipt + kernel source, both re-read this session)

- repop_version returns a PACKED u32 (decoded host-side: 256 → "0.1.0"),
  never read from memory.
- repop_solve takes (intent_ptr, out_register_ptr); void exports return
  {:ok, []}; low-level Store/Module/Instance/Memory + native_request pattern.
- Pointers normalized per the packed-u64-signed-i64 law (band 0xFFFF_FFFF);
  null (0) pointer refused, never written at offset 0.
- Status vocabulary from kernel crates/repop-kernel-wasm/src/abi.rs:
  0 OK / 1 ERR_BAD_INTENT / 2 ERR_NO_HYPERPLANE / 3 ERR_CAS_VERSION /
  4 ERR_CAS_ABSENT / 5 ERR_RECEIPT.IntentErr ERR_RECEIPT_INVALID /
  6 ERR_OOM / 7 ERR_UNWIRED.

## Disclosed conflicts / coordinator decisions needed

1. **Authorship gate (GATE AUTHORSHIP)**: `lib/beam4pm_repop.ex` and
   `test/beam4pm_repop_test.exs` are hand-authored files under manufactured
   roots with no GENERATED marker. beam4pm CLAUDE.md law: they must be
   admitted as `bpm:HandAuthoredSource` individuals in ontology.ttl and
   regenerated in the same commit. Dispatch forbade touching other beam4pm
   files, so I did NOT edit ontology.ttl — the authorship gate WILL refuse
   these two files until the coordinator admits them. Flagged, not worked
   around.
2. `mix deps.get` created `deps/` + `_build/` + modified `mix.lock` in
   beam4pm (first compile on this machine). Per the lane-lease cleanup law,
   these are build roots, not assets; mix.lock change is a side effect of
   the first resolution — coordinator decides keep/revert at drain.
3. UNVERIFIED (honest): solve is placeholder-unwired until Y2/kernel wiring —
   a codec-VALID intent frame returns :err_unwired, which is the LANDED
   artifact's honest behavior and exactly what the tests pin. ERR_UNWIRED
   means capability absent, never success.

## Replay

```
cd /Users/sac/beam4pm
mix compile                                   # exit 0; compile-time sha pin fires here
mix test test/beam4pm_repop_test.exs          # exit 0; 15 tests, 0 failures
```

Artifact provenance replay (if the priv artifact is ever lost):

```
cd /Users/sac/repop/kernel
cargo build --release -p repop-kernel-wasm --target wasm32-unknown-unknown   # exit 0
shasum -a 256 target/wasm32-unknown-unknown/release/repop_kernel_wasm.wasm   # 3cc67f94…70e6b, 901 B
cp target/wasm32-unknown-unknown/release/repop_kernel_wasm.wasm /Users/sac/beam4pm/priv/repop/
```
