/**
 * Transport decision — pure function over CoiStatus + reload-guard state.
 *
 * Decision table (P7 plan):
 *   SAB constructible                -> SAB transport
 *   no SAB, guard spent              -> postMessage fallback (loop guard)
 *   no SAB, SW available, guard free -> one reload then re-probe
 *   no SAB, no SW, guard free        -> postMessage fallback
 */

export type Transport = "sab" | "fallback" | "reload-and-reprobe";

export interface TransportDecisionInput {
  readonly sabConstructible: boolean;
  readonly serviceWorkerSupported: boolean;
  /** True once the one-shot reload has already fired in this session. */
  readonly reloadGuardSpent: boolean;
}

/** Pure, total, side-effect-free — table-testable without any browser. */
export function decideTransport(input: TransportDecisionInput): Transport {
  if (input.sabConstructible) return "sab";
  if (!input.serviceWorkerSupported) return "fallback";
  if (input.reloadGuardSpent) return "fallback";
  return "reload-and-reprobe";
}
