/**
 * COI/SAB detection — probe ground truth, not the flag (P7 plan).
 *
 * Law: `crossOriginIsolated` is advisory telemetry only. Environments exist
 * where the flag lies in both directions. The transport decision reads the
 * REAL probe result — actual `new SharedArrayBuffer(8)` construction —
 * never the flag alone.
 */

export interface CoiStatus {
  /** Advisory telemetry; never load-bearing. */
  readonly crossOriginIsolated: boolean;
  /** Ground truth: a real SharedArrayBuffer constructible in this realm. */
  readonly sabConstructible: boolean;
  /** Service worker container present (needed for the coi-sw path). */
  readonly serviceWorkerSupported: boolean;
}

export interface DetectEnv {
  readonly crossOriginIsolated?: boolean;
  readonly tryConstructSab: () => boolean;
  readonly serviceWorkerSupported: boolean;
}

export const DEFAULT_SAB_TEST_BYTES = 8;

/** Real-construct SAB probe. Default environment reads the actual realm. */
export function tryConstructSabInRealm(bytes = DEFAULT_SAB_TEST_BYTES): boolean {
  if (typeof SharedArrayBuffer === "undefined") return false;
  try {
    new SharedArrayBuffer(bytes);
    return true;
  } catch {
    return false;
  }
}

export function defaultDetectEnv(): DetectEnv {
  return {
    crossOriginIsolated:
      typeof crossOriginIsolated !== "undefined" ? crossOriginIsolated : false,
    tryConstructSab: () => tryConstructSabInRealm(),
    serviceWorkerSupported: typeof navigator !== "undefined" && "serviceWorker" in navigator,
  };
}

/** Probe once; the result is the ground truth fed to transport-decision. */
export function probeCoi(env: DetectEnv = defaultDetectEnv()): CoiStatus {
  const sabConstructible = env.tryConstructSab() === true;
  return {
    crossOriginIsolated: env.crossOriginIsolated === true,
    sabConstructible,
    serviceWorkerSupported: env.serviceWorkerSupported,
  };
}
