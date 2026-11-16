/**
 * Durable run store — TypeScript port of the AshPPlan.Reactor.Durable.Store law
 * (ash_pplan lib/ash_pplan/reactor/durable/store.ex + status.ex run-status FSM).
 *
 * Substrate: in-memory Maps with per-entity version CAS. Linearizability: the
 * JS event loop is the one-message guarantee — every public method runs
 * synchronously to completion (no await between read and write), so each
 * operation is one atomic message, exactly the role the GenServer mailbox plays
 * in the Elixir store. Concurrent-lane laws (claim_exclusive_concurrent,
 * record_concurrent_adopts, consume_concurrent) hold because every CAS check
 * and its write share one synchronous block; interleaving can only occur at
 * await boundaries and there are none.
 *
 * Persistence tier is DEFERRED: this in-memory store is v1; the follow-up is
 * OCEL-ledger-backed persistence (packages/worker/src/ocel/chain.ts is the
 * seal substrate — the DETS/WAL analog). The ring stays a volatile read window.
 */

// ---------------------------------------------------------------------------
// Closed vocabularies (ported from status.ex)
// ---------------------------------------------------------------------------

export const RUN_STATUSES = [
  "pending",
  "waiting",
  "polling",
  "unwinding",
  "cancelling",
  "unwind_blocked",
  "completed",
  "failed",
  "cancelled",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

export const TERMINAL_STATUSES: readonly RunStatus[] = [
  "completed",
  "failed",
  "cancelled",
] as const;

const PARKED: readonly RunStatus[] = ["waiting", "polling"];

/** from => allowed tos (verbatim rows from the st:RunStatusMachine). */
const ALLOWED: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  pending: ["pending", "waiting", "polling", "unwinding", "cancelling", "completed", "failed"],
  waiting: ["pending", "waiting", "polling", "unwinding", "cancelling", "completed", "failed"],
  polling: ["pending", "waiting", "polling", "unwinding", "cancelling", "completed", "failed"],
  unwinding: ["failed", "unwind_blocked"],
  cancelling: ["cancelled", "unwind_blocked"],
  unwind_blocked: ["unwind_blocked", "unwinding", "cancelling", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

const isTerminal = (s: RunStatus): boolean => TERMINAL_STATUSES.includes(s);

export function statusCan(from: RunStatus, to: RunStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function isCancellable(s: RunStatus): boolean {
  return s === "pending" || s === "waiting" || s === "polling";
}

// kept for parity with status.ex @parked; unused until lease_monitor ports
export const isParked = (s: RunStatus): boolean => PARKED.includes(s);

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface RunRecord {
  readonly id: string;
  readonly parentId: string | null;
  readonly parentSignal: string | null;
  status: RunStatus;
  version: number;
  readonly bindings: Record<string, unknown>;
  result?: unknown;
  claimedBy: string | null;
  claimedAt: number | null;
  leaseMs: number | null;
  leaseUntil: number | null;
}

export interface Checkpoint {
  readonly runId: string;
  readonly stepKey: string;
  readonly label: string;
  output: unknown;
  readonly meta: Record<string, unknown>;
  readonly seq: number;
  undoneAt: number | null;
}

export interface Signal {
  readonly id: number;
  readonly runId: string;
  readonly name: string;
  readonly payload: unknown;
  readonly deliveredAt: number;
  consumedAt: number | null;
}

export interface Waiter {
  readonly runId: string,
  readonly name: string;
  readonly kind: "signal" | "poll";
  readonly deadline: number | null;
  readonly seq: number;
}

// ---------------------------------------------------------------------------
// Results (closed unions — typed refusals, never thrown strings)
// ---------------------------------------------------------------------------

export type StartRunError = "exists";
export type TransitionError = "stale" | "not_found" | "illegal";
export type RecordError = "terminal" | "cancelling";
export type MarkUndoneError = "not_found";

export type StoreResult<T> =
  | { readonly ok: true; value: T }
  | { readonly ok: false; error: "taken" | StartRunError | TransitionError | RecordError | MarkUndoneError };

export function storeOk<T>(value: T): StoreResult<T> {
  return { ok: true, value };
}

function taken(): StoreResult<never> {
  return { ok: false, error: "taken" };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface StartRunAttrs {
  id: string;
  model?: unknown;
  bindings?: Record<string, unknown>;
  /** [parentId, parentSignal], mirroring the Elixir `parent: {id, sig}`. */
  parent?: readonly [string, string];
  claimedAt?: number;
  claimedBy?: string;
}

export class DurableStore {
  private runs = new Map<string, RunRecord>();
  private cpByRun = new Map<string, Map<string, Checkpoint>>();
  private sigByRun = new Map<string, Signal[]>();
  private waitersByRun = new Map<string, Map<string, Waiter>>();
  /** Volatile undo claims (claim_undo law) — deliberately NOT persisted. */
  private undoClaims = new Map<string, Map<string, { until: number }>>();

  private seqCounter = 0;
  private signalIdCounter = 0;

  startRun(attrs: StartRunAttrs): StoreResult<RunRecord> {
    if (this.runs.has(attrs.id)) return { ok: false, error: "exists" };
    const rec: RunRecord = {
      id: attrs.id,
      parentId: attrs.parent ? attrs.parent[0] : null,
      parentSignal: attrs.parent ? attrs.parent[1] : null,
      status: "pending",
      version: 1,
      bindings: attrs.bindings ?? {},
      result: undefined,
      claimedBy: attrs.claimedBy ?? null,
      claimedAt: attrs.claimedAt ?? null,
      leaseMs: null,
      leaseUntil: null,
    };
    this.runs.set(attrs.id, rec);
    return storeOk(rec);
  }

  getRun(id: string): RunRecord | null {
    return this.runs.get(id) ?? null;
  }

  listRuns(): RunRecord[] {
    return [...this.runs.values()];
  }

  /**
   * Guarded transition: applies only if `from` includes the current status (or
   * `from === "any"` meaning any NON-terminal status) and the FSM row allows
   * from -> to. Bumps version. Terminal statuses are absorbing (stale).
   */
  transition(
    id: string,
    from: readonly RunStatus[] | "any",
    to: RunStatus,
    attrs: Record<string, unknown>,
  ): StoreResult<RunRecord> {
    const rec = this.runs.get(id);
    if (!rec) return { ok: false, error: "not_found" };
    if (isTerminal(rec.status)) return { ok: false, error: "stale" };
    if (from !== "any" && !from.includes(rec.status)) return { ok: false, error: "stale" };
    if (!statusCan(rec.status, to)) return { ok: false, error: "illegal" };
    const next: RunRecord = { ...rec, status: to, version: rec.version + 1, ...attrs };
    this.runs.set(id, next);
    return storeOk(next);
  }

  /**
   * Claim if unclaimed, lease lapsed, or the same claimer re-enters. A nil
   * claimer never re-enters: once it holds a live lease, no other claimer
   * (including another nil) can take it until the lease lapses. A claimed
   * record with no persisted lease fails closed — owner re-entry only.
   * Claim does NOT bump version (the Elixir store bumps version only on
   * transition; lease fields are CAS'd directly).
   */
  claim(id: string, claimer: string | null, leaseMs: number, now: number): StoreResult<RunRecord> {
    const rec = this.runs.get(id);
    if (!rec) return taken();
    const holder = rec.claimedBy;
    const lapsed = rec.leaseUntil !== null && now >= rec.leaseUntil;
    const claimed = holder !== null || rec.leaseUntil !== null;
    if (claimed && !lapsed) {
      if (claimer === null) return taken(); // a nil claimer never re-enters
      if (claimer !== holder) return taken(); // foreign claimer (missing lease fails closed)
    }
    const next: RunRecord = {
      ...rec,
      claimedBy: claimer,
      claimedAt: now,
      leaseMs,
      leaseUntil: now + leaseMs,
    };
    this.runs.set(id, next);
    return storeOk(next);
  }

  /** Clears only the holder's claim + lease fields; idempotent; no-op for others. */
  releaseClaim(id: string, claimer: string | null): "ok" {
    const rec = this.runs.get(id);
    if (!rec) return "ok";
    if (rec.claimedBy === claimer) {
      this.runs.set(id, {
        ...rec,
        claimedBy: null,
        claimedAt: null,
        leaseMs: null,
        leaseUntil: null,
      });
    }
    return "ok";
  }

  /** Holder-only heartbeat CAS; a stolen or absent claim answers "taken". */
  renewClaim(
    id: string,
    claimer: string | null,
    leaseMs: number,
    now: number,
  ): StoreResult<RunRecord> {
    const rec = this.runs.get(id);
    if (!rec || rec.claimedBy !== claimer) return taken();
    const next = { ...rec, leaseMs, leaseUntil: now + leaseMs };
    this.runs.set(id, next);
    return storeOk(next);
  }

  // -- checkpoints ----------------------------------------------------------

  record(
    runId: string,
    stepKey: string,
    label: string,
    output: unknown,
    meta: Record<string, unknown>,
  ): StoreResult<Checkpoint> {
    const run = this.runs.get(runId);
    if (!run) return { ok: false, error: "not_found" };
    const existing = this.cpByRun.get(runId)?.get(stepKey);
    if (existing) return storeOk(existing); // adopt regardless of run status
    if (isTerminal(run.status)) return { ok: false, error: "terminal" };
    if (run.status === "cancelling") return { ok: false, error: "cancelling" };
    const cp: Checkpoint = {
      runId,
      stepKey,
      label,
      output,
      meta,
      seq: ++this.seqCounter,
      undoneAt: null,
    };
    let m = this.cpByRun.get(runId);
    if (!m) {
      m = new Map();
      this.cpByRun.set(runId, m);
    }
    m.set(stepKey, cp);
    return storeOk(cp);
  }

  checkpoints(runId: string): Record<string, Checkpoint> {
    const m = this.cpByRun.get(runId);
    const out: Record<string, Checkpoint> = {};
    if (m) for (const [k, v] of m) out[k] = v;
    return out;
  }

  /** Non-undone checkpoints of one run in ascending seq order. */
  standing(runId: string): Checkpoint[] {
    const m = this.cpByRun.get(runId);
    if (!m) return [];
    return [...m.values()]
      .filter((c) => c.undoneAt === null)
      .sort((a, b) => a.seq - b.seq);
  }

  /**
   * Consume-once volatile leased undo claim. VOLATILE: unpersisted — a store
   * restart (or lease lapse) leaves the checkpoint standing again, so a crash
   * between claim and effect re-runs the undo (at-least-once).
   */
  claimUndo(runId: string, stepKey: string, now: number, leaseMs = 60_000): StoreResult<Checkpoint> {
    const cp = this.cpByRun.get(runId)?.get(stepKey);
    if (!cp) return taken();
    if (cp.undoneAt !== null) return taken();
    const cl = this.undoClaims.get(runId)?.get(stepKey);
    if (cl && cl.until !== null && now < cl.until) return taken();
    let m = this.undoClaims.get(runId);
    if (!m) {
      m = new Map();
      this.undoClaims.set(runId, m);
    }
    m.set(stepKey, { until: now + leaseMs });
    return storeOk(cp);
  }

  /** Guarded idempotent mark: writes undoneAt AFTER the undo effect succeeded. */
  markUndone(runId: string, stepKey: string, now: number): StoreResult<Checkpoint> {
    const cp = this.cpByRun.get(runId)?.get(stepKey);
    if (!cp) return { ok: false, error: "not_found" };
    this.undoClaims.get(runId)?.delete(stepKey);
    cp.undoneAt = now;
    return storeOk(cp);
  }

  /** Releases the volatile undo claim, reopening it. */
  releaseUndo(runId: string, stepKey: string): "ok" {
    this.undoClaims.get(runId)?.delete(stepKey);
    return "ok";
  }

  // -- signals ----------------------------------------------------------

  deliverSignal(runId: string, name: string, payload: unknown): Signal {
    const sig: Signal = {
      id: ++this.signalIdCounter,
      runId,
      name,
      payload,
      deliveredAt: Date.now(),
      consumedAt: null,
    };
    let arr = this.sigByRun.get(runId);
    if (!arr) {
      arr = [];
      this.sigByRun.set(runId, arr);
    }
    arr.push(sig);
    return sig;
  }

  pendingSignal(runId: string, name: string): Signal | null {
    return (
      this.sigByRun.get(runId)?.find((s) => s.name === name && s.consumedAt === null) ?? null
    );
  }

  /** Consume-once; "taken" on double consume or unknown id. */
  consumeSignal(signalId: number, now: number): StoreResult<Signal> {
    for (const arr of this.sigByRun.values()) {
      const s = arr.find((x) => x.id === signalId);
      if (s && s.consumedAt === null) {
        s.consumedAt = now;
        return storeOk(s);
      }
    }
    return taken();
  }

  signals(runId: string): Signal[] {
    return [...(this.sigByRun.get(runId) ?? [])];
  }

  // -- takeSignal: atomic consume-once + adopt-or-insert + waiter release --

  /**
   * Atomic consume-once signal take in ONE operation (single synchronous
   * block). STRICT law: with NO pending signal the answer is "none" for every
   * step key — adoption fires only in response to a pending signal, never
   * adopt-regardless. Terminal/cancelling runs refuse a NEW checkpoint and
   * leave the signal pending for crash-after-commit replay.
   */
  takeSignal(
    runId: string,
    name: string,
    stepKey: string,
    label: string,
    meta: Record<string, unknown>,
    now: number,
  ): { ok: true; value: Checkpoint } | { ok: false; error: "none" | "terminal" | "cancelling" } {
    const sig = this.pendingSignal(runId, name);
    if (!sig) return { ok: false, error: "none" };
    const run = this.runs.get(runId);
    if (!run) return { ok: false, error: "none" };
    const existing = this.cpByRun.get(runId)?.get(stepKey);
    if (existing) {
      // crash-after-commit replay: adopt standing checkpoint unchanged
      sig.consumedAt = now;
      this.release(runId, name);
      return { ok: true, value: existing };
    }
    if (isTerminal(run.status)) return { ok: false, error: "terminal" };
    if (run.status === "cancelling") return { ok: false, error: "cancelling" };
    const cp: Checkpoint = {
      runId,
      stepKey,
      label,
      output: sig.payload,
      meta,
      seq: ++this.seqCounter,
      undoneAt: null,
    };
    let m = this.cpByRun.get(runId);
    if (!m) {
      m = new Map();
      this.cpByRun.set(runId, m);
    }
    m.set(stepKey, cp);
    sig.consumedAt = now;
    this.release(runId, name);
    return { ok: true, value: cp };
  }

  // -- waiters ----------------------------------------------------------

  park(
    runId: string,
    name: string,
    kind: "signal" | "poll",
    deadline: number | null,
    opts?: { overwrite?: boolean },
  ): { ok: true; value: Waiter } {
    let m = this.waitersByRun.get(runId);
    if (!m) {
      m = new Map();
      this.waitersByRun.set(runId, m);
    }
    const existing = m.get(name);
    if (existing && !opts?.overwrite) return { ok: true, value: existing };
    const w: Waiter = { runId, name, kind, deadline, seq: ++this.seqCounter };
    m.set(name, w);
    return { ok: true, value: w };
  }

  getWaiter(runId: string, name: string): Waiter | null {
    return this.waitersByRun.get(runId)?.get(name) ?? null;
  }

  /** Waiters listed by name (ascending), scoped to the run. */
  waiters(runId: string): Waiter[] {
    return [...(this.waitersByRun.get(runId)?.values() ?? [])].sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
  }

  /** Idempotent release, scoped to the run. */
  release(runId: string, name: string): "ok" {
    this.waitersByRun.get(runId)?.delete(name);
    return "ok";
  }

  /** Idempotent release of every waiter of the run. */
  releaseAll(runId: string): "ok" {
    this.waitersByRun.delete(runId);
    return "ok";
  }

  // -- snapshot (seq-capped) ----------------------------------------------

  /** One consistent read: the run + its standing checkpoints in seq order. */
  snapshot(runId: string): { run: RunRecord; standing: Checkpoint[] } | null {
    const run = this.runs.get(runId);
    if (!run) return null;
    return { run, standing: this.standing(runId) };
  }
}
