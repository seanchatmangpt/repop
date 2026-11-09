/**
 * useCgapEntity — entity slice subscription + CAS commitIntent.
 *
 * - Returns the entity slice from the current snapshot plus a `commit`
 *   function that performs CAS from the CURRENT observed version.
 * - STALE_VERSION / HYPERPLANE_BREACH / WORKER_REFUSED are TYPED RETURNS,
 *   never throws (dispatch law).
 */

import { useCallback } from "react";
import { useRepopClient } from "../useRepopClient.js";
import { useRepopSelector } from "../useRepopSelector.js";
import type { RepopEntitySlice, RepopIntent } from "../types.js";

export interface RepopCommitResult {
  ok: true;
  newVersion: number;
}
export type RepopCommitRefused = {
  ok: false;
  refusal: import("../errors.js").RepopRefusal;
};

const MISSING_SLICE_UNKNOWN: RepopEntitySlice<undefined> = Object.freeze({
  entityId: "",
  version: 0,
  lastRefusal: null,
  data: undefined,
});
const MISSING_SLICE = MISSING_SLICE_UNKNOWN as unknown as RepopEntitySlice<never>;

export interface UseCgapEntityResult<T> {
  /** The entity slice; a stable missing-slice constant when absent. */
  readonly slice: RepopEntitySlice<T>;
  /**
   * CAS commit from the CURRENT observed version at call time. Resolves to
   * a typed result; STALE/BREACH refusals are returned, never thrown.
   */
  readonly commit: (
    intent: RepopIntent,
  ) => Promise<RepopCommitResult | RepopCommitRefused>;
}

export function useCgapEntity<T = unknown>(entityId: string): UseCgapEntityResult<T> {
  const client = useRepopClient();

  const slice = useRepopSelector((snapshot) => {
    const found = snapshot.entities.get(entityId);
    return (found ?? MISSING_SLICE) as RepopEntitySlice<T>;
  });

  const commit = useCallback(
    async (intent: RepopIntent): Promise<RepopCommitResult | RepopCommitRefused> => {
      const current = client.getSnapshot().entities.get(entityId);
      const expectedVersion = current === undefined ? 0 : current.version;
      return client.commitIntent(entityId, intent, expectedVersion);
    },
    [client, entityId],
  );

  return { slice, commit };
}
