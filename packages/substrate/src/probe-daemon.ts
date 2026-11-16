/**
 * probe-daemon — COORDINATION-THESIS build item 1 + SOP-TAI-OPS-001 SOP-002.
 *
 * doctor_fleet.sh's classification logic (servengine-frontend prior art) as a
 * runnable service writing an append-only JSONL time series. The four-state
 * wire-triage vocabulary is SOP-002:
 *
 *   DEAD    — no listener (L4 refused / connection error) AND no beam process
 *   WEDGED  — beam process alive but wire refusing/timeout (the dangerous
 *             "looks like infrastructure" state — needs bounce, not wait)
 *   STALE   — wire answers but wrong identity (compile-error beam, registry
 *             gap, auth drift, sha mismatch)
 *   SERVING — 200 health + 401 unauth + authenticated action probe returns rows
 *
 * The doctor's GREEN/RED classes map: GREEN→SERVING, RED-COMPILE/
 * REGISTRY-GAP/RED-AUTH→STALE, RED-DOWN→DEAD|WEDGED (by process witness).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type WireState = "DEAD" | "WEDGED" | "STALE" | "SERVING";

export interface ProbeConfig {
  targetUrl: string;
  periodMs: number;
  credentialsPath?: string | undefined;
  logPath: string;
  /** doctor email used for the authenticated action probe */
  probeEmail?: string;
  /** max ms for each individual probe request */
  probeTimeoutMs?: number;
  /** pattern matched against `ps` output to witness the beam process */
  processPattern?: string;
}

export interface ProbeSnapshot {
  ts: string;
  state: WireState;
  doctorClass: string;
  /** sha256-ish digest of the action-probe body (identity evidence) */
  actionProbeDigest: string;
  detail: string;
}

export interface ProbeWitnesses {
  healthStatus: number | string;
  unauthStatus: number | string;
  /** raw body of the authenticated action probe, when it ran */
  actionBody?: string | undefined;
  /** does a beam process exist (pgrep/ps witness)? */
  processAlive: boolean;
  /** credentials present for the authenticated leg? */
  haveCredentials: boolean;
  /** authenticated action probe result rows, when the leg succeeded */
  actionRows?: boolean | undefined;
}

/** Pure classification — SOP-002 four states + doctor-class alias. */
export function classify(w: ProbeWitnesses): {
  state: WireState;
  doctorClass: string;
  detail: string;
} {
  const down = w.healthStatus === 0 || w.healthStatus === "000";
  if (down) {
    if (w.processAlive) {
      return {
        state: "WEDGED",
        doctorClass: "RED-DOWN-WEDGED",
        detail: "process alive, listener refusing — bounce, not wait",
      };
    }
    return {
      state: "DEAD",
      doctorClass: "RED-DOWN",
      detail: "connection refused, no process witness — restart needed",
    };
  }
  const authLeg = w.haveCredentials && w.actionRows !== undefined;
  if (w.healthStatus === 200 && String(w.unauthStatus) === "401") {
    if (!authLeg) {
      return {
        state: "SERVING",
        doctorClass: "GREEN",
        detail: "identity green (health 200 + unauth 401); action probe skipped (no credentials)",
      };
    }
    if (w.actionRows) {
      return {
        state: "SERVING",
        doctorClass: "GREEN",
        detail: "identity green + action probe returned rows",
      };
    }
    if (
      typeof w.actionBody === "string" &&
      /action_not_found|not properly configured/.test(w.actionBody)
    ) {
      return {
        state: "STALE",
        doctorClass: "REGISTRY-GAP",
        detail: "identity green but rpc registry missing the action",
      };
    }
    return {
      state: "STALE",
      doctorClass: "RED-COMPILE",
      detail: "rpc surface answered a non-row body (compile-error beam class)",
    };
  }
  return {
    state: "STALE",
    doctorClass: "RED-COMPILE",
    detail: `health=${w.healthStatus} unauth=${w.unauthStatus} (unexpected pair)`,
  };
}

function digest(body: string | undefined): string {
  if (!body) return "none";
  let h = 0;
  for (let i = 0; i < body.length; i++) {
    h = (Math.imul(h, 31) + body.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Read probe credentials (email/password) from a .env-style file. */
export function readCredentials(p: string): {
  email: string;
  password: string;
} | null {
  let text: string;
  try {
    text = fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
  const get = (k: string) =>
    text.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim() ?? "";
  const email = get("VITE_E2E_DEV_USERNAME");
  const password = get("VITE_E2E_DEV_PASSWORD");
  return email && password ? { email, password } : null;
}

/**
 * Deadline via Promise.race rather than an AbortSignal: in a jsdom vitest
 * environment jsdom's AbortController is not undici-compatible and fetch
 * rejects immediately, so a signal-based deadline reads as connection-refused.
 * The loser of the race (an in-flight socket) is left to the runtime.
 */
function withDeadline<T>(p: Promise<T>, timeoutMs: number): Promise<T | null> {
  // SLEEP-CLASS: POLL-STEP — deadline for one bounded wire probe
  return Promise.race([
    p,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)), // SLEEP-CLASS: POLL-STEP — one bounded probe deadline
  ]);
}

async function fetchStatus(
  url: string,
  timeoutMs: number,
): Promise<number | "000"> {
  try {
    const res = await withDeadline(fetch(url), timeoutMs);
    return res ? res.status : "000";
  } catch {
    return "000";
  }
}

/** One real observation cycle against the live target. */
export async function probeOnce(
  cfg: ProbeConfig,
): Promise<ProbeSnapshot> {
  const timeoutMs = cfg.probeTimeoutMs ?? 5000;
  const base = cfg.targetUrl.replace(/\/$/, "");
  const health = await fetchStatus(`${base}/health`, timeoutMs);
  const unauth = await fetchStatus(`${base}/api/health`, timeoutMs);
  const processAlive = await isProcessAlive(cfg.processPattern ?? "beam.smp");
  const creds = cfg.credentialsPath
    ? readCredentials(cfg.credentialsPath)
    : null;
  let actionBody: string | undefined;
  let actionRows: boolean | undefined;
  if (creds) {
    const body = await postJson(
      `${base}/auth/token`,
      { email: creds.email, password: creds.password },
      timeoutMs,
    );
    const token =
      typeof body === "string" ? parseJson(body)?.token : undefined;
    if (typeof token === "string" && token.length > 0) {
      const rpc = await postJson(
        `${base}/internal-api/rpc/run`,
        {
          action: "list_lookup_values",
          payload: {
            tenant: "e2e-serv3568",
            fields: ["id", "label"],
            input: { type: "work_order_type" },
          },
        },
        timeoutMs,
        token,
      );
      if (typeof rpc === "string") {
        actionBody = rpc;
        actionRows = rpc.includes('"data"');
      }
    }
  }
  const { state, doctorClass, detail } = classify({
    healthStatus: health,
    unauthStatus: unauth,
    actionBody,
    actionRows,
    processAlive,
    haveCredentials: creds !== null,
  });
  return {
    ts: new Date().toISOString(),
    state,
    doctorClass,
    actionProbeDigest: digest(actionBody),
    detail,
  };
}

function parseJson(s: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

async function postJson(
  url: string,
  payload: unknown,
  timeoutMs: number,
  bearer?: string,
): Promise<string | undefined> {
  try {
    const res = await withDeadline(
      fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        },
        body: JSON.stringify(payload),
      }),
      timeoutMs,
    );
    return res ? await res.text() : undefined;
  } catch {
    return undefined;
  }
}

function isProcessAlive(pattern: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("pgrep", ["-f", pattern], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

/** Append one JSONL tick. Append-only: O_APPEND, never truncate. */
export function appendTick(logPath: string, snap: ProbeSnapshot): void {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(
    logPath,
    `${JSON.stringify({
      ts: snap.ts,
      state: snap.state,
      doctorClass: snap.doctorClass,
      action_probe: snap.actionProbeDigest,
      detail: snap.detail,
    })}\n`,
  );
}

export interface TriggerResult {
  fired: boolean;
  /** captured stdout+stderr of the trigger command, when it fired */
  output?: string | undefined;
  exitCode?: number | undefined;
}

/**
 * Transition detection: fire only on a non-GREEN → GREEN edge. The first
 * tick (no previous snapshot) never fires — a daemon that boots into an
 * already-green beam must not re-trigger; the edge, not the state, is the
 * event. GREEN ≡ state === "SERVING".
 */
export function shouldTriggerOnGreen(
  prev: ProbeSnapshot | undefined,
  cur: ProbeSnapshot,
): boolean {
  return cur.state === "SERVING" && prev !== undefined && prev.state !== "SERVING";
}

/** Execute the --on-green command; capture output next to the state log. */
export function runTrigger(
  command: string,
  logPath: string,
): Promise<TriggerResult> {
  return new Promise((resolve) => {
    const outFile = logPath.replace(/\.log$/, `-trigger-${Date.now()}.log`);
    const child = spawn("/bin/sh", ["-c", command], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (c: Buffer) => (out += c));
    child.stderr.on("data", (c: Buffer) => (out += c));
    child.on("error", (err) => {
      fs.writeFileSync(outFile, `spawn error: ${String(err)}\n`);
      resolve({ fired: true, output: `spawn error: ${String(err)}`, exitCode: -1 });
    });
    child.on("exit", (code) => {
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      fs.writeFileSync(outFile, out);
      resolve({ fired: true, output: out, exitCode: code ?? -1 });
    });
  });
}

/** Daemon loop — the runtime owns time (SCHEDULING-class interval). */
export function startDaemon(
  cfg: ProbeConfig & {
    onGreenCommand?: string | undefined;
    /** injectable probe leg (tests); defaults to the real wire probe */
    probeFn?: (cfg: ProbeConfig) => Promise<ProbeSnapshot>;
  },
  onStop?: () => void,
): { stop: () => void } {
  const probe = cfg.probeFn ?? probeOnce;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let prev: ProbeSnapshot | undefined;
  const tick = async () => {
    if (stopped) return;
    let snap: ProbeSnapshot;
    try {
      snap = await probe(cfg);
    } catch (err) {
      // A tick failure must never kill the daemon: write the failure as a
      // DEAD tick so the time series stays total.
      snap = {
        ts: new Date().toISOString(),
        state: "DEAD",
        doctorClass: "PROBE-ERROR",
        actionProbeDigest: "none",
        detail: `probe error: ${String(err)}`,
      };
    }
    appendTick(cfg.logPath, snap);
    if (cfg.onGreenCommand && shouldTriggerOnGreen(prev, snap)) {
      void runTrigger(cfg.onGreenCommand, cfg.logPath).then((r) => {
        appendTick(cfg.logPath, {
          ts: new Date().toISOString(),
          state: snap.state,
          doctorClass: "TRIGGER-FIRED",
          actionProbeDigest: "none",
          detail: `on-green command exit=${r.exitCode} output=${r.output?.slice(0, 200) ?? ""}`,
        });
      });
    }
    prev = snap;
    // SLEEP-CLASS: SCHEDULING — the runtime owns time; the daemon idles
    // between real observation ticks (nothing to poll inside the interval)
    if (!stopped) timer = setTimeout(tick, cfg.periodMs);
  };
  void tick();
  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      onStop?.();
    },
  };
}
