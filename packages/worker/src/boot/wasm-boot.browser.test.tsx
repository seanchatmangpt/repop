import { describe, expect, it } from "vitest";
import {
  instantiateKernel,
  KERNEL_EXPORT_ALLOWLIST,
  STRUCTURAL_EXPORTS,
} from "./wasm-boot.ts";
import { bootWorker, type BootEnv } from "./index.ts";

/**
 * Boot smoke court (I4 / seam S5) — instantiates the REAL built kernel
 * artifact in real chromium via `instantiateKernel`, against the pinned
 * 9-export allowlist (authority: kernel/scripts/footprint_gate.py
 * REPOP_FUNCS). Boot FSM must reach ready-or-typed-refusal within a
 * deadline — no hang, no silent admit.
 */

const WASM_URL = "/@fs/Users/sac/repop/packages/worker/public/repop_kernel.wasm";

function deadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("boot-deadline-exceeded: " + label)), ms),
    ),
  ]);
}

describe("wasm boot smoke court (real artifact, chromium)", () => {
  it("real kernel wasm passes the pinned 9-export allowlist contract", async () => {
    const res = await deadline(fetch(WASM_URL), 5_000, "wasm-fetch");
    expect(res.ok, "wasm fetch failed: " + res.status).toBeDefined();
    expect(res.ok, "wasm fetch status " + String(res.status)).toBe(true);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(0);

    const verdict = await instantiateKernel(bytes);
    expect(verdict.ok, verdict.ok ? "" : verdict.reason).toBe(true);
    if (verdict.ok) {
      const abi = verdict.instance.exports["repop_abi_version"];
      expect(typeof abi).toBe("function");
      const abiVersion = (abi as () => number)();
      expect(typeof abiVersion).toBe("number");
      expect(abiVersion).toBeGreaterThan(0);
      // The exports actually present on the real instance must exactly
      // match the pinned list (+ structural) — re-asserted from the
      // instance, not the allowlist itself (tautology guard).
      const seen = Object.keys(verdict.instance.exports).sort();
      expect(seen).toEqual(
        [...KERNEL_EXPORT_ALLOWLIST, ...STRUCTURAL_EXPORTS].sort(),
      );
    }
  });

  it("boot FSM reaches ready-or-typed-refusal against the real probe, no hang", async () => {
    const env: BootEnv = {
      probe: () => ({
        crossOriginIsolated: Boolean(
          (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated,
        ),
        sabConstructible: (() => {
          try {
            new SharedArrayBuffer(8);
            return true;
          } catch {
            return false;
          }
        })(),
        serviceWorkerSupported: false, // court: never reload; fallback is a lawful terminal
      }),
      guardStore: () => ({
        getItem: () => null,
        setItem: () => undefined,
      }),
      reload: () => undefined,
    };
    const outcome = await deadline(bootWorker({ env }), 5_000, "boot-fsm");
    expect(["SAB_BOOT", "FALLBACK_BOOT", "FAILED"]).toContain(outcome.finalState);
    if (outcome.finalState === "FAILED") {
      expect(String(outcome.transport).length).toBeGreaterThan(0);
    }
  });
});
