/**
 * compat/useSWR: swr-shaped useSWR(key, fetcher) over the repop selector client.
 * Not a wrapper over the swr library.
 *
 * - Store slice swrEntityId(key) seeds data until the first fetch settles;
 *   fetched data then takes precedence (so mutate(key) is never stale).
 * - mutate(key) (global) and the bound mutate() revalidate every mounted hook
 *   for that key and resolve with the fresh data.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRepopSelector } from "../useRepopSelector.js";

export type SWRKey = string | readonly unknown[] | null | undefined | false;
export type Fetcher<T> = (key: string) => Promise<T> | T;

export interface SWRResponse<T> {
  data: T | undefined;
  error: unknown;
  isLoading: boolean;
  isValidating: boolean;
  mutate: (data?: T | Promise<T>) => Promise<T | undefined>;
}

export interface SWRConfiguration {
  revalidateOnMount?: boolean;
}

export function serializeKey(key: SWRKey): string | null {
  if (key === null || key === undefined || key === false) return null;
  return typeof key === "string" ? key : JSON.stringify(key);
}

export function swrEntityId(key: SWRKey): string {
  return "swr:" + (serializeKey(key) ?? "");
}

type Revalidator = (override?: unknown) => Promise<unknown>;
const registry = new Map<string, Set<Revalidator>>();

/** Global mutate: revalidate all mounted hooks for key; resolves with fresh data. */
export async function mutate<T = unknown>(
  key: SWRKey,
  data?: T | Promise<T>,
): Promise<T | undefined> {
  const k = serializeKey(key);
  if (k === null) return undefined;
  const set = registry.get(k);
  if (set === undefined || set.size === 0) {
    return data === undefined ? undefined : await data;
  }
  const results = await Promise.all([...set].map((r) => r(data)));
  return results[0] as T | undefined;
}

interface Local<T> {
  data: T | undefined;
  error: unknown;
  validating: boolean;
  settled: boolean;
}

export default function useSWR<T = unknown>(
  key: SWRKey,
  fetcher: Fetcher<T> | null,
  config?: SWRConfiguration,
): SWRResponse<T> {
  const k = serializeKey(key);
  const entityId = swrEntityId(key);
  const seed = useRepopSelector((s) =>
    k === null ? undefined : s.entities.get(entityId)?.data,
  ) as T | undefined;

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [local, setLocal] = useState<Local<T>>({
    data: undefined,
    error: null,
    validating: false,
    settled: false,
  });

  const revalidate = useCallback(
    async (override?: unknown): Promise<T | undefined> => {
      if (k === null) return undefined;
      if (override !== undefined) {
        try {
          const v = (await override) as T;
          setLocal({ data: v, error: null, validating: false, settled: true });
          return v;
        } catch (e) {
          setLocal((p) => ({ ...p, error: e, validating: false, settled: true }));
          return undefined;
        }
      }
      const f = fetcherRef.current;
      if (f === null) return undefined;
      setLocal((p) => ({ ...p, validating: true }));
      try {
        const v = await f(k);
        setLocal({ data: v, error: null, validating: false, settled: true });
        return v;
      } catch (e) {
        setLocal((p) => ({ ...p, error: e, validating: false, settled: true }));
        return undefined;
      }
    },
    [k],
  );

  useEffect(() => {
    if (k === null) return;
    let set = registry.get(k);
    if (set === undefined) {
      set = new Set();
      registry.set(k, set);
    }
    const r: Revalidator = (o) => revalidate(o);
    set.add(r);
    if (config?.revalidateOnMount !== false) void revalidate();
    return () => {
      set.delete(r);
      if (set.size === 0) registry.delete(k);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, revalidate]);

  const data = local.settled && local.data !== undefined ? local.data : seed;
  const error = local.error ?? undefined;
  const boundMutate = useCallback(
    (d?: T | Promise<T>) => revalidate(d),
    [revalidate],
  );

  return {
    data,
    error,
    isLoading: local.validating && data === undefined,
    isValidating: local.validating,
    mutate: boundMutate,
  };
}

export { useSWR };
