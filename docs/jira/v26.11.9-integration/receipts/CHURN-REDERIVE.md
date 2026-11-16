# CHURN-REDERIVE — :4000 churn adversary re-derived from logs (lane receipt)

Standing: PARTIAL_ALIVE

Lane CHURN-REDERIVE, 2026-11-08 ~23:45–23:58 PST. Backend-independent: reads
logs and the process table only; **zero :4000 HTTP interaction**. Evidence
repo: /Users/sac/repop (this receipt). FE-side twin receipt:
`~/srve/servengine-frontend/docs/jira/v26.11.8/receipts/lanes/CHURN-REDERIVE.md`.

## Method + evidence base

- `/tmp/xaas-server-daemon.log` — 337,588 lines, birth Nov 8 14:34:42, last
  write 23:53:07 (the full session window). Read with binary-safe `grep -a`.
- `/Users/sac/repop/.run/beam-state.log` — ONE line (SUBSTRATE-1's `--once`
  tick, 2026-11-09T07:26:15.695Z = 23:26:15 PST): `STALE / RED-COMPILE /
  "rpc surface answered a non-row body (compile-error beam class)"`. Not a
  series — the probe daemon is not ticking continuously.
- FE witness receipts read: TONY-WITNESS, G-11-wire-agents,
  EX-ROWS-JSONAPI-2, DRAIN-PREP.
- Live process/pin witness at 23:55:44 PST: `ps`, `lsof`, pin files.

## Headline finding

**The launchd-watchdog falsification is itself stale.** `dev.xaas.server` is
LOADED right now: `launchctl list` shows it; plist at
`~/Library/LaunchAgents/dev.xaas.server.plist` (RunAtLoad + KeepAlive
{SuccessfulExit=false, Crashed=true}, ThrottleInterval 3, stdout/stderr →
`/tmp/xaas-launchd-stdout.log` / `-stderr.log`, both 0 bytes, birth
14:34:41; `launchctl list dev.xaas.server` LastExitStatus=0). The daemon
log's birth (14:34:42) is 1 s after the plist stdout files', so the launchd
job drove the 14:34 boot. Whether it is relaunching right now is UNVERIFIED
(stdout empty since 14:34; tonight's restart traffic is coming from
Claude-session shells, not launchd — adversary A1).

**Critical plist defect**: ProgramArguments passes NO argument to
`run_server_daemon.sh`, and the script's default is `status`. So the launchd
job as loaded is a status poller, not a starter: beam-up → exit 0 (quiet);
beam-down → exit 1 → KeepAlive relaunch every 3 s, forever, without ever
starting the server. (The 14:34 boot predates this — an earlier plist/script
revision ran `start`-shaped output; UNVERIFIED which revision.)

## Flip timeline

Logger timestamps exist only from 17:48 onward (earlier entries untimed), so
the afternoon series is partial (14:34 boot + 3 untimed boots before the
first timestamped line).

| time (PST) | event | evidence |
|---|---|---|
| 14:34:41/42 | launchd job + first daemon boot | plist stdout birth 14:34:41; daemon log birth 14:34:42 |
| ≤17:48 | 3 untimed boots | 27 endpoint boots total; first timestamped log line is 17:48:56 SIGTERM (log line 57860) |
| 17:48:56 | SIGTERM ×2 | daemon log line 57860 |
| 17:49:37 | a compile running against `_build/dev` | log line 58503: "Copying NIF from cache … `_build/dev/lib/explorer`" — a boot-path compile touching the SHARED default build dir, not the daemon's private `_build/serving` |
| 17:50:43 | BOOT + CompileError storm (ocel_thread_controller, alignment_rule, asset, resolve_org_actor, user_directory/user, lookup_value, require_internal_api_token, dev_seeds, …) + SIGTERMs | COMPERR/BOOT/SIGTERM cluster; 460 CompileError lines total |
| 22:29:30 | SIGTERM → ~2.1-min outage | BOOT at 22:31:37; matches G-11's first PORT-NOT-LISTENING witness (22:31) and its 12-skip ECONNREFUSED court run |
| 22:41 | G-11's second down witness | NO SIGTERM/boot banner in daemon log — UNVERIFIED (compile-error-beam class or listener-only flap) |
| 23:13:22 / 23:19:33 / 23:20:22 | three BOOT/SIGTERM cycles in 7 min | daemon log event series |
| 23:26:38 | CompileError `require_internal_api_token` (boot-killing class) + SIGTERM | matches the 23:25 PST 000-outage EX-ROWS-JSONAPI-2 witnessed (~82 s, bounded poll recovered) and the probe's STALE/RED-COMPILE tick at 23:26:15 PST (07:26:15Z) |
| 23:35:37 | beam 46613 starts | `~/.run/xaas-beam.pin` (JSON URIP pin) lstart "Sun Nov 8 23:35:37 2026", pin written 23:39:52 |
| 23:37:55, 23:50:40 | final SIGTERM pairs | last events before log goes quiet at 23:53:07 |
| 23:55:44 | **no listener on :4000; 4 concurrent `mix compile` / `mix ecto.migrate` beams at 481%/101% CPU spawned by another Claude session's shell** (`/Users/sac/.claude/shell-snapshots/…` wrapper running `scripts/doctor beam` + `scripts/doctor --fix` in ~/xaas) | `ps` + `lsof` witness, this lane, 23:55:44 |

## Ranked adversary table

| rank | cause | evidence | witnessed count | extinction mechanism |
|---|---|---|---|---|
| 1 | **Concurrent start/compile storms from agent sessions** — multiple shells run `mix compile` / `run_server_daemon.sh start` / `doctor --fix` against the same build dir and port simultaneously | Live witness 23:55:44 (4 compile/migrate beams, one at 481% CPU, from one other session's `doctor --fix`; zero listeners). 33 eaddrinuse failures in the daemon log (two starts racing the bind; loser exits, "Application xaas exited … {:listen_error, …, :eaddrinuse}"). `/tmp/xaas-restart.log`: `mix ecto.migrate` Killed: 9 → REFUSED(MIGRATE-FAILED) | 33 eaddrinuse; 4 concurrent beams live-witnessed; 20 of 27 boots were crash-restarts | Single-start authority: only the URIP-gated daemon may start/compile; doctor/repair lanes get a fail-closed "beam is starting, stand down" typed refusal instead of running compile/migrate |
| 2 | **Compile-error beam (STALE/RED-COMPILE class)** — the server comes up serving from a partially-invalid build dir; boot-time CompileError kills the beam outright, request-time CompileError returns 500s | 460 CompileError lines; boot-killing CompileError at 23:26:38 (require_internal_api_token); TONY-WITNESS: ":4000 CompileError 500 (Phoenix code-reloader mid-recompile)"; probe tick STALE/RED-COMPILE at 23:26:15 PST inside that exact window; compile writing `_build/dev` (line 58503) proves the shared-build-dir channel is open | 460 CompileError lines; ≥2 lane-witnessed RED-COMPILE windows (TONY-WITNESS early; EX-ROWS 23:25; probe 23:26:15) | Serve only from a fully-compiled private `_build/serving` that no lane ever compiles into; a red build = typed refusal at start, never serve |
| 3 | **launchd job dev.xaas.server as currently configured** | Loaded with RunAtLoad + KeepAlive(nonzero-exit → relaunch @3 s); plist passes NO argument → script defaults to `status` mode → while beam-down the job exits 1 every 3 s and can NEVER start the server | 1 boot attributed (14:34); current relaunch behavior UNVERIFIED | Either pass `start` as the script argument (with the script's guards making repeated start fail-closed ALREADY-RUNNING/STALE-PIN) or `launchctl unload` it; as loaded it is a churn amplifier, not a watchdog |
| 4 | **WEDGE (alive-no-listener) is mostly the BOOT WINDOW, not a defect** | start() runs mix compile (minutes) → ecto.migrate (minutes) → phx.server bind; 23:55:44 witness shows exactly the "process alive, listener gone" signature during a compile storm | live witness 23:55:44; 33 eaddrinuse windows | Probes should classify "pgrep matches but wire down < boot budget (~5 min)" as BOOTING, not WEDGED; bounce-during-boot restarts then re-enter rank 1 |
| 5 | **Deliberate restarts (the announced class)** | SIGTERM clusters at 17:48, 22:29, 23:13/19/20, 23:37, 23:50 | 7 SIGTERMs | Already disciplined; NOT the unexplained mass |

## Announced-vs-observed delta (hypothesis c)

Announced bounces ≈ 15; observed endpoint boots 27; logged SIGTERMs 7 →
**~20 of 27 boots were NOT deliberate restarts** — the delta is
crash-restarts (ranks 1+2), not unannounced deliberate bounces. xaas-47's
"our waves + DL-4/catalog chains cause the bounces" claim is PARTIALLY
supported: their edits feed the compile-error channel (rank 2) and their
restarts are the 7 SIGTERMs (rank 5), but the majority mass is multi-session
concurrent compile/start (rank 1) — live-witnessed from a session other than
xaas-47 at 23:55:44.

## Hypothesis verdicts

- **(a) other-session compiles invalidate the live/shared build** —
  SUPPORTED (shared `_build/dev` writes from the boot path, log line 58503;
  460 CompileError lines; T001-incident class re-derived). UNVERIFIED for
  FE-side lanes specifically: G-11/EX-ROWS/TONY receipts show FE lanes ran
  `npx tsc`/vitest/playwright only — they never ran `mix compile` or
  started :4000.
- **(b) code-reloader races concurrent compiles** — SUPPORTED (phoenix
  code_reloader/server.ex:75/189/237 frames in the daemon log; TONY-WITNESS
  mid-recompile 500).
- **(c) deliberate restarts + unannounced delta** — SUPPORTED with
  correction: the unannounced mass is crash-restarts, not silent deliberate
  bounces.

## Not done / open

- G-11's 22:41 second down: no log corroboration — UNVERIFIED.
- Whether launchd is relaunching the status-poller right now: UNVERIFIED.
- `.run/beam-state.log` is not a series (one line); a continuously ticking
  daemon is required to close the remaining timeline gaps before 17:48.
- FE-side compiles as a churn source: ruled out per receipts, not by
  process-level observation of every FE lane.

## Replay

```
L=/tmp/xaas-server-daemon.log
grep -ac "Running XaasWeb.Endpoint" $L        # 27 boots
grep -ac "SIGTERM received" $L                # 7 deliberate stops
grep -ac ":eaddrinuse" $L                     # 33 bind races
grep -ac "(CompileError)" $L                  # 460 compile-error lines
launchctl list | grep dev.xaas.server         # watchdog loaded (stale falsification)
cat /Users/sac/xaas/.run/xaas-beam.pin        # current beam identity
ps aux | grep "beam.smp" | grep -v grep       # live compile storm witness
```
