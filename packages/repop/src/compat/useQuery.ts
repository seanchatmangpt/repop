/**
 * compat/useQuery: react-query-shaped result over the repop selector client.
 * Not a wrapper over any third-party query library.
 * Identity: repop/compat (see FFB-IDENTITY-FORK.md).
 *
 * Source of truth is the repop store: the entity slice keyed by
 * queryEntityId(queryKey). When no slice exists the queryFn result is held
 * as a local fallback and is replaced as soon as a store slice appears.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRepopSelector } from "../useRepopSelector.js";
import type { RepopEntitySlice } from "../types.js";

export type QueryKey = readonly unknown[];

export interface UseQueryOptions<T> {
  queryKey: QueryKey;
  queryFn: () => Promise<T> | T;
  enabled?: boolean;
}

export type QueryStatus = "pending" | "error" | "success";

export interface UseQueryResult<T> {
  data: T | undefined;
  error: unknown;
  isLoading: boolean;
  isFetching: boolean;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  status: QueryStatus;
  refetch: () => Promise<UseQueryResult<T>>;
}

/** Deterministic entity id for a query key. */
export function queryEntityId(queryKey: QueryKey): string {
  return "query:" + JSON.stringify(queryKey);
}

interface Local<T> {
  data: T | undefined;
  error: unknown;
  fetching: boolean;
  settled: boolean;
}

function build<T>(
  slice: RepopEntitySlice | undefined,
  local: Local<T>,
  refetch: () => Promise<UseQueryResult<T>>,
): UseQueryResult<T> {
  const sliceError = slice?.lastRefusal ?? null;
  const hasStoreData = slice !== undefined && slice.data !== null && slice.data !== undefined;
  const data = hasStoreData ? (slice.data as T) : local.data;
  const error = sliceError ?? local.error ?? null;
  const isError = error !== null;
  const isSuccess = !isError && (hasStoreData || (local.settled && local.data !== undefined));
  const status: QueryStatus = isError ? "error" : isSuccess ? "success" : "pending";
  return {
    data,
    error,
    isLoading: status === "pending" && local.fetching,
    isFetching: local.fetching,
    isPending: status === "pending",
    isError,
    isSuccess,
    status,
    refetch,
  };
}

export function useQuery<T = unknown>(options: UseQueryOptions<T>): UseQueryResult<T> {
  const entityId = queryEntityId(options.queryKey);
  const enabled = options.enabled !== false;
  const slice = useRepopSelector((s) => s.entities.get(entityId));

  const fnRef = useRef(options.queryFn);
  fnRef.current = options.queryFn;

  const [local, setLocal] = useState<Local<T>>({
    data: undefined,
    error: null,
    fetching: false,
    settled: false,
  });
  const localRef = useRef(local);
  localRef.current = local;

  const run = useCallback(async (): Promise<Local<T>> => {
    setLocal((p) => ({ ...p, fetching: true }));
    let next: Local<T>;
    try {
      const data = await fnRef.current();
      next = { data, error: null, fetching: false, settled: true };
    } catch (e) {
      next = { data: undefined, error: e, fetching: false, settled: true };
    }
    setLocal(next);
    return next;
  }, []);

  const sliceRef = useRef(slice);
  sliceRef.current = slice;

  const refetch = useCallback(async (): Promise<UseQueryResult<T>> => {
    const next = await run();
    return build<T>(sliceRef.current, next, refetch);
  }, [run]);

  useEffect(() => {
    if (!enabled) return;
    if (sliceRef.current !== undefined) return;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, enabled, run]);

  return build<T>(slice, local, refetch);
}
