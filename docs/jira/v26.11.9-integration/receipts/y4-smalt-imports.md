# Y4 — smalt law imports (substrate.sh, shim-court lib, sleep gate, standing lint)

Standing: PARTIAL_ALIVE

Lane Y4 (wave v26.11.9-integration). Imports smalt law infrastructure into
repop scripts/ per resolutions.md. smalt tree read-only throughout; repop
canonical checkout is the only tree written.

## Files (all absolute under /Users/sac/repop)

- scripts/substrate.sh — smalt substrate.sh port. Constants renamed
  (LOCK=/tmp/repop-substrate.lock, STATE_DIR/PID_FILE/LOG=/tmp/repop-substrate-state/*,
  PORTS via REPOP_PORTS (default 8787 8788), HEALTH via REPOP_HEALTH_URL,
  UP_TIMEOUT/LOCK_WAIT via REPOP_UP_TIMEOUT/REPOP_LOCK_WAIT). flock-fd law
  intact: per-WINDOW flock on fd 9, child spawned 9>&-, lock releases on
  exit; await_ready is a bounded deadline poll (SLEEP-CLASS: POLL-STEP
  annotations present, no fixed sleeps); tree_pids/orphan_holders ported;
  source-guard preserved so courts can source + call await_ready against a
  temp listener. repop adaptation: no server surface exists yet, so the
  spawn command is PARAMETERIZED (REPOP_SUBSTRATE_CMD/REPOP_SUBSTRATE_ARGS);
  `up` without it returns typed rc 4 (REFUSED) instead of spawning anything.
- scripts/shim_court/lib.sh — verbatim import from smalt
  scripts/shim_court/lib.sh: byte-identical below a 2-line repop provenance
  header (verified: diff of tail -n +3 vs smalt original = empty).
- scripts/sleep_gate.py — smalt sleep_gate.py port retargeted at TS:
  scans packages/ for setTimeout(/setInterval(/await sleep(; lawful forms =
  audited-poll allowlist (scripts/sleep_gate_classes.json), adjacent
  // SLEEP-CLASS: annotation, or bounded-poll-loop evidence; fail-closed on
  zero files / unreadable file / unreadable classification JSON.
- scripts/sleep_gate_classes.json — typed classification file (allowlist
  growth = reviewed diff; every entry carries a typed reason; see Census
  below).
- scripts/shim_court/sleep_gate_court.sh — non-vacuity court: synthetic
  clean subject in a /tmp sandbox (canonical checkout never touched),
  BASELINE sha256 -> BEFORE pass -> SHIM unclassified setTimeout ->
  AFTER must flip to exit 1 -> RESTORE sha-exact.
- scripts/receipt_standing_lint.py — smalt receipt_standing_lint.py port
  (parse-only + --census; retargeted docs/jira/v*/receipts/**; synonym keys
  Standing|Status|verdict|Result|Exit-code|Exit code|Gate; closed vocab;
  writes docs/jira/receipt-standing-map.json).
- scripts/verify.sh — three gates appended before the classification block;
  existing exit contract untouched (0 green / 1 red / 2 infra / 3 skip):
  sleep-gate (always), sleep-gate-court (skip via REPOP_SKIP_COURTS=1),
  standing-lint (census-mode default, REPOP_STANDING_LINT=1 to enforce;
  census came back 0 missing so enforcement can flip on later).

## Gates (real exits, 2026-11-08)

- bash -n on all four shells (substrate.sh, shim_court/lib.sh,
  shim_court/sleep_gate_court.sh, verify.sh): OK.
- python3 ast parse on both gates: OK.
- sleep-gate: `python3 scripts/sleep_gate.py` -> exit 0,
  "[SLEEP-GATE] PASS — 107 files, 0 unclassified sleep primitives".
  Expected 0 via poll.ts/boot-fsm.ts allowlist: met, plus 4 additional
  real sites surfaced by census and classified (see Census).
- sleep-gate-court: exit 0, full flip chain witnessed — BASELINE
  b6b5789... -> BEFORE pass -> SHIM -> AFTER gate REFUSED exit 1 ->
  RESTORE byte-exact. Non-vacuous.
- receipt-standing-lint --census: exit 0 — "60 files, 60 parse OK, 0 FAIL";
  census clean, zero violations to record (all existing receipts carry a
  parseable standing line).
- verify.sh chain (REPOP_SKIP_SMOKE=1, bounded runtime): sleep-gate PASS,
  sleep-gate-court PASS, standing-lint SKIP(census); chain exit 1 from the
  PRE-EXISTING unit FAIL — packages/worker/src/boot/wasm-boot.test.ts
  throws at collect (fileURLToPath scheme error resolving
  kernel/scripts/footprint_gate.py), 220/220 collected tests pass. Not
  session-introduced: Y4 diff is scripts/ + docs only; that suite belongs
  to another lane's surface. Smoke skipped by env, disclosed here.

## Census (sleep gate) — violations found, classified, none rewritten

Four real setTimeout sites outside the expected allowlist surfaced on first
run (exit 1, 4 violations across 107 files). Classified as typed file-tier
allowlist entries with reasons in scripts/sleep_gate_classes.json (the
lawful form; allowlist growth is a reviewed diff):
- packages/repop/src/useActor.test.tsx:177 — 0ms macrotask yield
  (setTimeout(r, 0)), not a delay primitive.
- packages/worker/src/worker-main.ts:43 — arms the boot deadline
  (boot-deadline-exceeded rejection); deadline scheduler, not a delay.
- packages/worker/src/boot/wasm-boot.browser.test.tsx:23 — same deadline
  scheduler in the browser harness.
- packages/worker/src/uplink/transport.test.ts:150 — single 10ms bounded
  retry step in the fake transport receive helper.

## UNVERIFIED (standing: PARTIAL_ALIVE, not ALIVE)

- substrate.sh runtime behavior (up/down against real listeners, orphan
  recovery, flock-fd inheritance refusal) is UNVERIFIED: no server surface
  exists yet (REPOP_SUBSTRATE_CMD unset; boot-smoke gate red-by-design
  pending the app composition root). Syntax-checked (bash -n), structure
  ported verbatim-equivalent; runtime verification deferred until a
  substrate command exists.
- standing-lint runs in census mode by default; enforcement
  (REPOP_STANDING_LINT=1) unexercised in the chain this session.
