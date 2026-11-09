/**
 * RepopContext — `undefined`-defaulted React context (fail-closed guard law,
 * P11 decision 5). Consumers go through `useRepopClient`, which throws a
 * typed error when no provider sits above them; no hook silently defaults.
 */

import { createContext } from "react";
import type { RepopContextValue } from "./RepopProvider.js";

export const RepopContext = createContext<RepopContextValue | undefined>(
  undefined,
);
RepopContext.displayName = "RepopContext";
