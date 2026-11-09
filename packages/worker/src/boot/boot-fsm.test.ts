import { describe, expect, it } from "vitest";
import { BootError, pollUntil, transition, POLL_BUDGET_ATTEMPTS, POLL_INTERVAL_MS } from "./boot-fsm.ts";

describe("boot fsm legality", () => {
  it("walks the legal reload path to SAB_BOOT", () => {
    let s = transition("IDLE", { type: "START" });
    expect(s).toBe("PROBE");
    s = transition(s, { type: "PROBE_DONE", sabConstructible: false, serviceWorkerSupported: true });
    expect(s).toBe("SW_REGISTERING");
    s = transition(s, { type: "DECIDED_RELOAD" });
    expect(s).toBe("RELOADING");
    s = transition(s, { type: "SW_REGISTERED" });
    expect(s).toBe("PROBE_AFTER_RELOAD");
    s = transition(s, { type: "REPROBE_SAB" });
    expect(s).toBe("SAB_BOOT");
  });

  it("walks the legal fallback path", () => {
    let s = transition("IDLE", { type: "START" });
    s = transition(s, { type: "PROBE_DONE", sab: true, sw: true } as never);
    s = transition(s, { type: "DECIDED_FALLBACK" });
    expect(s).toBe("FALLBACK_BOOT");
  });

  it("refuses an illegal transition with typed BootError", () => {
    expect(() => transition("IDLE", { type: "REPROBE_SAB" })).toThrow(BootError);
  });

  it("refuses START on FAILED (terminal state)", () => {
    let s = transition("IDLE", { type: "START" });
    s = transition(s, { type: "FAIL", reason: "x" });
    expect(s).toBe("FAILED");
    expect(() => transition(s, { type: "START" })).toThrow(BootError);
  });

  it("poll budget pins 20 attempts x 100ms", () => {
    expect(POLL_BUDGET_ATTEMPTS).toBe(20);
    expect(POLL_INTERVAL_MS).toBe(100);
  });

  it("pollUntil succeeds immediately when the observable holds", async () => {
    let calls = 0;
    const ok = await pollUntil(
      () => { calls++; return true; },
      (_ms, fn) => fn(),
    );
    expect(ok).toBe(true);
    expect(calls).toBe(1);
  });

  it("pollUntil exhausts budget and returns false (deadline, no sleep)", async () => {
    let calls = 0;
    const ok = await pollUntil(
      () => { calls += 1; return false; },
      (_ms, fn) => fn(),
    );
    expect(ok).toBe(false);
    // 20 in-loop attempts + 1 final deadline re-check.
    expect(calls).toBe(21);
  });
});
