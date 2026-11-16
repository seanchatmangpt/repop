/**
 * Worker-bundle entry — the module packaged into `dist/repop.worker.js`.
 *
 * Bundles the namespace barrel (`src/index.ts`) plus a real boot surface:
 * the kernel wasm is instantiated through `instantiateKernel` (pinned
 * 9-export allowlist, fail-closed) and the boot FSM runs to a terminal
 * state (SAB_BOOT / FALLBACK_BOOT / typed FAILED) — never a hang. The
 * kernel round-trip surface is `repop_abi_version()` on the real
 * instance; a postMessage frame carrying its result is the first-frame
 * proof the integration courts pin.
 *
 * Wire protocol (postMessage, main → worker):
 *   { type: "boot"; wasmUrl?: string }
 *   { type: "frame"; id: number }
 * worker → main:
 *   { type: "booted"; transport; state; abiVersion; kernelSha256? }
 *   { type: "refused"; reason }   (typed refusal, never a silent admit)
 *   { type: "frame"; id; abiVersion }
 */

import { bootWorker, type BootEnv } from "./boot/index.ts";
import { instantiateKernel, KERNEL_EXPORT_ALLOWLIST } from "./boot/wasm-boot.ts";
import { probeCoi, defaultDetectEnv } from "./boot/detect.ts";

export * from "./index.ts";

const DEFAULT_WASM_URL = "/repop_kernel.wasm";
/** Deadline-checked budget for boot + first frame. Never a fixed sleep. */
const BOOT_DEADLINE_MS = 10_000;

interface WorkerMessageProtocol {
  readonly id: number;
  readonly abiVersion: number | null;
}

let kernelInstance: WebAssembly.Instance | null = null;
let bootedFrame: WorkerMessageProtocol = { id: 0, abiVersion: null };

function deadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("boot-deadline-exceeded: " + label)), ms);
    }),
  ]);
}

async function runBoot(wasmUrl: string): Promise<
  | { ok: true; transport: string; state: string; abiVersion: number }
  | { ok: false; reason: string }
> {
  // COI probe first (R5 law): decide transport before any worker machinery.
  const env: BootEnv = {
    probe: () => probeCoi(defaultDetectEnv()),
    registerSw: async () => {
      // In the worker bundle the coi-sw registration is the MAIN thread's
      // job (the worker cannot register a SW controlling itself); the
      // in-worker FSM treats SW as unavailable and lands in FALLBACK when
      // SAB is absent — the postMessage fallback is the main thread's
      // decision, surfaced through `refused`/`transport: "fallback"`.
      return false;
    },
    guardStore: () => ({
      getItem: () => "worker-side:reload-not-applicable",
      setItem: () => undefined,
      // Worker-side reload guard is permanently spent: no reload storm.
    }),
    reload: () => undefined,
  };

  const boot = await deadline(bootWorker({ env }), BOOT_DEADLINE_MS, "boot-fsm");
  if (boot.finalState === "FAILED") {
    return { ok: false, reason: "boot-fsm-failed: " + String(boot.finalState) };
  }

  const bytes = await deadline(fetch(wasmUrl).then((r) => r.arrayBuffer()), BOOT_DEADLINE_MS, "wasm-fetch");
  const verdict = await instantiateKernel(new Uint8Array(bytes));
  if (!verdict.ok) return { ok: false, reason: verdict.reason };

  kernelInstance = verdict.instance;
  const abiVersion = readAbiVersion(kernelInstance);
  if (abiVersion === null) {
    return { ok: false, reason: "export-contract-refused: repop_abi_version not callable" };
  }
  bootedFrame = { id: 1, abiVersion };
  return { ok: true, transport: boot.transport, state: boot.finalState, abiVersion };
}

/** Real kernel call through the C-ABI — the first-frame round-trip payload. */
function readAbiVersion(instance: WebAssembly.Instance): number | null {
  const f = instance.exports["repop_abi_version"];
  return typeof f === "function" ? (f() as number) : null;
}

function handleMessage(msg: unknown, post: (m: unknown) => void): void {
  const m = msg as { type?: string; wasmUrl?: string; id?: number } | null;
  if (!m || typeof m !== "object" || typeof m.type !== "string") {
    post({ type: "refused", reason: "malformed-message: no type discriminant" });
    return;
  }
  switch (m.type) {
    case "boot": {
      const wasmUrl = typeof m.wasmUrl === "string" ? m.wasmUrl : DEFAULT_WASM_URL;
      runBoot(wasmUrl)
        .then((r) => {
          if (r.ok) {
            post({
              type: "booted",
              transport: r.transport,
              state: r.state,
              abiVersion: r.abiVersion,
              allowlist: KERNEL_EXPORT_ALLOWLIST,
            });
          } else {
            post({ type: "refused", reason: r.reason });
          }
        })
        .catch((err: unknown) => {
          post({
            type: "refused",
            reason: err instanceof Error ? err.message : String(err),
          });
        });
      return;
    }
    case "frame": {
      if (kernelInstance === null) {
        post({ type: "refused", reason: "not-booted: frame before boot" });
        return;
      }
      const abiVersion = readAbiVersion(kernelInstance);
      post({ type: "frame", id: m.id ?? bootedFrame.id, abiVersion });
      return;
    }
    default:
      post({ type: "refused", reason: "unknown-message-type: " + m.type });
  }
}

// Worker surface: register only in a worker context (no DOM document).
// NOTE: in Chromium module workers `importScripts` is still DEFINED (it
// merely throws when called), so a typeof-importScripts guard is false
// there — witnessed in the I4 COI court (silently dead worker). The
// document-absence probe is the correct DedicatedWorkerGlobalScope test.
const workerSelf = globalThis as {
  onmessage: unknown;
  postMessage: (m: unknown) => void;
  document?: unknown;
};
if (
  typeof workerSelf.onmessage !== "undefined" &&
  typeof workerSelf.document === "undefined"
) {
  workerSelf.onmessage = (ev: MessageEvent) =>
    handleMessage(ev.data, (m) => workerSelf.postMessage(m));
}

/** Main-thread-testable handler (browser court drives this directly). */
export { handleMessage };

export const _internal = { DEFAULT_WASM_URL, BOOT_DEADLINE_MS, get bootedFrame() { return bootedFrame; } };
