# R7: worker barrel entry (src/index.ts)

Standing: PASS

## Scope

C20r flagged `packages/worker/src/index.ts` missing while
`packages/worker/package.json` declares `"exports": { ".": "./src/index.ts" }`.
Confirmed on disk: the exports map points exactly at `src/index.ts`; the file
did not exist. All five worker submodules (boot/ocel/protocol/ring/uplink)
had landed with their own `index.ts` surfaces; only the barrel was absent.

## Change

Authored `packages/worker/src/index.ts` as a barrel over the five submodule
index files, re-exporting only existing public APIs (no invented names):

- `export * as boot / ocel / protocol / ring / uplink` namespace re-exports
  from each submodule's `index.ts`.

Namespace (not flat star) re-exports chosen deliberately: the submodules'
public surfaces collide on shared names (`HEADER_SIZE` ring vs protocol,
`ok`/`err` ring vs protocol, `SEQ_MODULUS` protocol vs uplink,
`PostMessageTransport` ring vs protocol), which flat `export *` would turn
into ambiguous-member errors. Every public name remains reachable via its
namespace (`ring.SabRing`, `protocol.Router`, `boot.bootWorker`,
`ocel.EventsBatch`, `uplink.UplinkTransport`, ...).

Note: the dispatch's recalled names (`createTransport`, `FrameRouter`,
`MetaHeader`) do not exist in the substrate; real names are
`selectTransportKind`/`SabRing`/`Router`/`encodeMetaHeader`/`UplinkTransport`.
Per the no-invented-API law, only real names are exported.

## Gates (real exits, packages/worker)

- Worker-only boundary grep on the barrel:
  `grep -nE "from ['\"](react|node:[a-z]+)" src/index.ts` → no matches,
  grep exit 1 (gate passes on zero matches).
- `npx tsc --noEmit` → exit 0.
- `npx vitest run` → 15 files / 99 tests passed (99/99, unchanged),
  exit 0.

## UNVERIFIED

- Worker-bundle build (bundler pass) — C15/P19c deferral, not exercised
  in this lane.
