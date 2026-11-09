# D7 Vendor SHA Pin Receipt

Standing: PARTIAL_ALIVE

Task: pin the cgap upstream SHA into NOTICE's provenance URN; manifest of
vendored files with sha256 of source counterparts vs vendored copies.

## Commands / exits

- `find kernel/crates/repop-kernel/src/vendor packages/worker/public -type f` — exit 0
- `grep -rl 'cgap\|cgap-blake3\|LICENSE-P28-SIL' kernel/ packages/ packs/` (excl. target/node_modules) — exit 0
- `cd /Users/sac/cgap && git rev-parse HEAD` → `ede726ff31e95a7e27ea931390f3ae847ef4d262` (real output)
- `shasum -a 256` on all files in the table below — exit 0
- `git diff -- NOTICE` — exactly one line changed (the URN line). NOTICE
  modified, uncommitted (coordinator owns git transitions).

## Vendored file census

cgap-origin (upstream ~/cgap @ ede726ff31e95a7e27ea931390f3ae847ef4d262):

| vendored file | source counterpart (cgap) | vendored sha256 | source sha256 | match |
|---|---|---|---|---|
| kernel/crates/repop-kernel/src/vendor/keyed_blake3.rs | crates/cgap-blake3/src/lib.rs | e0e5d049ab82b61c426d8dae38dc9e5049ff6d06614e801d4288c0435baacc11 | 0340b777031f9207bdebb9cca66e84c7304c18c0f4959aaca49354cbb33282d4 | UNVERIFIED (drift) |
| kernel/crates/repop-kernel/src/vendor/keyed_blake3.rs | crates/cgap-crypto/src/chatman.rs | e0e5d049ab82b61c426d8dae38dc9e5049ff6d06614e801d4288c0435baacc11 | 1355c380990be77966d24c4f7013eaf057a866044d19e9d6ceee2ac91ce30cf6 | UNVERIFIED (drift) |
| kernel/crates/repop-kernel/src/vendor/mod.rs | none (repop-local module file) | 164253bac5e7c80305e125de119b6f1096391b2ec83812ab243e3ab1b3ced416 | n/a | local |

## UNVERIFIED drift rows

Both source counterparts mismatch the vendored copy. Per lane instructions
this is NOT reconciled. The attribution header in `keyed_blake3.rs` declares
the drift is intentional adaptation ("byte-identical except for visibility
(`pub` retained) and the removal of SIMD/GPU paths"), so the mismatch is
expected adaptation, not silent divergence — but byte-identity is not proven
against the declared section between VENDOR-HEADER-END/WRAPPER markers;
standing stays UNVERIFIED. A section-level sha (hash of the vendored body
vs the corresponding cgap lines 16-155) would close this; not in D7 scope.

## Non-cgap vendored file (separate upstream)

- `packages/worker/public/coi-sw.js` — vendored from atomvm, different
  upstream; not covered by the cgap URN. NOT pinned in this lane (no atomvm
  checkout/URN slot assigned to D7).

## Attribution-header grep census note

grep for 'cgap|cgap-blake3|LICENSE-P28-SIL' also hit ~40 files under
`packs/cgap-popcorn-aoq/` and kernel src files (refuse.rs, state.rs,
lease.rs, receipt.rs, tests, wasm crate, client frames.ts). These carry
attribution *references*, not vendored copies — the only vendored cgap
files are under `kernel/crates/repop-kernel/src/vendor/`.

## Result

NOTICE URN pinned: `urn:repop:vendor:cgap:ede726ff31e95a7e27ea931390f3ae847ef4d262`.
Diff verified single-line. Manifest above. Standing PARTIAL_ALIVE: pin + census
done; byte-identity of the vendored body UNVERIFIED (declared adaptation).
