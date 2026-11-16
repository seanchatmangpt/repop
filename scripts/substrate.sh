#!/usr/bin/env bash
# scripts/substrate.sh — per-WINDOW flock substrate manager (repop port of
# smalt scripts/substrate.sh; flock-fd law, same-checkout-fanout addition 4).
#
# Smalt provenance: fixes the filed defect where a boot harness held
# /tmp/smalt-substrate.lock via flock and spawned `mix run --no-halt` as a
# child, so the child inherited the lock fd and held flock + ports forever
# after the harness exited, starving queued lanes (one held 27 min). Here the
# lock is acquired per-WINDOW (held only while spawning + verifying
# listeners), the substrate is spawned with the lock fd explicitly CLOSED
# (9>&-), and the lock releases on script exit while the substrate stays up,
# tagged with its owning pid.
#
# repop adaptation (Y4): no server surface exists yet, so the spawn command,
# ports, and health endpoint are PARAMETERIZED (env: REPOP_PORTS,
# REPOP_HEALTH_URL, REPOP_SUBSTRATE_CMD, REPOP_SUBSTRATE_ARGS). The script is
# infrastructure-ready for the boot-smoke landing: once a substrate command
# exists, `REPOP_SUBSTRATE_CMD='pnpm worker' scripts/substrate.sh up` works
# without editing this file. `status` and `down` are fully live today against
# whatever holds the configured ports.
#
# Usage: substrate.sh {up|down|status}
set -uo pipefail

LOCK=/tmp/repop-substrate.lock
STATE_DIR=/tmp/repop-substrate-state
PID_FILE=/tmp/repop-substrate-state/substrate.pid
LOG=/tmp/repop-substrate-state/substrate.log
PORTS="${REPOP_PORTS:-8787 8788}"
HEALTH="${REPOP_HEALTH_URL:-http://127.0.0.1:8787/healthz}"
# No-sleep law: the deadline is the BUDGET, the readiness poll is the
# mechanism (await_ready bounded poll below; never a fixed sleep).
UP_TIMEOUT=${REPOP_UP_TIMEOUT:-300}
LOCK_WAIT=${REPOP_LOCK_WAIT:-300}

cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || dirname "$(cd "$(dirname "$0")" && pwd)")" || exit 1
mkdir -p "$STATE_DIR"

all_listeners_present() {
  local p
  for p in $PORTS; do
    lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1 || return 1
  done
  return 0
}

any_listener_present() {
  local p
  for p in $PORTS; do
    lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1 && return 0
  done
  return 1
}

substrate_pid() {
  local pid=""
  [ -f "$PID_FILE" ] && pid=$(cat "$PID_FILE" 2>/dev/null)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && any_listener_present; then
    echo "$pid"
    return 0
  fi
  # First configured port is the primary listener.
  lsof -nP -iTCP:"${PORTS%% *}" -sTCP:LISTEN -Fp 2>/dev/null | sed -n 's/^p//p' | head -1
}

port_holder() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN -Fp 2>/dev/null | sed -n 's/^p//p' | sort -u
}

lock_holders() {
  lsof -t "$LOCK" 2>/dev/null | sort -u
}

# Liveness-recheck filter: drop pids that are already dead at listing time.
# (smalt BK-PORTS F3: transient flock waiters can die between lsof and
# print; without this recheck status lists ORPHAN false positives.)
live_lock_holders() {
  local o
  for o in $(lock_holders); do
    kill -0 "$o" 2>/dev/null && echo "$o"
  done
}

# Readiness poll (no-sleep law): the deadline is the budget, the poll is the
# mechanism. Polls the real observables — all PORTS LISTENing + HEALTH URL
# serving — on a bounded deadline; never a fixed sleep. Returns:
#   0 = ready within budget
#   1 = budget exhausted, still not serving (slow/failed boot)
#   2 = spawn pid died mid-boot (boot refusal — distinct from slow boot)
# PORTS/HEALTH are plain vars read at call time, so a court can override
# them to test this against a real temp listener without touching the
# substrate.
await_ready() {
  local spawn_pid="$1" budget="$2"
  SECONDS=0
  while [ "$SECONDS" -lt "$budget" ]; do
    if all_listeners_present && curl -fsS -o /dev/null "$HEALTH" 2>/dev/null; then
      return 0
    fi
    kill -0 "$spawn_pid" 2>/dev/null || return 2
    sleep 0.5 # SLEEP-CLASS: POLL-STEP (bounded readiness poll, budget deadline)
  done
  return 1
}

# True if pid or any of its descendants (2 levels: flock -> node -> worker)
# holds any TCP LISTEN socket.
# Iterate pids ONE at a time: `pgrep -P $(echo $pids)` passes each pid as a
# separate argv (extra args parsed as NAME regexes; empty operand when no
# children). SHIM-COURT: tree-walk fix (smalt R17/A11 #2).
tree_pids() {
  local root="$1" pid g out
  out="$root"
  for pid in $(pgrep -P "$root" 2>/dev/null); do
    out="$out $pid"
    for g in $(pgrep -P "$pid" 2>/dev/null); do out="$out $g"; done
  done
  echo "$out"
}

tree_listening() {
  local root="$1" p pids
  pids=$(tree_pids "$root")
  for p in $pids; do
    lsof -nP -a -p "$p" -iTCP -sTCP:LISTEN >/dev/null 2>&1 && return 0
  done
  return 1
}

# Orphan = lock holder whose whole tree has NO listening socket anywhere.
orphan_holders() {
  local o
  for o in $(live_lock_holders); do
    tree_listening "$o" || echo "$o"
  done
}

cmd_status() {
  local lockfree=0 holder p pid
  exec 8>"$LOCK"
  flock -n 8 2>/dev/null && lockfree=1
  exec 8>&-

  for p in $PORTS; do
    holder=$(port_holder "$p")
    if [ -n "$holder" ]; then
      echo "[STATUS] port $p: UP (pid $holder)"
    else
      echo "[STATUS] port $p: free"
    fi
  done

  pid=$(substrate_pid)
  if [ -n "$pid" ]; then
    echo "[STATUS] substrate UP (pid $pid)"
  else
    echo "[STATUS] substrate DOWN"
  fi

  if [ "$lockfree" -eq 1 ]; then
    echo "[STATUS] lock FREE (flock -n succeeds)"
  else
    echo "[STATUS] lock HELD by: $(lsof "$LOCK" 2>/dev/null | awk 'NR>1{print $1" pid "$2" fd "$4}' | sort -u | while read -r l; do p=${l#*pid }; p=${p%% *}; kill -0 "$p" 2>/dev/null && echo "$l"; done | tr '\n' ';')"
    orphans=$(orphan_holders)
    if [ -n "$orphans" ]; then
      for o in $orphans; do
        echo "[STATUS] ORPHAN: pid $o holds the lock with no listening socket in its tree"
      done
      echo "[STATUS] run 'scripts/substrate.sh down' to clear it"
    fi
  fi
  return 0
}

cmd_down() {
  local killed=0 pid holder p b o cmd rc=0
  pid=$(substrate_pid)
  if [ -n "$pid" ]; then
    echo "[DOWN] killing substrate pid $pid"
    pkill -TERM -P "$pid" 2>/dev/null || true
    kill -TERM "$pid" 2>/dev/null || true
    killed=1
  fi
  for p in $PORTS listeners; do
    for b in $(port_holder "$p"); do
      echo "[DOWN] killing listener $b (port $p)"
      kill -TERM "$b" 2>/dev/null || true
      killed=1
    done
  done
  rm -f "$PID_FILE"
  if [ "$killed" -eq 0 ]; then
    for o in $(orphan_holders); do
      cmd=$(ps -p "$o" -o command= 2>/dev/null)
      echo "[DOWN] killing orphan lock-holder $o ($cmd)"
      kill -TERM "$o" 2>/dev/null || true
      killed=1
    done
  fi
  [ "$killed" -eq 0 ] && echo "[DOWN] nothing to stop"
  for _ in $(seq 1 20); do
    any_listener_present || break
    sleep 0.5 # SLEEP-CLASS: POLL-STEP (bounded port-free poll, 20x0.5s deadline)
  done
  for p in $PORTS; do
    if lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "[DOWN] WARNING: port $p still held:"
      lsof -nP -iTCP:"$p" -sTCP:LISTEN
      rc=1
    else
      echo "[DOWN] port $p free"
    fi
  done
  echo "[DOWN] done"
  return $rc
}

cmd_up() {
  local pid
  pid=$(substrate_pid)
  if [ -n "$pid" ]; then
    echo "[UP] substrate already UP (pid $pid)"
    return 0
  fi
  if [ -z "${REPOP_SUBSTRATE_CMD:-}" ]; then
    echo "[UP] REFUSED: no substrate command configured. No server surface "
    echo "     exists yet; set REPOP_SUBSTRATE_CMD (and optionally "
    echo "     REPOP_SUBSTRATE_ARGS, REPOP_PORTS, REPOP_HEALTH_URL) when the "
    echo "     boot-smoke composition root lands." >&2
    return 4
  fi
  exec 9>"$LOCK"
  echo "[UP] acquiring per-WINDOW flock on $LOCK ..."
  if ! flock -w "$LOCK_WAIT" 9; then
    echo "[UP] FAIL: lock not acquired within ${LOCK_WAIT}s; holder:" >&2
    lsof "$LOCK" >&2
    return 3
  fi
  echo "[UP] lock held on fd 9; spawning substrate with fd 9 CLOSED (9>&-)"
  set -m
  # flock-fd law: the child is spawned with the lock fd explicitly closed
  # (9>&-) so it can never inherit the lock. `sh -c` wrapping keeps the
  # command parameterizable without eval in the caller's context.
  sh -c "$REPOP_SUBSTRATE_CMD ${REPOP_SUBSTRATE_ARGS:-}" \
    9>&- </dev/null >>"$LOG" 2>&1 &
  local spawn_pid=$!
  set +m
  echo "$spawn_pid" >"$PID_FILE"
  echo "[UP] spawned pid $spawn_pid (lock fd NOT inherited); verifying listeners..."
  await_ready "$spawn_pid" "$UP_TIMEOUT"
  local arc=$?
  if [ "$arc" -ne 0 ]; then
    case "$arc" in
      1) echo "[UP] FAIL: substrate not serving within ${UP_TIMEOUT}s; log tail ($LOG):" >&2 ;;
      2) echo "[UP] FAIL: substrate process died during boot (refused); log tail ($LOG):" >&2 ;;
    esac
    tail -30 "$LOG" >&2
    kill -TERM "$spawn_pid" 2>/dev/null || true
    return 2
  fi
  exec 9>&-
  echo "[UP] lock released (fd 9 closed); substrate stays up, pid tagged in $PID_FILE"
  return 0
}

# Source-guard (smalt L53): only dispatch when executed, so a court can
# `source scripts/substrate.sh` and call await_ready against a temp listener.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  case "${1:-}" in
    up) cmd_up ;;
    down) cmd_down ;;
    status) cmd_status ;;
    *)
      echo "usage: $0 {up|down|status}" >&2
      exit 64
      ;;
  esac
fi
