# I2 — OCEL export serializer + beam4pm vocab crosswalk

Standing: PASS

Lane: I2 (S2 repop side, wave v26.11.9-integration). Owner files:
`packages/worker/src/ocel/export.ts`, `packages/worker/src/ocel/export.test.ts`.

## Files

- `packages/worker/src/ocel/export.ts` (new) — whole-log serializer.
- `packages/worker/src/ocel/export.test.ts` (new) — 8 tests incl. courts.
- `packages/worker/src/ocel/batch.ts` (DISCLOSED MINIMAL EDIT to a landed
  file, same-checkout-fanout SLA) — read accessors only, zero behavior
  change to landed paths: `EventsBatch.tsAt(i)`, `ObjectsBatch.objectIdAt(i)` /
  `objectTypeIdAt(i)`, `E2OBatch.eventIdAt(i)` / `objectIdAt(i)` /
  `qualifierIdAt(i)`. Export cannot read the columns without them.
  Owning lane supersedes at integration if it edits the same seams.

## Decode law transcribed (beam4pm @ /Users/sac/beam4pm)

- whole-log shape `{events, objectTypes, eventTypes, objects}`:
  `lib/beam4pm_ocel_log_ingest.ex:7-10`; required-keys gate `:134`.
- event `{id, type, time, attributes, relationships}`, id/type `is_binary`:
  `:186-187`; relationship `{objectId, qualifier}` strings `:210-213`;
  object `{id, type}` strings `:217`; eventTypes/objectTypes `name` string
  `:222-225`.
- **REGISTERED DIVERGENCE**: `lib/beam4pm_ocel_log_ingest.ex:188` gates
  `time` as `is_number`, but the brief's law (ISO8601 string) is backed by
  `BeamPM.Types.OcelEvent.event_time: String.t() | nil`
  (`lib/beam4pm_types.ex:11840`) and the per-record path
  (`lib/beam4pm_ocel_ingest.ex:133` passes `event_time` through as string).
  Export emits ISO8601 strings per the OcelEvent law; the number gate is a
  beam4pm-side validator premise-rot item — NOT fixed here (not lane-owned
  file). Transport lane / beam4pm owners must reconcile before first live
  POST.
- `BeamPM.Types.OcelEvent` struct: `lib/beam4pm_types.ex:11833-11857`.

## Implementation

- u16 dictionary enums → vocab strings (ACTIVITY_VOCAB / QUALIFIER_VOCAB /
  OBJECT_TYPE_VOCAB); out-of-vocab index → `OUT_OF_VOCAB` typed refusal.
- e2o column re-joined into per-event `relationships` arrays; dangling
  references re-checked at export (fail-closed, `ARITY_MISMATCH`) even
  though append-time arity assert already guards.
- event/object ids as strings; time = `new Date(ts).toISOString()`.
- `objectTypes` / `eventTypes` emitted as closed-set declarations from the
  frozen vocabularies (required top-level keys).
- chain digest rides as top-level envelope attributes
  `repop_chain_digest` + `repop_chain_algorithm`, parameterized `ChainSeal`
  (current landed tier: blake3 per chain.ts; Y2 upgrade swaps the string).
- events serialize in chain document order — no re-sort.
- receipt chains NOT conflated: digest is an envelope attribute only.

## Gates (executed this session)

- `npx tsc --noEmit` (packages/worker): green.
- `npx vitest run src/ocel/export.test.ts`: 8/8 passed.
- `npx vitest run` (full package): 19 files / 153 tests, 0 failures —
  no Y2 ocel failures present in the current tree.
- Courts: shape-equality fixtures (order preserved, no re-sort); activity
  enum byte-flip mutation → `OUT_OF_VOCAB` (rawColumnBytes mutation
  surface); dangling eventId / objectId → `ARITY_MISMATCH`.

## UNVERIFIED (deferred, as dispatched)

- Live POST to beam4pm :4212 `/api/ocel/logs` — transport is a later lane;
  blocked in part by the registered time-gate divergence above.
- Cross-check vs Y8's verifier — deferred.

## Conflict flag (one line, per dispatch law)

Brief said camelCase objectId/qualifier + event_time string; live beam4pm
has TWO ingest paths — whole-log camelCase (`beam4pm_ocel_log_ingest.ex`,
but time gated as number) vs per-record snake_case string-time
(`beam4pm_ocel_ingest.ex`); followed the brief's named whole-log shape with
string time, registered the validator divergence.
