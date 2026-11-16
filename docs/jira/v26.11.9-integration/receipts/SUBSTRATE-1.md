# SUBSTRATE-1 — four coordination-substrate artifacts (lane REPOP-SUBSTRATE)

Standing: PARTIAL_ALIVE

Lane REPOP-SUBSTRATE, 2026-11-08/09. Built COORDINATION-THESIS build items
1/4/5/6 (probe-daemon, re-fire queue, contract compiler, vacuity harness) as
`packages/substrate` + `scripts/vacuity_check.sh` in the canonical checkout
`/Users/sac/repop`, prior art read from servengine-frontend
(`scripts/doctor_fleet.sh`, `scripts/call_register.mjs`, `scripts/shim_court/lib.sh`).
Commit NOTHING — tree left for the coordinator.

## Per-artifact verdicts

| Artifact | Files | Verdict | Evidence (command → exit) |
|---|---|---|---|
| 1. probe-daemon | `packages/substrate/src/probe-daemon.ts` + `src/bin/probe-cli.ts` | PASS | `node packages/substrate/src/bin/probe-cli.ts --target http://localhost:4000 --credentials ~/srve/servengine-frontend/.env.local --log .run/beam-state.log --once` → exit 3, output: `2026-11-09T07:26:15Z STALE (RED-COMPILE) action_probe=3870998c — rpc surface answered a non-row body (compile-error beam class)`; tick appended JSONL to `.run/beam-state.log`. Classified the LIVE beam correctly (it had recovered from the earlier 000/000 down observed at lane start — wire is the only truth). SOP-005 exit contract: SERVING→0 DEAD→1 WEDGED→2 else→3. |
| 2. re-fire queue | `packages/substrate/src/refire-queue.ts` + `src/bin/refire-cli.ts` | PASS (mechanism) / finding (receipt grammar) | `node packages/substrate/src/bin/refire-cli.ts --receipts-dir ~/srve/servengine-frontend/docs/jira/v26.11.8/receipts/lanes --state-file .run/beam-state.log --queue-file .run/refire-queue.jsonl` → exit 0: `queue: 2 BLOCKED legs`, `probe state: STALE (RED-COMPILE)`, `fireable now: 0; manual-gated: 0`. Queue on disk: `.run/refire-queue.jsonl`. **Finding**: tonight's BLOCKED receipts (EX-CATALOG, EX-CATALOG-R2, +1) carry NO structured `Unblock:` / `Resume when:` lines — the mechanical derivation works but the receipts don't feed it; lane law going forward: BLOCKED receipts must carry `Unblock:` + `Resume when:` lines. |
| 3. contract-emit | `packages/substrate/src/contract-emit.ts` + `src/bin/contract-emit-cli.ts` | PASS | `node packages/substrate/src/bin/contract-emit-cli.ts scratch/substrate-lane-spec.json` → exit 0, emitted the full paste-ready `# Lane REPOP-SUBSTRATE` dispatch block (REPOS/OWNED FILES/GATES/RECEIPT/LAWS/VOCABULARY/RULES) reproducing tonight's real skeleton. Spec kept at `scratch/substrate-lane-spec.json`. |
| 4. vacuity harness | `scripts/vacuity_check.sh` | PASS | `bash scripts/vacuity_check.sh --name convention-gate-court --baseline-cmd "python3 scripts/test_file_convention_gate.py" --mutate "touch packages/substrate/src/bad.spec.ts" --restore "rm -f packages/substrate/shim... bad.spec.ts"` → exit 0: `BASELINE: exit 0`, `MUTATED: exit 1 (.spec file outside playwright/)`, `RESTORED: tree hash matches baseline (byte-exact)`, `VERDICT: NON-VACUOUS`. Restore verified via `git status --porcelain -uall` hash parity (collapse-of-untracked-dir bug found and fixed: bare `--porcelain` collapses fully-untracked dirs, so a new file inside an untracked dir is invisible to the restore check — `-uall` is load-bearing). Mutation court is itself flip-proven: a vacuous mutation spec (`touch` on an existing leftover file) FAILs APPLY with exit 1. |
| tests | `packages/substrate/src/*.test.ts` (3 files) | PASS | `pnpm --filter @repop/substrate test` → exit 0, 16/16 (classification table, real-wire probeOnce over a real local http server, DEAD over a real dead port, real-fs receipt scan/queue round-trip, contract emit). `npx tsc --noEmit` → exit 0. Full chain `bash scripts/verify.sh` → exit 1 with ONLY a foreign-lane failure (below). |

## Disclosures

- **Foreign in-flight failure (not this lane's)**: `packages/worker/src/boot/wasm-boot.test.ts`
  fails at collection (`TypeError: The URL must be of scheme file`, line 16) from an
  UNCOMMITTED edit in `packages/worker` owned by another lane (C6/P4 drift-guard work).
  269/269 executed tests pass; this one file fails at import collection. Compile-freeze
  SLA belongs to the owning lane; I did not touch it.
- **jsdom AbortController vs undici fetch** (session-found): in the jsdom vitest
  environment jsdom's AbortController is not undici-compatible — `fetch(url, {signal})`
  rejects IMMEDIATELY, which a probe reads as connection-refused (DEAD). Fixed with a
  `Promise.race` deadline (`withDeadline`). Load-bearing for any jsdom-env wire probe.
- **sleep-gate compliance**: all three setTimeout sites annotated
  (`POLL-STEP` × probe deadlines, `SCHEDULING` × daemon interval). `GATE sleep-gate: PASS`.

## Commands + exits (summary)

- `pnpm install --filter @repop/substrate` → exit 0
- `pnpm --filter @repop/substrate test` → exit 0 (16/16)
- `npx tsc --noEmit` (substrate) → exit 0
- `node packages/substrate/src/bin/probe-cli.ts --once ...` → exit 3 (STALE, correct for live beam)
- `node packages/substrate/src/bin/refire-cli.ts ...` → exit 0 (2 legs, 0 fireable under STALE)
- `node packages/substrate/src/bin/contract-emit-cli.ts scratch/substrate-lane-spec.json` → exit 0
- `bash scripts/vacuity_check.sh --name convention-gate-court ...` → exit 0 (flip + byte-exact restore)
- `bash scripts/verify.sh` → exit 1, sole failure = foreign lane's uncommitted wasm-boot edit
