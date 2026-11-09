/**
 * Guard-throw hook (P11 decision 5): reads RepopContext and THROWS a typed
 * RepopProviderMissingError when no provider is above the caller. Never a
 * silent default client — fail-closed.
 */

import { useContext } from "react";
import { RepopContext } from "./context.js";
import type { RepopClient } from "./types.js";

/** Typed error thrown when useRepopClient runs without a provider above it. */
export class RepopProviderMissingError extends Error {
  constructor() {
    super(
      "repop: no RepopProvider above this component — wrap the tree in <RepopProvider> (or inject a client via its props).",
    );
    this.name = "RepopProviderMissingError";
  }
}

/** Guard-throw client accessor. Throws RepopProviderMissingError, never returns a default. */
export function useRepopClient(): RepopClient {
  const value = useContext(RepopContext);
  if (value === undefined) {
    throw new RepopProviderMissingError();
  }
  return value.client;
}
