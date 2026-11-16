import { describe, expect, it } from "vitest";
import { DurableStore } from "./store.ts";

/**
 * Conformance courts — direct port of ash_pplan test/support/durable/
 * store_conformance.ex (the sc:Law individuals) onto the TypeScript store.
 * One `it()` per law, law id in the test name. T0 fixed clock, run "r1"
 * pre-inserted, fresh store per test (mirrors StoreConformance.boot/1).
 */

const T0 = Date.UTC(2026, 0, 1); // ~U[2026-01-01 00:00:00.000Z]

/** Mirrors StoreConformance.boot/2: fresh store, run "r1" pre-inserted. */
function boot(): DurableStore {
  const s = new DurableStore();
  const r = s.startRun({ id: "r1", model: "m", bindings: { a: 1 } });
  if (!r.ok) throw new Error(r.error);
  return s;
}

function must<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.value;
}

describe("law_start_run_exclusive: start_run is exclusive per id; get_run/list_runs round-trip in insertion order; parent is stored", () => {
  it("refuses a duplicate id with :exists", () => {
    const s = boot();
    const r = s.startRun({ id: "r1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("exists");
  });

  it("stores parent pair, initial status/version; get_run/list_runs round-trip", () => {
    const s = boot();
    const c = must(s.startRun({ id: "r2", parent: ["r1", "sig"] }));
    expect(c.parentId).toBe("r1");
    expect(c.parentSignal).toBe("sig");
    expect(c.status).toBe("pending");
    expect(c.version).toBe(1);
    expect(s.getRun("r1")?.bindings).toEqual({ a: 1 });
    expect(s.getRun("nope")).toBeNull();
    expect(s.listRuns().map((x) => x.id)).toEqual(["r1", "r2"]);
  });
});

describe("law_transition_guarded: ok bumps version, stale, illegal, not_found; terminal is absorbing", () => {
  it("applies only from an allowed status per the FSM", () => {
    const s = boot();
    const v = s.getRun("r1")!.version;
    const r = must(s.transition("r1", ["pending"], "waiting", {}));
    expect(r.status).toBe("waiting");
    expect(r.version).toBe(v + 1);
    const stale = s.transition("r1", ["pending"], "completed", {});
    expect(stale).toEqual({ ok: false, error: "stale" });
    // waiting -> cancelled is not an FSM row
    expect(s.transition("r1", "any", "cancelled", {})).toEqual({
      ok: false,
      error: "illegal",
    });
    expect(s.transition("zz", "any", "failed", {})).toEqual({
      ok: false,
      error: "not_found",
    });
    const done = must(s.transition("r1", "any", "completed", { result: 42 }));
    expect(done.result).toBe(42);
    // terminal is absorbing
    expect(s.transition("r1", "any", "failed", {})).toEqual({
      ok: false,
      error: "stale",
    });
    expect(s.getRun("r1")?.status).toBe("completed");
  });
});

describe("law_claim_lease: free when unclaimed, lease lapsed, or same claimer re-enters; nil claimer never re-enters", () => {
  it("enforces the lease CAS ladder", () => {
    const s = boot();
    const r = must(s.claim("r1", "a", 1000, T0));
    expect(r.claimedBy).toBe("a");
    expect(s.claim("r1", "b", 1000, T0 + 500)).toEqual({ ok: false, error: "taken" });
    must(s.claim("r1", "a", 1000, T0 + 500)); // re-entry
    const b = must(s.claim("r1", "b", 1000, T0 + 5000)); // lapsed
    expect(b.claimedBy).toBe("b");
    must(s.claim("r1", null, 1000, T0 + 20_000)); // nil claimer takes free run
    // nil claimer never re-enters: another nil claim before lapse is refused
    expect(s.claim("r1", null, 1000, T0 + 20_001)).toEqual({ ok: false, error: "taken" });
    must(s.claim("r1", null, 1000, T0 + 21_000)); // lapsed again
    expect(s.claim("missing", "a", 10, T0)).toEqual({ ok: false, error: "taken" });
  });
});

describe("law_claim_exclusive_concurrent: concurrent claim has exactly one winner", () => {
  it("32 contending claims at one instant elect one holder", () => {
    // The JS event loop is the one-message guarantee: claims are serialized,
    // and the CAS admits exactly the first holder. This court proves the CAS
    // admits no second winner under same-instant contention.
    const s = boot();
    const results = Array.from({ length: 32 }, (_, i) =>
      s.claim("r1", `c${i}`, 60_000, T0),
    );
    expect(results.filter((r) => r.ok).length).toBe(1);
    expect(results.filter((r) => !r.ok && r.error === "taken").length).toBe(31);
  });
});

describe("law_release_claim_owner_only: clears only the holder's claim; idempotent; no-op for others", () => {
  it("foreign release is a no-op, holder release clears, missing run is ok", () => {
    const s = boot();
    must(s.claim("r1", "a", 60_000, T0));
    expect(s.releaseClaim("r1", "b")).toBe("ok");
    expect(s.getRun("r1")?.claimedBy).toBe("a");
    expect(s.releaseClaim("r1", "a")).toBe("ok");
    expect(s.getRun("r1")?.claimedBy).toBeNull();
    expect(s.releaseClaim("r1", "a")).toBe("ok");
    expect(s.releaseClaim("missing", "a")).toBe("ok");
    expect(must(s.claim("r1", "b", 60_000, T0)).claimedBy).toBe("b");
  });
});

describe("law_record_insert_or_adopt: second write for (run, key) returns the standing checkpoint unchanged", () => {
  it("adopts the first write", () => {
    const s = boot();
    const a = must(s.record("r1", "k1", "one", 1, { impl: "Foo", args: { x: 1 } }));
    const b = must(s.record("r1", "k2", "two", 2, {}));
    const a2 = must(s.record("r1", "k1", "one", 999, {}));
    expect(a2).toEqual(a);
    expect(a2.output).toBe(1);
    expect(a.meta).toEqual({ impl: "Foo", args: { x: 1 } });
    expect(b.seq).toBeGreaterThan(a.seq);
    expect(Object.keys(s.checkpoints("r1")).sort()).toEqual(["k1", "k2"]);
    expect(s.checkpoints("r1")["k1"]!.output).toBe(1);
  });
});

describe("law_record_concurrent_adopts: one standing row, every caller sees the first output", () => {
  it("24 racing records collapse to one standing row", () => {
    const s = boot();
    const outs = Array.from({ length: 24 }, (_, i) =>
      must(s.record("r1", "k", "l", i + 1, {})),
    ).map((cp) => cp.output);
    expect(new Set(outs).size).toBe(1);
    expect(s.standing("r1").length).toBe(1);
  });
});

describe("law_standing_ordered_by_seq: non-undone checkpoints in seq order; scoped per run", () => {
  it("orders by seq and scopes per run", () => {
    const s = boot();
    must(s.startRun({ id: "r2" }));
    const a = must(s.record("r1", "z", "first", 1, {}));
    must(s.record("r2", "x", "other", 0, {}));
    const b = must(s.record("r1", "a", "second", 2, {}));
    const c = must(s.record("r1", "m", "third", 3, {}));
    expect(a.seq).toBeLessThan(b.seq);
    expect(b.seq).toBeLessThan(c.seq);
    expect(s.standing("r1").map((x) => x.label)).toEqual(["first", "second", "third"]);
    expect(s.standing("r2").map((x) => x.label)).toEqual(["other"]);
    expect(s.standing("none")).toEqual([]);
    expect(s.checkpoints("none")).toEqual({});
  });
});

describe("law_terminal_refuses_checkpoints: terminal refuses NEW but still adopts a standing one", () => {
  it("absorbing terminal + adopt-always", () => {
    const s = boot();
    const a = must(s.record("r1", "k1", "one", 1, {}));
    must(s.transition("r1", "any", "completed", {}));
    expect(s.record("r1", "k2", "two", 2, {})).toEqual({ ok: false, error: "terminal" });
    const again = must(s.record("r1", "k1", "one", 999, {}));
    expect(again).toEqual(a);
    expect(Object.keys(s.checkpoints("r1"))).toEqual(["k1"]);
  });
});

describe("law_undo_once: claim_undo consume-once via volatile lease; undone_at only by mark_undone; release_undo reopens", () => {
  it("undo claim lifecycle", () => {
    const s = boot();
    must(s.record("r1", "k", "l", 1, {}));
    const cp = must(s.claimUndo("r1", "k", T0));
    expect(cp.undoneAt).toBeNull();
    expect(s.claimUndo("r1", "k", T0)).toEqual({ ok: false, error: "taken" });
    expect(s.standing("r1").map((x) => x.stepKey)).toEqual(["k"]);
    expect(s.releaseUndo("r1", "k")).toBe("ok");
    must(s.claimUndo("r1", "k", T0));
    const m = must(s.markUndone("r1", "k", T0));
    expect(m.undoneAt).toBe(T0);
    expect(s.standing("r1")).toEqual([]);
    const m2 = must(s.markUndone("r1", "k", T0)); // idempotent re-mark
    expect(m2.undoneAt).toBe(T0);
    expect(s.claimUndo("r1", "k", T0)).toEqual({ ok: false, error: "taken" });
    expect(s.markUndone("r1", "nokey", T0)).toEqual({ ok: false, error: "not_found" });
    expect(s.claimUndo("r1", "nokey", T0)).toEqual({ ok: false, error: "taken" });
    expect(s.releaseUndo("r1", "nokey")).toBe("ok");
  });
});

describe("law_signals_fifo_consume_once: FIFO per name, unique ids, consume-once", () => {
  it("signal queue law", () => {
    const s = boot();
    const s1 = s.deliverSignal("r1", "go", 1);
    const s2 = s.deliverSignal("r1", "go", 2);
    s.deliverSignal("r1", "other", 3);
    expect(s1.id).not.toBe(s2.id);
    expect(s.pendingSignal("r1", "go")?.id).toBe(s1.id);
    expect(s.pendingSignal("r1", "none")).toBeNull();
    const consumed = must(s.consumeSignal(s1.id, T0));
    expect(consumed.consumedAt).toBe(T0);
    expect(s.consumeSignal(s1.id, T0)).toEqual({ ok: false, error: "taken" });
    expect(s.consumeSignal(999999, T0)).toEqual({ ok: false, error: "taken" });
    expect(s.pendingSignal("r1", "go")?.id).toBe(s2.id);
    expect(s.signals("r1").length).toBe(3);
    expect(s.signals("r1").map((x) => x.payload)).toEqual([1, 2, 3]);
    expect(s.signals("r2")).toEqual([]);
  });
});

describe("law_consume_concurrent: concurrent consume_signal has exactly one winner", () => {
  it("16 racing consumes elect one", () => {
    const s = boot();
    const sig = s.deliverSignal("r1", "go", 1);
    const results = Array.from({ length: 16 }, () => s.consumeSignal(sig.id, T0));
    expect(results.filter((r) => r.ok).length).toBe(1);
    expect(results.filter((r) => !r.ok && r.error === "taken").length).toBe(15);
    expect(s.pendingSignal("r1", "go")).toBeNull();
  });
});

describe("law_park_deadline_once: keeps the first deadline unless overwrite; waiters listed by name", () => {
  it("park law", () => {
    const s = boot();
    const d1 = T0 + 1000;
    const d2 = T0 + 9000;
    const w = s.park("r1", "w", "signal", d1).value;
    expect(s.park("r1", "w", "signal", d2)).toEqual({ ok: true, value: w });
    expect(s.getWaiter("r1", "w")?.deadline).toBe(d1);
    const w2 = s.park("r1", "w", "poll", d2, { overwrite: true }).value;
    expect(w2.deadline).toBe(d2);
    expect(w2.kind).toBe("poll");
    expect(s.getWaiter("r1", "w")?.deadline).toBe(d2);
    s.park("r1", "v", "signal", null);
    expect(s.waiters("r1").map((x) => x.name)).toEqual(["v", "w"]);
    expect(s.getWaiter("r1", "absent")).toBeNull();
    expect(s.waiters("r2")).toEqual([]);
  });
});

describe("law_release_idempotent: release and release_all idempotent, scoped to the run", () => {
  it("release scoping", () => {
    const s = boot();
    must(s.startRun({ id: "r2" }));
    s.park("r1", "w", "signal", null);
    s.park("r1", "v", "signal", null);
    s.park("r2", "w", "signal", null);
    expect(s.release("r1", "w")).toBe("ok");
    expect(s.release("r1", "w")).toBe("ok");
    expect(s.getWaiter("r1", "w")).toBeNull();
    expect(s.getWaiter("r2", "w")).not.toBeNull();
    expect(s.releaseAll("r1")).toBe("ok");
    expect(s.releaseAll("r1")).toBe("ok");
    expect(s.waiters("r1")).toEqual([]);
    expect(s.waiters("r2").length).toBe(1);
  });
});

describe("law_claim_persists_lease: lease_ms and lease_until visible through get_run", () => {
  it("persisted lease fields", () => {
    const s = boot();
    const r = must(s.claim("r1", "a", 1000, T0));
    expect(r.leaseMs).toBe(1000);
    expect(r.leaseUntil).toBe(T0 + 1000);
    expect(s.getRun("r1")?.leaseUntil).toBe(T0 + 1000);
  });
});

describe("law_renew_claim_cas: holder-only CAS; foreign claimer and missing run are :taken", () => {
  it("renew law", () => {
    const s = boot();
    must(s.claim("r1", "a", 60_000, T0));
    const r = must(s.renewClaim("r1", "a", 120_000, T0 + 1));
    expect(r.leaseUntil).toBeGreaterThan(T0 + 60_000);
    expect(s.renewClaim("r1", "b", 120_000, T0 + 1)).toEqual({ ok: false, error: "taken" });
    expect(s.renewClaim("missing", "a", 120_000, T0 + 1)).toEqual({ ok: false, error: "taken" });
    expect(s.getRun("r1")?.leaseMs).toBe(120_000);
  });
});

describe("law_missing_lease_fails_closed: claimed record with no persisted lease — owner re-entry only", () => {
  it("ghost claim blocks everyone else", () => {
    const s = boot();
    must(s.startRun({ id: "rleaseless", claimedAt: T0, claimedBy: "ghost" }));
    expect(s.claim("rleaseless", "b", 60_000, T0 + 86_400_000)).toEqual({
      ok: false,
      error: "taken",
    });
    expect(must(s.claim("rleaseless", "ghost", 60_000, T0)).claimedBy).toBe("ghost");
  });
});

describe("law_release_clears_lease: release_claim clears the claim AND the lease fields", () => {
  it("lease fields nulled on release", () => {
    const s = boot();
    must(s.claim("r1", "a", 60_000, T0));
    expect(s.releaseClaim("r1", "a")).toBe("ok");
    const r = s.getRun("r1")!;
    expect(r.claimedBy).toBeNull();
    expect(r.claimedAt).toBeNull();
    expect(r.leaseMs).toBeNull();
    expect(r.leaseUntil).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// take_signal facade law (the atomic transition) + falsifiers
// ---------------------------------------------------------------------------

describe("take_signal: consume-once + adopt + waiter release in ONE operation", () => {
  it("returns :none with no pending signal for ANY step key (strict law)", () => {
    const s = boot();
    expect(s.takeSignal("r1", "go", "k", "l", {}, T0)).toEqual({ ok: false, error: "none" });
    // adopt-regardless is refused even when a standing checkpoint exists
    must(s.record("r1", "k", "l", 1, {}));
    expect(s.takeSignal("r1", "go", "k", "l", {}, T0)).toEqual({ ok: false, error: "none" });
  });

  it("FACADE FALSIFIER — double execution: second take is :none, one standing row", () => {
    const s = boot();
    s.deliverSignal("r1", "go", 42);
    const first = s.takeSignal("r1", "go", "k", "l", {}, T0);
    expect(first.ok).toBe(true);
    const second = s.takeSignal("r1", "go", "k", "l", {}, T0);
    expect(second).toEqual({ ok: false, error: "none" });
    expect(s.standing("r1").length).toBe(1);
    expect(s.standing("r1")[0]!.output).toBe(42);
  });

  it("FACADE FALSIFIER — resume consumes exactly one signal and adopts standing checkpoint unchanged", () => {
    const s = boot();
    // crash-after-commit: checkpoint exists, signal re-delivered on resume
    const planted = must(s.record("r1", "k", "l", 7, {}));
    s.deliverSignal("r1", "go", 999);
    const r = s.takeSignal("r1", "go", "k", "l", {}, T0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(planted); // adopted unchanged, output 7 not 999
    expect(s.pendingSignal("r1", "go")).toBeNull(); // consumed exactly one
    expect(s.getWaiter("r1", "go")).toBeNull(); // waiter released
  });

  it("releases the parked waiter on a fresh take", () => {
    const s = boot();
    s.park("r1", "go", "signal", null);
    s.deliverSignal("r1", "go", 1);
    expect(s.takeSignal("r1", "go", "k", "l", {}, T0).ok).toBe(true);
    expect(s.getWaiter("r1", "go")).toBeNull();
  });

  it("terminal run refuses and leaves the signal pending", () => {
    const s = boot();
    must(s.transition("r1", "any", "completed", {}));
    s.deliverSignal("r1", "go", 1);
    expect(s.takeSignal("r1", "go", "k", "l", {}, T0)).toEqual({
      ok: false,
      error: "terminal",
    });
    expect(s.pendingSignal("r1", "go")).not.toBeNull();
  });

  it("snapshot is seq-capped and consistent", () => {
    const s = boot();
    must(s.record("r1", "a", "one", 1, {}));
    must(s.record("r1", "b", "two", 2, {}));
    const snap = s.snapshot("r1")!;
    expect(snap.run.id).toBe("r1");
    expect(snap.standing.map((c) => c.label)).toEqual(["one", "two"]);
    expect(s.snapshot("nope")).toBeNull();
  });
});
