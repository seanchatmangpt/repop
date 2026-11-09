/**
 * Typed, fail-closed refusals for the repop React layer.
 *
 * Mirrors the kernel `AbiError` class law (kernel/crates/repop-abi: typed
 * refusal unions, never silent). STABLE_* / EMPTY constants are the
 * referentially stable fallbacks the SSR/pre-boot path returns (R6
 * stable-fallback law, tableFilterStore.ts:9-17 pattern).
 */

/**
 * Refusal union crossing the React layer — returned, never thrown, for
 * STALE/BREACH/WORKER refusal classes (dispatch law: "typed refusal returns
 * never throws for STALE/BREACH").
 */
export type RepopRefusal =
  | {
      /** CAS expected-version miss. */
      class: "STALE_VERSION";
      /** Version the caller committed against. */
      expected: number;
      /** Version the registry currently holds. */
      observed: number;
    }
  | {
      /** Point violates the pinned hyperplane half-space. */
      class: "HYPERPLANE_BREACH";
      /** Identifier of the violated register. */
      registerId: string;
      /** Signed distance from the plane at refusal time. */
      distance: number;
    }
  | {
      /** Worker/client-side refusal with a human-readable detail. */
      class: "WORKER_REFUSED";
      detail: string;
    };

/** Stable null constant for SSR/pre-boot (never re-derive per render). */
export const STABLE_NULL: unique symbol = Symbol("repop.stable-null");
type StableNull = typeof STABLE_NULL;
export type MaybeStableNull<T> = T | StableNull;

/**
 * Stable empty projections constant — referentially stable forever.
 * Returned by SSR and pre-boot snapshots so selector results are stable
 * across hydration.
 */
export const STABLE_PROJECTIONS: readonly number[] = Object.freeze([]);
