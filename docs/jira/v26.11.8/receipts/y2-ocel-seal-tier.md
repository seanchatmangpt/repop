# Y2 — OCEL seal tier upgrade: FNV rolling chain → blake3 parent-chained links

Standing: PARTIAL_ALIVE

Lane: Y2 (REPAIR, tamper-tier upgrade). Owned files:
`packages/worker/src/ocel/chain.ts` (new), `chain.test.ts` (new),
`batch.ts`, `batch.test.ts`, `errors.ts`, `index.ts`. No collisions: C20r's
batch.ts edits were landed pre-dispatch (X12 survey finding Y2 repairs on
top of them).

## Hash-choice justification

**Chosen: BLAKE3, hand-rolled in TS (zero-dep law), full sequential mode —
not single-chunk-only, not sha256.**

- sha256 rejected: `subtle.crypto.digest` is async, but `seal()` is
  synchronous in the batch API (callers + the wave-1 result type
  `OcelResult` carry no async); a hand-rolled sha256 would have the same
  ~200-line audit surface as blake3 with no tree-chaining capability.
- blake3 adopted for the full spec path (multi-chunk + parent tree, ~260
  lines) rather than the task's suggested <1024B single-chunk carve-out:
  column spans exceed 1024B at real batch sizes, and truncating to
  single-chunk would silently degrade the tier the plan names as the
  tamper tier (plan `20-aoq-uplink-demo.md` line 79: rolling blake3 chain
  at seal boundary). The full path was affordable and the KAT court
  proves it.
- Conformance: plan 20-aoq-uplink-demo §"CRC vs tamper tiers" (blake3 =
  tamper tier, FNV = transport-tier CRC only); beam4pm_zcode_ocel_verifier
  sha256 per-link chain law (chain shape mirrored: link = hash(parent ‖
  canonical bytes), fixed field order, seal-last) at blake3 strength;
  ash_pplan Standing.Chain precedent (injectable digest module, canonical
  field-list hashing, seal-last). FNV remains in the codebase only where
  the ring uses it (`@repop/abi` CRC + uplink MetaHeader seal, not owned
  by this lane).

## Implementation

- `chain.ts`: BLAKE3 keyless sequential mode from the spec
  (BLAKE3-team/BLAKE3 test_vectors.json; O'Connor & Aumasson 2020):
  compression function (7 rounds, 6 permutations, feed-forward), chunk CV
  (CHUNK_START/CHUNK_END), parent CV over (leftCV ‖ rightCV), spec tree
  (left subtree = largest power-of-two chunk count), ROOT flag only on
  the topmost compression, chunk counters on subtree recursion.
- Chain law: `linkDigest(parent, bytes) = blake3(parent ‖ lenLE(bytes) ‖
  bytes)`; genesis = blake3 of empty input (= spec empty-input vector);
  batch `chainDigest()` = chain over canonical column order
  (events: eventId, ts, activity; objects: objectId, objectType; e2o:
  eventId, objectId, qualifier), fixed-width LE typed columns.
- LF-in-field law: `canonicalTextBytes()` refuses 0x0A with typed
  `LF_IN_FIELD` refusal (new errors.ts code). Currently the enforcement
  point is structurally vacuous for the batches (activities are
  dict-encoded u16 before hashing — no raw string bytes enter the
  digest); the guard is the seam for any future TEXT-class field.
- API: `seal(): OcelResult<SealDigest>` (64-char lowercase hex; was
  `OcelResult<number>`), `verify()` unchanged shape, `CHAIN_MISMATCH`
  preserved (observed/expected now hex digests). Zero external callers of
  the old numeric seal existed (verified by grep across packages/ + apps/
  pre-change), so the value-type change breaks no caller.
- `chainDigest()` is stateless single-pass (columns + genesis only);
  `verify()` is repeatable with no hidden state.

## KAT court

Vectors generated with reference `b3sum 1.8.5` (BLAKE3-team/BLAKE3
reference CLI, homebrew). Empty-input vector is additionally the canonical
spec vector (test_vectors.json, input_len 0):

- `blake3("")` = `af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262`
- `blake3("abc")` = `6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85`
- `blake3(bytes(i % 251, 2500B))` = `95e809954ebdd862debeb347d5715c09e73d150cd0704d4bbd834993a730e2ff`
  (generation: `python3 -c "sys.stdout.buffer.write(bytes(i%251 for i in range(2500)))" | b3sum`)
  — multi-chunk, proves chunk counters + parent-tree merge.

**Court non-vacuity witnessed in-session**: the first implementation ran
8 rounds / 7 permutations (spec: 7 rounds / 6 permutations) and never
applied the ROOT flag — the KAT court REFUSED all three vectors
(empty-input got `ebe3da5b…`, 4 test failures). Fix applied, court passes.
The court demonstrably kills a wrong implementation, not a tautology.

## Gates (all run this session, exit 0)

- `npx tsc --noEmit` (packages/worker): rc=0, zero errors.
- `npx vitest run` (packages/worker): **18 files / 145 tests passed, 0
  failed** — includes the pre-existing 99-test body plus new-lane files
  landed concurrently; the X12-era 99/99 expectation is superseded
  upward, not degraded.
- Tamper/tampered-batch mutation legs re-run under the new tier: batch
  test "mutation leg: tampered events byte post-seal" → CHAIN_MISMATCH
  fires (PASS); new legs: activity-column flip (chain.test.ts) →
  CHAIN_MISMATCH with `expected` = the actual sealed digest (PASS).
  Baseline mutation evidence: pre-fix KAT refusal (above) proves the
  tier flips on any digest-affecting change.
- Chain laws added (chain.ex discipline): seal-last (post-seal mutation →
  CHAIN_MISMATCH), ≤1-seal (second seal + post-seal append →
  ALREADY_SEALED), verify-single-pass (repeatable verify, digest equals
  fresh independent recomputation).

## Session-introduced vs pre-existing

- Session-introduced failures: none outstanding. Two real bugs
  (round-count/ROOT-flag; empty-chunk returning IV) were introduced and
  fixed within the lane, caught by the KAT court before landing.
- Pre-existing/concurrent-lane: `src/protocol/a2a.test.ts` tsc errors and
  `src/sjira/project.test.ts` 3 fail-closed failures appeared mid-flight
  (other lanes' untracked files) and were resolved by their owning lanes
  before this receipt's final gate run; final full-suite run is 145/145.

## UNVERIFIED

- beam4pm_zcode_ocel_verifier ingest of the new wire format: the fleet
  consumer still needs the blake3-link wire framing (X9 gap). The chain
  shape mirrors its sha256 per-link law but the on-wire digest block is
  not yet specified/consumed by beam4pm — cross-repo receipt required
  before this tier is ALIVE at fleet scope.
- blake3 KATs cover sequential keyless mode only (no keyed/keyed-context
  variants — not used by the seal tier).

## Replay

```
cd /Users/sac/repop/packages/worker
npx tsc --noEmit          # rc=0
npx vitest run            # 145/145
python3 -c "import sys; sys.stdout.buffer.write(bytes(i%251 for i in range(2500)))" | b3sum
# 95e809954ebdd862debeb347d5715c09e73d150cd0704d4bbd834993a730e2ff -
```

Files: `packages/worker/src/ocel/chain.ts`, `chain.test.ts` (new);
`batch.ts`, `batch.test.ts`, `errors.ts`, `index.ts` (modified). Uncommitted
(coordinator owns git transitions per fan-out law).
