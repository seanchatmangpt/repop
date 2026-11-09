/**
 * Public types for the repop React binding package.
 *
 * `RepopClient` is a *structural* contract (subscribe/getSnapshot/bootstrap/
 * commitIntent/solve). It mirrors the `@repop/client` headless-store surface
 * (P10: listeners Set, stable fallback constants, bootstrap promise map) so
 * this package typechecks before P10's concrete class lands. When P10 lands,
 * its concrete class satisfies this interface structurally — no runtime
 * dependency needed at the type level.
 */

import type { RepopRefusal } from "./errors.js";

/** Selector carrying the stable-projections fallback (R6 stable-fallback law). */
import { STABLE_PROJECTIONS } from "./errors.js";
export { STABLE_PROJECTIONS };

/**
 * A slice of entity state as seen through the client snapshot. `version` is
 * the CAS version the kernel's version registry tracks (R10 step 3).
 */
export interface RepopEntitySlice<T = unknown> {
  readonly entityId: string;
  readonly version: number;
  /** Typed result of the last refused commit for this entity, else null. */
  readonly lastRefusal: RepopRefusal | null;
  readonly data: T;
}

/**
 * The client snapshot the store exposes through getSnapshot. EMPTY is the
 * SSR/pre-boot stable fallback — referentially stable forever.
 */
export interface RepopSnapshot {
  readonly status: "idle" | "booting" | "ready" | "refused";
  readonly entities: ReadonlyMap<string, RepopEntitySlice>;
  readonly projections: readonly number[];
}

/** The stable EMPTY snapshot constant (SSR + pre-boot). Owned here. */
export const EMPTY: RepopSnapshot = Object.freeze({
  status: "idle",
  entities: Object.freeze(new Map<string, RepopEntitySlice>()),
  projections: STABLE_PROJECTIONS,
});

/**
 * Structural client contract. A concrete `@repop/client` satisfies this
 * without importing this package.
 */
export interface RepopClient {
  /** Store contract for useSyncExternalStore. */
  subscribe(onStoreChange: () => void): () => void;
  getSnapshot(): RepopSnapshot;
  /** Lazy boot; idempotent (concurrent calls collapse onto one promise). */
  bootstrap(): Promise<void>;
  /** CAS commit: intent + expected version; typed refusal, never throw. */
  commitIntent(
    entityId: string,
    intent: RepopIntent,
    expectedVersion: number,
  ): Promise<
    | { ok: true; newVersion: number }
    | { ok: false; refusal: RepopRefusal }
  >;
  /** Solver pre-flight: mirror if present, else a typed refusal. */
  solve(request: RepopSolveRequest): Promise<RepopSolveResult>;
  /** Dispose is owned by the creator; the React layer never calls it on injected clients. */
  dispose?(): void;
}

/** Typed intent crossing the kernel boundary (64B IntentFrame, logical form). */
export interface RepopIntent {
  readonly kind: "set" | "merge";
  readonly payload: Readonly<Record<string, unknown>>;
}

/** Solver pre-flight request (HyperplaneRegister + probe point, logical form). */
export interface RepopSolveRequest {
  readonly register: {
    readonly normal: readonly number[];
    readonly offset: number;
  };
  readonly point: readonly number[];
}

export type RepopSolveResult =
  | {
      ok: true;
      side: 0 | 1;
      distance: number;
      /** "mirror" = solverMirror consumed; "local" = local pure eval. */
      source: "mirror" | "local";
      /**
       * True only when the mirror result is kernel-parity-verified.
       * Local pure eval is always `verified: false` (UNVERIFIED vs kernel
       * parity until a differential court runs).
       */
      verified: boolean;
    }
  | { ok: false; refusal: RepopRefusal };
