/**
 * bootWorker entry: probe -> decision -> coi-sw/SAB boot or guarded
 * fallback. Transport-agnostic surface for P9's client store.
 */

import { probeCoi, defaultDetectEnv, type CoiStatus } from "./detect.ts";
import { decideTransport, type Transport } from "./transport-decision.ts";
import {
  sessionStorageGuardStore,
  reloadGuardSpent,
  guardedReload,
  type ReloadGuardStore,
} from "./coi-boot.ts";
import { transition, type BootState } from "./boot-fsm.ts";
import type { WasmExportDesc } from "./wasm-boot.ts";

export const COI_SW_URL = "/coi-sw.js";

export interface BootEnv {
  readonly probe: () => CoiStatus;
  readonly registerSw: (url: string) => Promise<boolean>;
  readonly guardStore: () => ReloadGuardStore;
  readonly reload: () => void;
}

export function defaultBootEnv(): BootEnv {
  return {
    probe: () => probeCoi(defaultDetectEnv()),
    registerSw: async (url: string): Promise<boolean> => {
      if (typeof navigator === "undefined") return false;
      if (!("serviceWorker" in navigator)) return false;
      try {
        const reg = await navigator.serviceWorker.register(url);
        await navigator.serviceWorker.ready;
        return reg !== null;
      } catch {
        return false;
      }
    },
    guardStore: () => sessionStorageGuardStore(),
    reload: () => globalThis.location.reload(),
  };
}

export interface BootOutcome {
  readonly finalState: BootState;
  readonly transport: Transport;
  readonly status: CoiStatus;
  readonly reloaded: boolean;
}

export interface BootOptions {
  readonly env?: BootEnv;
}

export async function bootWorker(options: BootOptions = {}): Promise<BootOutcome> {
  const env = options.env ?? defaultBootEnv();
  const guard = env.guardStore();

  let state: BootState = "IDLE";
  const fire = (event: Parameters<typeof transition>[1]): void => {
    state = transition(state, event);
  };

  fire({ type: "START" });
  const status = env.probe();
  fire({
    type: "PROBE_DONE",
    sabConstructible: status.sabConstructible,
    serviceWorkerSupported: status.serviceWorkerSupported,
  });

  const decision = decideTransport({
    sabConstructible: status.sabConstructible,
    serviceWorkerSupported: status.serviceWorkerSupported,
    reloadGuardSpent: reloadGuardSpent(guard),
  });

  let reloaded = false;
  if (decision === "reload-and-reprobe") {
    fire({ type: "DECIDED_RELOAD" });
    const registered = await env.registerSw(COI_SW_URL);
    if (registered) {
      fire({ type: "SW_REGISTERED" });
      guardedReload(guard, env.reload);
      reloaded = reloadGuardSpent(guard);
      const status2 = env.probe();
      fire(
        status2.sabConstructible
          ? { type: "REPROBE_SAB" }
          : { type: "REPROBE_NO_SAB" },
      );
    } else {
      fire({ type: "SW_FAILED" });
    }
  } else if (decision === "sab") {
    fire({ type: "DECIDED_SAB" });
  } else {
    fire({ type: "DECIDED_FALLBACK" });
  }

  return { finalState: state, transport: decision, status, reloaded };
}

export type { CoiStatus, Transport, WasmExportDesc, BootState };
export { BootError } from "./boot-fsm.ts";
