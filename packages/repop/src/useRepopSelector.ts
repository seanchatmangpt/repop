/**
 * useRepopSelector — useSyncExternalStore binding.
 *
 * - explicit getServerSnapshot returning the stable EMPTY fallback (SSR law);
 * - dev-mode Object.is re-render warning (selector must return a
 *   referentially stable slice, else uSES re-renders loop — warn in dev).
 */

import { useContext, useSyncExternalStore } from "react";
import { RepopContext } from "./context.js";
import { EMPTY, type RepopSnapshot } from "./types.js";
import { RepopProviderMissingError } from "./useRepopClient.js";

export interface RepopSelectorOptions {
  /** Disable the dev-mode selector-stability warning. */
  suppressStabilityWarning?: boolean;
}

/**
 * Subscribe to the repop store through a selector. The selector returns a
 * slice of the snapshot; its identity stability is the caller's law.
 */
export function useRepopSelector<T>(
  selector: (snapshot: RepopSnapshot) => T,
  options?: RepopSelectorOptions,
): T {
  const value = useContext(RepopContext);
  if (value === undefined) {
    throw new RepopProviderMissingError();
  }
  const client = value.client;

  const subscribe = client.subscribe.bind(client);
  const getSnapshot = client.getSnapshot.bind(client);

  const selected = useSyncExternalStore(
    subscribe,
    (): T => selector(getSnapshot()),
    (): T => selector(EMPTY),
  );

  if (
    process.env.NODE_ENV !== "production" &&
    options?.suppressStabilityWarning !== true
  ) {
    const before = selector(getSnapshot());
    const after = selector(getSnapshot());
    if (!Object.is(before, after)) {
      console.warn(
        "repop useRepopSelector: selector returned a new identity for two consecutive reads of the same snapshot — return a referentially stable slice (Object.is).",
      );
    }
  }

  return selected;
}
