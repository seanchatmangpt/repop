/**
 * Boot FSM — typed states, typed events, closed transition table.
 *
 * Illegal transitions refuse with a typed BootError. The table cannot
 * branch on event payloads, so decisions mint decision-specific events
 * (DECIDED_SAB / DECIDED_FALLBACK / DECIDED_RELOAD). Poll budget:
 * 20 attempts x 100ms, deadline-checked on a real observable, never a
 * fixed sleep. The only timing here is the audited bounded poll in
 * pollUntil (SLEEP-CLASS: POLL-STEP).
 */

export type BootState =
  | "IDLE"
  | "PROBE"
  | "SW_REGISTERING"
  | "RELOADING"
  | "PROBE_AFTER_RELOAD"
  | "SAB_BOOT"
  | "FALLBACK_BOOT"
  | "FAILED";

export type BootEvent =
  | { type: "START" }
  | { type: "PROBE_DONE"; sabConstructible: boolean; serviceWorkerSupported: boolean }
  | { type: "DECIDED_SAB" }
  | { type: "DECIDED_FALLBACK" }
  | { type: "DECIDED_RELOAD" }
  | { type: "SW_REGISTERED" }
  | { type: "SW_FAILED" }
  | { type: "RELOAD_FIRED" }
  | { type: "RELOAD_REFUSED" }
  | { type: "REPROBE_SAB" }
  | { type: "REPROBE_NO_SAB" }
  | { type: "FAIL"; reason: string };

export class BootError extends Error {
  readonly from: BootState;
  readonly event: BootEvent | { doubleEntry: true };

  constructor(from: BootState, event: BootEvent | { doubleEntry: true }) {
    const label =
      "type" in event ? String(event.type) : "doubleEntry" in event ? "doubleEntry" : "?";
    super("Illegal boot transition: " + from + " + " + label);
    this.name = "BootError";
    this.from = from;
    this.event = event;
  }
}

type EventTable = Partial<Record<BootEvent["type"], BootState>>;

/** Closed transition table. Absence of a (state, event) cell = illegal. */
export const BOOT_TRANSITIONS: Readonly<Record<BootState, EventTable>> = {
  IDLE: { START: "PROBE" },
  PROBE: {
    PROBE_DONE: "SW_REGISTERING",
    FAIL: "FAILED",
  },
  SW_REGISTERING: {
    DECIDED_SAB: "SAB_BOOT",
    DECIDED_FALLBACK: "FALLBACK_BOOT",
    DECIDED_RELOAD: "RELOADING",
    FAIL: "FAILED",
  },
  RELOADING: {
    SW_REGISTERED: "PROBE_AFTER_RELOAD",
    SW_FAILED: "FALLBACK_BOOT",
    FAIL: "FAILED",
  },
  PROBE_AFTER_RELOAD: {
    REPROBE_SAB: "SAB_BOOT",
    REPROBE_NO_SAB: "FALLBACK_BOOT",
    FAIL: "FAILED",
  },
  SAB_BOOT: {
    FAIL: "FAILED",
  },
  FALLBACK_BOOT: {
    FAIL: "FAILED",
  },
  FAILED: {},
};

export function transition(state: BootState, event: BootEvent): BootState {
  const table: EventTable | undefined = BOOT_TRANSITIONS[state];
  const next = table === undefined ? undefined : table[event.type];
  if (next === undefined) {
    throw new BootError(state, event);
  }
  return next;
}

export const POLL_BUDGET_ATTEMPTS = 20;
export const POLL_INTERVAL_MS = 100;

export type ScheduleFn = (ms: number, fn: () => void) => void;

/**
 * Bounded poll on a real observable. Injected `schedule` keeps this
 * synchronous-testable; the default schedule uses setTimeout as pure
 * scheduling inside the audited poll (SLEEP-CLASS: POLL-STEP).
 */
export async function pollUntil(
  observable: () => boolean,
  schedule: ScheduleFn = (ms, fn) => setTimeout(fn, ms),
  attempts: number = POLL_BUDGET_ATTEMPTS,
  intervalMs: number = POLL_INTERVAL_MS,
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (observable()) return true;
    if (i < attempts - 1) {
      await new Promise<void>((resolve) => {
        schedule(intervalMs, resolve);
      });
    }
  }
  return observable();
}
