# Y13 — beam4pm whole-log ingest time gate reconciliation (premise-rot)

Standing: PASS

## Premise verified (unreconciled on arrival)

I2's registered divergence confirmed on disk before any edit:

- `lib/beam4pm_ocel_log_ingest.ex` `validate_event/1` gated whole-log event
  `time` with `&is_number/1` (was line 188), while
  `BeamPM.Types.OcelEvent.event_time` is `String.t()` (beam4pm_types.ex:451)
  and the generated per-record router accepts ISO8601 string times. repop
  exports ISO8601 strings per the struct law, so a repop-exported log
  POSTed to `/api/ocel/ingest` would be refused 422.

## Diff (additive, never weakening other refusals)

- `lib/beam4pm_ocel_log_ingest.ex`
  - `{"time", &is_number/1}` → `{"time", &valid_time?/1}`; new
    `valid_time?/1`: `true` for numbers (legacy wasm4pm-compat form),
    `DateTime.from_iso8601/1`-validated `true` for ISO8601 strings,
    `false` otherwise (fail-closed on non-parseable).
  - `timestamp_string/1` gained a binary passthrough clause (string times
    stored verbatim; numbers keep existing conversion).
  - Moduledoc documents the dual-form time law.
- `test/beam4pm_ocel_log_ingest_test.exs` — 3 new tests:
  ISO8601 string time accepted (happy path, asserts persisted store
  state), non-parseable string time refused 422 fail-closed (count
  unchanged), numeric epoch form still accepted (back-compat court,
  asserts persisted state).

## Gates (real exit)

- `mix test test/beam4pm_ocel_log_ingest_test.exs` → **10 tests, 0
  failures**, exit 0 (7 pre-existing + 3 new).
- Full-project compile succeeded as part of the test run. Note: first
  attempt was compile-blocked by another lane's in-flight untracked
  `lib/beam4pm_repop.ex:108` (module attribute in pattern/guard position
  at module body); owner edited within the ~10 min compile-freeze SLA
  window (bounded mtime poll, no lane cross-edit needed) and the gate
  then passed. No minimal-unblock disclosure required.

## Files

- `/Users/sac/beam4pm/lib/beam4pm_ocel_log_ingest.ex` (modified, uncommitted)
- `/Users/sac/beam4pm/test/beam4pm_ocel_log_ingest_test.exs` (modified, uncommitted)

## UNVERIFIED

- Live repop→beam4pm POST with an ISO8601-timed log over real HTTP
  (deferred; the Plug-level court above covers the same validation path).
