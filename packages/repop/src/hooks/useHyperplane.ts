/**
 * useHyperplane — memoized solver pre-flight.
 *
 * - `register` + `point` go through a useMemo'd pre-flight so stable inputs
 *   never re-invoke the solver (memo identity law, dispatch).
 * - If the client snapshot carries a `solverMirror`, its result is consumed
 *   (`source: "mirror"`). Otherwise a LOCAL PURE EVAL runs and is marked
 *   `verified: false` — UNVERIFIED vs kernel parity until a differential
 *   court (P5) proves mirror==kernel.
 * - No solver mirror and a degenerate normal (all-zero) => typed
 *   HYPERPLANE_BREACH refusal return, never a throw.
 */

import { useMemo } from "react";
import { useRepopClient } from "../useRepopClient.js";
import type {
  RepopSolveRequest,
  RepopSolveResult,
} from "../types.js";

export interface UseHyperplaneResult {
  /** Memoized pre-flight result; identity stable for stable inputs. */
  readonly result: RepopSolveResult;
}

function isDegenerate(normal: readonly number[]): boolean {
  let sum = 0;
  for (const c of normal) sum += c * c;
  return sum === 0;
}

/** Local pure half-space eval — UNVERIFIED vs kernel parity by construction. */
function localSolve(request: RepopSolveRequest): RepopSolveResult {
  if (isDegenerate(request.register.normal)) {
    return {
      ok: false,
      refusal: {
        class: "HYPERPLANE_BREACH",
        registerId: "local",
        distance: 0,
      },
    };
  }
  let distance = -request.register.offset;
  for (let i = 0; i < request.register.normal.length; i += 1) {
    distance += request.register.normal[i]! * (request.point[i] ?? 0);
  }
  return {
    ok: true,
    side: distance >= 0 ? 1 : 0,
    distance,
    source: "local",
    verified: false,
  };
}

export function useHyperplane(
  register: RepopSolveRequest["register"],
  point: RepopSolveRequest["point"],
): UseHyperplaneResult {
  const client = useRepopClient();

  const result = useMemo<RepopSolveResult>(() => {
    const request: RepopSolveRequest = { register, point };
    const snapshot = client.getSnapshot();
    const mirror = (snapshot as { solverMirror?: unknown }).solverMirror;
    if (
      mirror !== undefined &&
      mirror !== null &&
      typeof mirror === "object" &&
      "solve" in mirror &&
      typeof (mirror as { solve: unknown }).solve === "function"
    ) {
      return (mirror as { solve(req: RepopSolveRequest): RepopSolveResult }).solve(request);
    }
    return localSolve(request);
  }, [client, register, point]);

  return { result };
}
