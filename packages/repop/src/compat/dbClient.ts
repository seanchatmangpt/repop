/**
 * compat/dbClient: read-only table-style access (get / list / subscribe)
 * over a real RepopClient snapshot. Writes are refused; there is no
 * connection to a database. Identity: repop/compat (see FFB-IDENTITY-FORK.md).
 */

import { useRepopClient } from "../useRepopClient.js";
import { useRepopSelector } from "../useRepopSelector.js";
import type { RepopClient } from "../types.js";

export interface DbRow {
  id: string;
  version: number;
  data: unknown;
}

export interface DbClient {
  get(id: string): DbRow | undefined;
  list(prefix?: string): DbRow[];
  subscribe(listener: () => void): () => void;
  insert(): never;
  update(): never;
  delete(): never;
}

const refuse = (): never => {
  throw new Error("repop/compat dbClient: read-only shim, writes are refused");
};

export function createDbClient(client: RepopClient): DbClient {
  const toRow = (id: string): DbRow | undefined => {
    const s = client.getSnapshot().entities.get(id);
    return s === undefined ? undefined : { id, version: s.version, data: s.data };
  };
  return {
    get: toRow,
    list(prefix = "") {
      const out: DbRow[] = [];
      for (const id of client.getSnapshot().entities.keys()) {
        if (id.startsWith(prefix)) {
          const r = toRow(id);
          if (r !== undefined) out.push(r);
        }
      }
      return out;
    },
    subscribe: (l) => client.subscribe(l),
    insert: refuse,
    update: refuse,
    delete: refuse,
  };
}

/** Hook: DbClient bound to the provider's client. */
export function useDbClient(): DbClient {
  return createDbClient(useRepopClient());
}

/** Hook: one row, re-rendering only when that entity slice changes. */
export function useDbRow(id: string): DbRow | undefined {
  const slice = useRepopSelector((s) => s.entities.get(id));
  return slice === undefined
    ? undefined
    : { id, version: slice.version, data: slice.data };
}
