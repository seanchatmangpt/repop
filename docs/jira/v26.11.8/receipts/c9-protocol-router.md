# C9 — Worker message protocol: binary frame router (P9 construct lane)

Standing: PASS

## Scope delivered

Wave-3 CONSTRUCT lane C9, repo `/Users/sac/repop`, owned surface
`packages/worker/src/protocol/` — the P9 binary frame router: 32B router
header + per-kind payload, zero-JSON, fixed-width little-endian, typed
refusals, pinned gate order.

## Owned files (all under packages/worker/src/protocol/)

- `frameKind.ts` — closed FrameKind vocabulary (SUBMIT_INTENT=0,
  INTENT_RESOLVED=1, Kernel_READY=2, REGISTER_OBJECT=3, REFUSE=4) + per-kind
  payload-width law (`PAYLOAD_WIDTH`), widths imported from `@repop/abi`
  (`FRAME_SIZE`), REFUSE=16B, KERNEL_READY=0B.
- `routerError.ts` — typed RouterError union, one variant per corruption
  class (BAD_MAGIC / BAD_VERSION / BAD_FLAGS / BAD_RESERVED / BAD_DIGEST /
  BAD_KIND / BAD_LENGTH / BAD_SEQ / BAD_CORRELATION) + `err`/`ok` outcome
  helpers.
- `seq.ts` — wrap-safe u32 seq law: `wrapSafeLt` (distance in [1, 2^31)),
  `SeqTracker` (per-writer strictly-monotonic, wrap-safe at 0xFFFFFFFF→0).
- `correlation.ts` — `CorrelationTable` (open/has/close, KERNEL_READY
  corrId-0 bypass pinned by this lane).
- `frame.ts` — codec: MAGIC 0x46395052 ("RP9F"), VERSION 1, HEADER_SIZE 32;
  encode/decode with pinned gate order magic→version→flags→reserved→digest→
  kind→len; FNV-1a32 digest over [0x00,0x1C) via `@repop/abi`'s `fnv1a32`
  (imported, not reimplemented — attribution to abi's implementation,
  constants 2166136261/16777619).
- `router.ts` — stateful Router: gates 8 (seq wrap-safe monotonic) and 9
  (correlation table + REFUSE echo law), per-kind handler dispatch; writer
  side (mintCorrId/send, writer-owned monotonic seq).
- `refusal.ts` — REFUSE payload codec (16B: statusCode u16, reserved u16
  must-0, reasonBits u64, corrId echo), `RefusalReason` bit vocabulary,
  reserved-!=0 refuses BAD_RESERVED.
- `transport.ts` — frame-level `Transport` interface + PostMessageTransport
  (MessageChannel, zero-JSON bytes only, no-wait law) + `transportPair`
  loopback + `transportIo` RouterIo adapter.
- `index.ts` — public surface.
- Tests: `frame.test.ts` (golden byte windows, every corruption class
  mutation leg, gate-order witnesses), `router.test.ts` (seq/correlation/
  wrap-safe/echo/dispatch/writer legs), `gate/zero-json.test.ts` (source
  scan + injected-token kill leg + clean-file negative control).

## Gates (real exits)

- `npx tsc --noEmit` (packages/worker): **exit 0**, zero diagnostics
  (protocol AND the whole worker package — sibling ring/abi debt landed
  fixed during this lane's flight; at C9 start, 8 ring errors + 4 abi
  errors were present, all resolved by their owning lanes mid-flight).
- `npx tsc --noEmit -p ../abi/tsconfig.json`: **exit 0**.
- `npx vitest run src/protocol`: **20/20 pass** (3 files).
- Full package `npx vitest run`: **62/62 pass** (12 files — includes P6
  ring and P7 boot suites; no sibling regressions).
- Mutation legs (in frame.test.ts): flip one byte per corruption class —
  magic/version/flags/reserved raw flips refuse their exact variant; kind
  and payloadLen flips are digest-window-covered, so the lawful
  digest-consistent re-stamp leg asserts the kind/length gates refuse after
  re-stamp; digest-field flip refuses BAD_DIGEST; truncation refuses
  BAD_LENGTH. All refuse — no vacuous courts.

## Dispatch conflicts flagged

1. "FNV-1a32 implemented locally with attribution" — abi (C2) had already
   landed `fnv1a32` with identical pinned constants; imported instead of
   reimplementing (one implementation per calculus). Attribution to abi's
   implementation carried in frame.ts header comment.
2. P9 plan file (docs/jira/v26.11.8/plans/09-*.md) absent from the landed
   plans dir; executed from the dispatch contract.

## UNVERIFIED items

- `KERNEL_READY` payload width 0 and corrId-0 table bypass: lane-pinned
  (UNVERIFIED-vs-P9-plan — plan file absent; dispatch pins widths for
  kinds 0/1/3/4 only).
- `RefusalReason` bit values (NOT_READY=1<<0, UNKNOWN_OBJECT=1<<1,
  BAD_FRAME_CLASS=1<<2): lane-pinned vocabulary (UNVERIFIED-vs-P9-plan).
- REFUSE-encode statusCode-range guard returns BAD_LENGTH (union has no
  writer-precondition variant; wire law unaffected).
- Package.json/tsconfig touches outside src/protocol (additive, disclosed):
  `@repop/abi` workspace dep + manual node_modules symlink,
  `@types/node` devDependency (zero-json gate needs node:fs), worker
  tsconfig `types: ["node"]`, package.json test script widened to
  `vitest run`.
- INTENT_RESOLVED payload width = FRAME_SIZE (64): abi defines receipts as
  64B frames (RECEIPT_FRAME_ROWS sum to 64); the dispatch's "receipt width"
  resolved to 64 — consistent with abi, UNVERIFIED-vs-C1-Rust-spec (abi
  itself is still UNVERIFIED-vs-Rust until C1's layout_spec.rs lands).

## Replay

```
cd /Users/sac/repop/packages/worker
npx tsc --noEmit            # exit 0
npx vitest run src/protocol # 20/20
npx vitest run              # 62/62
```

Session: Wave-3 CONSTRUCT, 2026-11-08. No git transitions performed (repo
has no .git yet; coordinator owns git).
