/**
 * Descope-safe client seam for the React binding layer.
 *
 * The seam never touches window/SharedArrayBuffer/workers directly: every
 * capability is projected off the injected RepopClient contract (types.ts,
 * P10 structural seam), so the module is SSR-safe by construction.
 *
 * Also owns the 7-cause refusal vocabulary and the fallback/inline
 * containment-class mapping (P13 contract). Every contained refusal carries
 * a required monotonic seq; a refusal without a seq is never minted.
 */

import { EMPTY, type RepopClient, type RepopIntent, type RepopSnapshot } from "./types.js";

export type RefusalCause =
  | "STALE_VERSION"
  | "HYPERPLANE_BREACH"
  | "WORKER_REFUSED"
  | "KERNEL_UNREADY"
  | "UNKNOWN_FRAME"
  | "TIMEOUT"
  | "BREACH";

export type ContainmentClass = "fallback" | "inline";

export interface ContainedRefusal {
  readonly seq: number;
  readonly cause: RefusalCause;
  readonly containment: ContainmentClass;
  readonly entityKey: string;
  readonly detail: string;
  readonly at: number;
  readonly retryable: boolean;
}

export const CAUSE_CONTAINMENT: Readonly<Record<RefusalCause, ContainmentClass>> = Object.freeze({
  STALE_VERSION: "inline",
  KERNEL_UNREADY: "inline",
  WORKER_REFUSED: "fallback",
  HYPERPLANE_BREACH: "fallback",
  UNKNOWN_FRAME: "fallback",
  TIMEOUT: "fallback",
  BREACH: "fallback",
});

let seqCounter = 0;
function nextSeq(): number {
  seqCounter += 1;
  return seqCounter;
}

function detailOf(raw: unknown): string {
  if (typeof raw === "object" && raw !== null) {
    const r = raw as { detail?: unknown; message?: unknown };
    if (typeof r.detail === "string") return r.detail;
    if (typeof r.message === "string") return r.message;
  }
  return "untyped refusal";
}

function classifyRefusal(raw: unknown): RefusalCause {
  if (typeof raw === "object" && raw !== null && "class" in raw) {
    const c = (raw as { class?: unknown }).class;
    if (c === "STALE_VERSION" || c === "HYPERPLANE_BREACH" || c === "WORKER_REFUSED") {
      return c;
    }
    return "BREACH";
  }
  const kind = typeof raw === "object" && raw !== null && "kind" in raw
    ? (raw as { kind?: unknown }).kind
    : undefined;
  switch (kind) {
    case "StaleVersionError": return "STALE_VERSION";
    case "RepopNotBootedError": return "KERNEL_UNREADY";
    case "UnknownFrameError": return "UNKNOWN_FRAME";
    case "TimeoutError": return "TIMEOUT";
    case "BreachError": return "BREACH";
    default: return "BREACH";
  }
}

export function containRefusal(raw: unknown, entityKey: string): ContainedRefusal {
  const cause = classifyRefusal(raw);
  return {
    seq: nextSeq(),
    cause,
    containment: CAUSE_CONTAINMENT[cause],
    entityKey,
    detail: detailOf(raw),
    at: Date.now(),
    retryable: cause === "STALE_VERSION" || cause === "KERNEL_UNREADY",
  };
}

export interface RepopClientSeam {
  send(
    entityKey: string,
    intent: RepopIntent,
    expectedVersion: number,
  ): Promise<
    | { ok: true; newVersion: number }
    | { ok: false; refusal: ContainedRefusal }
  >;
  subscribe(onChange: () => void): () => void;
  getSnapshot(): RepopSnapshot;
  setUnhandledRefusalSink(
    sink: ((refusal: ContainedRefusal) => void) | null,
  ): () => void;
  isReady(): boolean;
}

export function createClientSeam(client: RepopClient | undefined): RepopClientSeam {
  if (client === undefined) {
    const notReady = (entityKey: string): ContainedRefusal => ({
      seq: nextSeq(),
      cause: "KERNEL_UNREADY",
      containment: "inline",
      entityKey,
      detail: "no client injected (SSR or pre-boot)",
      at: Date.now(),
      retryable: true,
    });
    return {
      send: async (entityKey) => ({ ok: false as const, refusal: notReady(entityKey) }),
      subscribe: () => () => undefined,
      getSnapshot: () => EMPTY,
      setUnhandledRefusalSink: () => () => undefined,
      isReady: () => false,
    };
  }
  let unhandledSink: ((refusal: ContainedRefusal) => void) | null = null;
  const seam: RepopClientSeam = {
    send: async (entityKey, intent, expectedVersion) => {
      try {
        const outcome = await client.commitIntent(entityKey, intent, expectedVersion);
        if (outcome.ok) return { ok: true as const, newVersion: outcome.newVersion };
        return { ok: false as const, refusal: containRefusal(outcome.refusal, entityKey) };
      } catch (err) {
        const refusal = containRefusal(
          { kind: err instanceof Error ? err.name : "", message: String(err) },
          entityKey,
        );
        unhandledSink?.(refusal);
        return { ok: false as const, refusal };
      }
    },
    subscribe: (onChange) => client.subscribe(onChange),
    getSnapshot: () => client.getSnapshot(),
    setUnhandledRefusalSink: (sink) => {
      unhandledSink = sink;
      return () => {
        if (unhandledSink === sink) unhandledSink = null;
      };
    },
    isReady: () => {
      try {
        return client.getSnapshot().status === "ready";
      } catch {
        return false;
      }
    },
  };
  return seam;
}
