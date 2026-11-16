# R1 BLAKE3 KAT Fix by Substitution

Standing: ALIVE

Task (CONSTRUCT lane R1, v26.11.9-integration): resolve the D7
UNVERIFIED-pending-KAT row on the vendored keyed BLAKE3 by substitution —
mirror affidavit-core's ChainHasher shape as a kernel digest seam, default
call sites to the upstream `blake3` crate, prove both impls against the
official vectors, and pin any vendored failure as drift evidence. YX ruled
conversion "needs repop blake3 KAT first" — this lane is that KAT.

## Gates

- `cargo test --workspace` (from `/Users/sac/repop/kernel`) — exit 0, all
  suites green (14 test binaries, 0 failures; includes the new
  `digest_kat` court, 7 tests).
- `cargo test -p repop-kernel` — exit 0 (lib 21 + integration suites).

## Files

- `kernel/crates/repop-kernel/Cargo.toml` — `blake3 = "1"` added (same
  major pin as `~/affidavit/affidavit-core/Cargo.toml:51`).
- `kernel/crates/repop-kernel/src/digest.rs` (new) — trait `Digest256`
  (affidavit `ChainHasher` shape, keyed + unkeyed); impls `UpstreamBlake3`
  (crate-backed, default) and `VendoredKeyedBlake3` (D7 vendor surface,
  single-chunk scope, typed `InputTooLong` refusal); kernel-level
  `digest::digest` / `digest::digest_keyed` default to upstream.
- `kernel/crates/repop-kernel/src/lib.rs` — `pub mod digest;`
- `kernel/crates/repop-kernel/src/receipt.rs` — 4 call sites re-pointed to
  the seam (`digest::digest_keyed`, `digest::digest`); vendor module no
  longer imported directly.
- `kernel/crates/repop-kernel/src/state.rs` — 1 call site re-pointed.
- `kernel/crates/repop-kernel/tests/digest_kat.rs` (new) — KAT court:
  official BLAKE3 vectors (empty `af1349b9…f3262`, `abc`
  `6437b3ac…9d85`, 2500-byte `bytes(i%251)` multi-chunk `95e80995…e2ff`),
  identical to the vectors Y2's `packages/worker/src/ocel/chain.test.ts`
  cites from b3sum 1.8.5; keyed vectors generated with `b3sum --keyed`
  (b3sum 1.8.5, key = the BLAKE3 spec demo key string space-padded to
  32 bytes — the string is 31 bytes, padding disclosed here).
- `docs/jira/v26.11.8/receipts/d7-vendor-sha-pin.md` — RESOLUTION note
  appended (standing vocabulary, closed values only).
- `docs/jira/v26.11.9-integration/receipts/r1-blake3-kat.md` — this
  receipt.

## Result

- Upstream impl passes every vector (unkeyed + keyed, incl. multi-chunk).
- Vendored copy passes single-block vectors only; FAILS the 1000-byte
  keyed vector (produces `11694e91…0d129`) and diverges at n=65 — the
  vendor module's multi-block path is spec-nonconformant. Pinned as an
  `assert_ne!` drift witness in the KAT court (red on any silent
  "fix"), plus a divergence-pinning test in `digest.rs` unit tests.
- Receipt/state digests now default to KAT-proven upstream BLAKE3 through
  the seam; the vendor surface is retained (D7 attribution/NOTICE pin
  intact, drift row open but consequence-free).

## UNVERIFIED

- AFL/fuzzing witness for the vendor copy: not run this lane (the vendor
  copy's KAT failure makes it moot for the default path; upstream is the
  admitted digest). Recorded per lane instructions.
- Vendor body byte-identity vs cgap upstream (the original D7
  section-sha question): remains UNVERIFIED, consequence-free.
