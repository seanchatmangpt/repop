# DAEMON-WIRE — continuous probe daemon + on-green trigger integration (lane REPOP-DAEMON-WIRE)

Standing: ALIVE

Lane REPOP-DAEMON-WIRE, 2026-11-09. Closed the registered CHURN-REDERIVE gap
("`.run/beam-state.log` is a single --once line, not a series — the daemon must
tick continuously") in /Users/sac/repop (canonical checkout, no commit — tree
left for coordinator).

## Landed diff (all uncommitted, owned by this lane)

- packages/substrate/src/probe-daemon.ts — added `shouldTriggerOnGreen`,
  `runTrigger` (spawns /bin/sh, stdout+stderr captured to
  `<log>-trigger-<epoch>.log`), and extended `startDaemon`: it now tracks the
  previous snapshot and fires `onGreenCommand` exactly once per
  non-GREEN→GREEN edge, appending a `TRIGGER-FIRED` tick to the same JSONL
  series; probe leg is injectable (`probeFn`) for tests; the first tick (no
  previous snapshot) never fires — the edge, not the state, is the event.
- packages/substrate/src/bin/probe-cli.ts — `--daemon` accepted explicitly
  (also still the default when `--once` is absent), new `--on-green <cmd>`
  plumbed through, SIGINT/SIGTERM handlers for clean close. Header docstring
  updated.
- packages/substrate/src/on-green.test.ts — NEW, 9 courts. Edge-detection
  table (GREEN→GREEN no-fire; DEAD/STALE/WEDGED→SERVING fire; first-tick
  no-fire; RED→RED no-fire); real-subprocess `runTrigger` court (output
  capture + nonzero exit 7 case); a real `startDaemon` court over an injected
  RED→GREEN→GREEN series asserting exactly-one firing via a real filesystem
  flag plus a `TRIGGER-FIRED` tick in a real JSONL log.
- FE trigger integration ready: tony_live_battery.mjs (servengine-frontend)
  documents that it is daemon-invocable; the wiring is
  `probe-cli.ts --daemon --on-green "node scripts/tony_live_battery.mjs"`.

## Per-mode evidence (real invocations, exact commands + exits)

### Mode A — continuous daemon mode, real :4000 probes

Registered finding closed: `.run/beam-state.log` is now a SERIES. Ran:

```
node packages/substrate/src/bin/probe-cli.ts --daemon \
  --target http://localhost:4000 \
  --credentials ~/srve/servengine-frontend/.env.local \
  --log .run/beam-state.log --period 4000
```

4 real ticks appended (07:26:15Z prior --once + 08:21:59Z, 08:22:04Z,
08:22:09Z, 08:22:13Z), each a real :4000 probe (health + unauth 401 +
authenticated action probe, digest 3870998c every tick — a stable non-row
body). SIGTERM → "probe-daemon: SIGTERM — closing cleanly", process EXITED.

Beam-state note: every tick classifies STALE (RED-COMPILE) — the live beam
answers health 200 and unauth 401 but the rpc action probe returns a non-row
body. Same class SUBSTRATE-1 witnessed. Wire is the only truth; the dispatch
premise "beam is GREEN now" did not hold at tick time. Exit code (once mode)
3 = STALE per the SOP-005 contract, correct classification.

### Mode B — transition detection

Unit courts with injected probe results (per task item 3b):

```
pnpm vitest run packages/substrate  →  4 files, 25/25 tests passed, exit 0
  GREEN→GREEN       → no trigger
  RED→GREEN         → trigger fires once
  STALE→GREEN       → trigger fires
  first tick GREEN  → no trigger
```

Plus a real startDaemon court over an injected RED→GREEN→GREEN series: the
on-green command fired exactly once (real flag file created, one
TRIGGER-FIRED tick in a real JSONL log).

Live negative witness (--on-green with the STALE beam, 3 real ticks at 3 s
period): flag NOT created, exit clean — a beam that never makes a
non-GREEN→GREEN edge never triggers, as designed. The live positive case
(beam actually transitioning under the daemon) is not forceable read-only;
the unit court is the positive proof.

### Backward compat — --once

```
node packages/substrate/src/bin/probe-cli.ts --once \
  --target http://localhost:4000 \
  --credentials ~/srve/servengine-frontend/.env.local \
  --log .run/beam-state.log
  → "STALE (RED-COMPILE) action_probe=3870998c", tick appended, exit 3
```

## Gates

- `pnpm vitest run packages/substrate` → exit 0, 25/25 tests (4 files,
  includes the 9 new on-green courts).
- `cd packages/substrate && pnpm exec tsc --noEmit` → exit 0 (exactOptionalPropertyTypes strict; one CLI typing fix during the lane).
- `node ... --once` still works → exit 3, STALE, correct for live wire.

## Disclosures

- No commits made; tree left for the coordinator per lane law.
- Read-only on :4000 (probes only) throughout.
- Pre-existing local debris: /tmp state files from this lane's courts
  (/tmp/og-flag absent, /tmp/og-beam.log, /tmp/daemon-wire.pid) are throwaway.
- The FE tony_live_battery.mjs runner was read, not modified — its header
  already names this daemon as its intended trigger source.
