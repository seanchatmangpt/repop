# Y12 — ash_pplan durability port: Durable Store (in-memory v1)

Standing: PASS

Lane: Y12 (CONSTRUCT). Owns `packages/worker/src/durable/` (new directory, disjoint from
all in-flight lanes). References (read-only): `/Users/sac/ash_pplan`
(`lib/ash_pplan/reactor/durable/store.ex`, `status.ex`, `test/support/durable/store_conformance.ex`).

## What landed

- `packages/worker/src/durable/store.ts` — TypeScript port of the
  `AshPPlan.Reactor.Durable.Store` behaviour law over repop's substrate: in-memory Maps +
  per-entity version CAS. Run-status FSM ported verbatim from `status.ex`
  (`st:RunStatusMachine` rows; terminal absorbing; `waiting -> cancelled` illegal).
- `packages/worker/src/durable/store.test.ts` — conformance courts: the law bodies from
  `store_conformance.ex` ported one-per-`it()`, plus take_signal facade falsifiers.

## Law-by-law court table (18 laws + facade)

| law | court | verdict |
|---|---|---|
| start_run_exclusive | duplicate id `:exists`; parent pair stored; list insertion order | PASS |
| transition_guarded | ok bumps version; stale / illegal / not_found; terminal absorbing | PASS |
| claim_lease | unclaimed/lapsed/re-entry free; nil claimer never re-enters | PASS |
| claim_exclusive_concurrent | 32 same-instant claims → 1 winner, 31 taken | PASS |
| release_claim_owner_only | foreign no-op, idempotent, missing run ok | PASS |
| record_insert_or_adopt | second write returns standing checkpoint unchanged | PASS |
| record_concurrent_adopts | 24 racing records → 1 standing row, first output | PASS |
| standing_ordered_by_seq | seq order, per-run scoping | PASS |
| terminal_refuses_checkpoints | refuses NEW, adopts standing | PASS |
| undo_once | volatile consume-once claim; markUndone-only undoneAt; release reopens | PASS |
| signals_fifo_consume_once | FIFO per name, unique ids, consume-once | PASS |
| consume_concurrent | 16 racing consumes → 1 winner | PASS |
| park_deadline_once | first deadline kept unless overwrite; listed by name | PASS |
| release_idempotent | release/release_all idempotent, run-scoped | PASS |
| claim_persists_lease | lease_ms/lease_until via get_run | PASS |
| renew_claim_cas | holder-only CAS; foreign/missing taken | PASS |
| missing_lease_fails_closed | ghost claim blocks all but owner re-entry | PASS |
| release_clears_lease | claim + lease fields nulled | PASS |
| take_signal facade | strict `:none` (never adopt-regardless); terminal leaves signal pending; waiter released in same operation | PASS |
| FACADE falsifier — double execution | second take `:none`, one standing row | PASS |
| FACADE falsifier — resume | consumes exactly one signal, adopts standing checkpoint unchanged (output 7 not 999) | PASS |

## Linearizability note

The JS event loop IS the one-message guarantee: every store method runs synchronously to
completion (no await between read and write), so each operation is one atomic message —
the role the GenServer mailbox plays in the Elixir store. Concurrent-lane laws hold
because each CAS check and its write share one synchronous block.

## One real defect caught by the courts during the lane

Initial `claim` treated a nil claimer's live lease as unclaimed (claimedBy null ≡ free).
The `claim_lease` court refused it; fixed to the Elixir semantics — a live lease blocks
every claimer except the holder; nil never re-enters; missing lease fails closed.

## Gates (real exits)

- `npx tsc --noEmit` (packages/worker) — exit 0.
- `npx vitest run src/durable` — 25/25 passed, exit 0.
- `npx vitest run` (full package) — 20 files, 178/178 passed, exit 0 (no pre-existing
  failures surfaced; the known ocel state did not red-flag this run).

## Deferred (UNVERIFIED)

- Persistence tier (DETS/WAL analog): OCEL-ledger-backed persistence is the follow-up;
  `packages/worker/src/ocel/chain.ts` is the seal substrate. The in-memory store is v1.
- Live pplan interop: how an `AshA2A.Providers.PPlan`-style provider would consume the
  store (task surface over `startRun`/`takeSignal`/`snapshot`) is noted, not implemented.
- Ring stays a volatile read window (unchanged, per recipe).
- Zero-JSON law holds: no JSON artifacts emitted by the store or courts.
