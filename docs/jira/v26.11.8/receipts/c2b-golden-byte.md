# C2b: Cross-Language Golden-Byte Leg — Receipt

Standing: ALIVE

## What landed

The C2 receipt's UNVERIFIED cross-language golden-byte leg is now proven:

**Rust emit → TS decode → TS re-encode → byte-identical**, for all three
64B frames, over a deterministic SplitMix64 fixture.

- Fixture: `scripts/parity_fixture.json` (sha256
  `6b6019929cafa4bf73eef5be3cfc3cdd0ce1c3384cf875a8e4bbd0479044f602`)
- Emit court (Rust, env-gated): `kernel/crates/repop-abi/tests/golden_fixture.rs`
  — writes the fixture ONLY under `REPOP_EMIT_FIXTURE=1`; on every plain
  `cargo test` it recomputes the golden bytes and fail-closes if the on-disk
  fixture is stale (never writes without the env var).
- TS court: `packages/abi/src/abi.fixture.test.ts` — loads the fixture,
  decodes each hex → `fromBytes`, re-encodes via `View.write`, asserts
  byte-identical to the fixture hex, and re-seals (digest at 60..64 =
  `computeDigest` over `[0x00,0x3C)`).

## Gates (all run this session, real exits)

| Gate | Command | Result |
|---|---|---|
| Rust unit + fixture courts | `cargo test -p repop-abi` (in `kernel/`) | ok — 17 passed (lib) + 2 passed (fixture emit + decode-back), 0 failed |
| Env-gated emit | `REPOP_EMIT_FIXTURE=1 cargo test -p repop-abi --test golden_fixture` | ok — fixture emitted, `emitted .../scripts/parity_fixture.json` |
| Determinism | emit run twice, `diff` | identical bytes (`DETERMINISTIC`) |
| TS typecheck | `npx tsc --noEmit` (packages/abi) | 0 errors |
| TS courts | `npx vitest run` (packages/abi) | 15 passed (12 + 3 new fixture legs), 0 failed |
| Parity gate | `python3 scripts/verify_parity.py` | exit 0 — 3 frame tables row-for-row (32 rows), Spec-SHA256 fresh, fixture pin fresh |
| Non-vacuity (TS leg) | fixture byte-flip shim → vitest | 1 failed (byte-identical leg) → restore byte-exact (sha256 re-read match) |
| Non-vacuity (parity pin) | fixture mutation shim → verify_parity.py | `PARITY FAIL: fixture sha256 stale` exit 1 → restore exit 0 |

## Owned files

- `kernel/crates/repop-abi/tests/golden_fixture.rs` (new, C2b-owned; no src/ edits — C1's src untouched)
- `packages/abi/src/abi.fixture.test.ts` (new)
- `scripts/parity_fixture.json` (new, machine-emitted)
- `scripts/verify_parity.py` (extended: `FIXTURE_PATH` + `FIXTURE_SHA256` pin, fail-closed)

## Pin-rotation law

`verify_parity.py` now carries `FIXTURE_SHA256`; it rotates only atomically
with a re-emitted fixture. The Rust staleness court plus this pin make the
fixture double-pinned: stale Rust-side (spec change without re-emit) fails
`cargo test`, stale disk-side fails `verify_parity.py`.

## Notes

- Seed: `0xA20C0FFEE5A7E000` (+1/+2 per frame), derivation identical to the
  TS golden leg in `packages/abi/src/abi.test.ts` (one `next()` per byte,
  u32/2^32−1 f64 fractions).
- The C2 receipt referenced by the dispatch
  (`docs/jira/v26.11.8/receipts/c2-abi-ts-mirror.md`) does not exist on disk
  — no flip note was appended; this receipt supersedes it for the
  golden-byte leg.