/**
 * useActor courts (Chicago: real in-process client, final-state asserts).
 * Mutation legs are executed by the lane shim-court script, not here.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useActor } from "./useActor.js";
import type { RepopClient, RepopIntent, RepopSnapshot } from "./types.js";

/** Real in-process RepopClient (hand-written; not a mock of a collaborator). */
function makeClient(overrides: Partial<RepopClient> = {}): RepopClient & {
  failNextWith(error: unknown): void;
  refuseNextStale(): void;
  setReady(ready: boolean): void;
  listeners: Set<() => void>;
} {
  const listeners = new Set<() => void>();
  let ready = true;
  let failNext: unknown = undefined;
  let staleNext = false;
  const snapshot = (): RepopSnapshot => ({
    status: ready ? "ready" : "idle",
    entities: new Map(),
    projections: [],
  });
  const base: RepopClient = {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getSnapshot: snapshot,
    bootstrap: async () => undefined,
    commitIntent: async (_entityId, _intent, _expectedVersion) => {
      if (!ready) {
        const err = new Error("client is not booted");
        err.name = "RepopNotBootedError";
        throw err;
      }
      if (failNext !== undefined) {
        const e = failNext;
        failNext = undefined;
        throw e;
      }
      if (staleNext) {
        staleNext = false;
        return {
          ok: false as const,
          refusal: { class: "STALE_VERSION" as const, expected: 2, observed: 1 },
        };
      }
      return { ok: true as const, newVersion: _expectedVersion + 1 };
    },
    solve: async () => ({
      ok: true as const,
      side: 1 as const,
      distance: 0,
      source: "mirror" as const,
      verified: true,
    }),
    ...overrides,
  };
  return {
    ...base,
    listeners,
    failNextWith(e: unknown) {
      failNext = e;
    },
    refuseNextStale() {
      staleNext = true;
    },
    setReady(r: boolean) {
      ready = r;
      for (const l of listeners) l();
    },
  };
}

const INTENT: RepopIntent = { kind: "set", payload: { x: 1 } };

let capturedUnhandled: unknown[] = [];
function installUnhandledCourt(): void {
  process.on("unhandledRejection", (reason) => {
    capturedUnhandled.push(reason);
  });
}

afterEach(() => {
  const unhandled = capturedUnhandled;
  capturedUnhandled = [];
  expect(unhandled).toEqual([]);
});

describe("useActor send success", () => {
  installUnhandledCourt();
  it("commits and lands in committed state", async () => {
    const client = makeClient();
    const { result } = renderHook(() => useActor(client));
    let outcome: Awaited<ReturnType<typeof result.current.send>> | undefined;
    await act(async () => {
      outcome = await result.current.send("e1", INTENT, 1);
    });
    expect(outcome).toEqual({ ok: true, newVersion: 2 });
    expect(result.current.state).toEqual({
      status: "committed",
      pid: "e1",
      newVersion: 2,
    });
  });
});

describe("useActor refusal containment", () => {
  installUnhandledCourt();
  it("lands refused on STALE_VERSION with a required seq", async () => {
    const client = makeClient();
    client.refuseNextStale();
    const { result } = renderHook(() => useActor(client));
    await act(async () => {
      await result.current.send("e1", INTENT, 1);
    });
    const s = result.current.state;
    expect(s.status).toBe("refused");
    if (s.status === "refused") {
      expect(s.refusal.cause).toBe("STALE_VERSION");
      expect(s.refusal.containment).toBe("inline");
      expect(typeof s.refusal.seq).toBe("number");
    }
  });

  it("contains a thrown client error — no unhandledrejection possible", async () => {
    const client = makeClient();
    client.failNextWith(new Error("transport exploded"));
    const { result } = renderHook(() => useActor(client));
    let outcome: Awaited<ReturnType<typeof result.current.send>> | undefined;
    await act(async () => {
      outcome = await result.current.send("e1", INTENT, 1);
    });
    expect(outcome?.ok).toBe(false);
    expect(result.current.state.status).toBe("refused");
  });
});

describe("useActor pid switch", () => {
  installUnhandledCourt();
  it("resets to IDLE_ACTOR_STATE when the pid changes mid-send", async () => {
    const client = makeClient({
      commitIntent: () => new Promise(() => undefined),
    });
    const { result } = renderHook(() => useActor(client));
    await act(async () => {
      void result.current.send("e1", INTENT, 1);
    });
    expect(result.current.state.status).toBe("pending");
    await act(async () => {
      void result.current.send("e2", INTENT, 1);
    });
    expect(result.current.state.status).toBe("pending");
    expect(result.current.state.pid).toBe("e2");
  });
});

describe("useActor KERNEL_UNREADY auto-recover", () => {
  installUnhandledCourt();
  it("re-dispatches automatically when the kernel becomes ready", async () => {
    const client = makeClient();
    client.setReady(false);
    const { result } = renderHook(() => useActor(client));
    await act(async () => {
      await result.current.send("e1", INTENT, 1);
    });
    expect(result.current.state.status).toBe("refused");
    if (result.current.state.status === "refused") {
      expect(result.current.state.refusal.cause).toBe("KERNEL_UNREADY");
    }
    await act(async () => {
      client.setReady(true);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.state.status).toBe("committed");
  });
});
