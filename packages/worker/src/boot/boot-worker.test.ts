import { describe, expect, it } from "vitest";
import {
  bootWorker,
  type BootEnv,
} from "./index.ts";
import { RELOAD_GUARD_KEY, memoryGuardStore } from "./coi-boot.ts";

function stubEnv(
  sab: boolean,
  sw: boolean,
  guard: ReturnType<typeof memoryGuardStore>,
): BootEnv {
  return {
    probe: () => ({
      crossOriginIsolated: sab,
      sabConstructible: sab,
      serviceWorkerSupported: sw,
    }),
    registerSw: async () => true,
    guardStore: () => guard,
    reload: () => undefined,
  };
}

describe("bootWorker end-to-end flow", () => {
  it("lands in SAB_BOOT with real SAB", async () => {
    const guard = memoryGuardStore();
    const outcome = await bootWorker({ env: stubEnv(true, true, guard) });
    expect(outcome.finalState).toBe("SAB_BOOT");
    expect(outcome.transport).toBe("sab");
    expect(outcome.reloaded).toBe(false);
  });

  it("double entry after reload lands in FALLBACK_BOOT (no second reload)", async () => {
    const guard = memoryGuardStore();
    const first = await bootWorker({ env: stubEnv(false, true, guard) });
    expect(first.reloaded).toBe(true);
    expect(guard.getItem(RELOAD_GUARD_KEY)).not.toBe(null);
    const second = await bootWorker({ env: stubEnv(false, true, guard) });
    expect(second.reloaded).toBe(false);
    expect(second.finalState).toBe("FALLBACK_BOOT");
  });

  it("SW registration failure falls back without reloading", async () => {
    const guard = memoryGuardStore();
    const env = { ...stubEnv(false, true, guard), registerSw: async () => false };
    const outcome = await bootWorker({ env });
    expect(outcome.reloaded).toBe(false);
    expect(outcome.finalState).toBe("FALLBACK_BOOT");
  });

  it("no-SW environment goes straight to fallback", async () => {
    const guard = memoryGuardStore();
    const outcome = await bootWorker({ env: stubEnv(false, false, guard) });
    expect(outcome.finalState).toBe("FALLBACK_BOOT");
    expect(outcome.reloaded).toBe(false);
  });
});
