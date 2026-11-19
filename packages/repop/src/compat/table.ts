/**
 * compat/table: @fnox/table shim. Headless table whose rows are the array in
 * the repop entity slice `entityId`. Read-only; sorting is local view state.
 */

import { useMemo, useState } from "react";
import { useRepopSelector } from "../useRepopSelector.js";

export interface ColumnDef<R> {
  id: string;
  header: string;
  accessor: (row: R) => unknown;
}

export interface TableRow<R> {
  index: number;
  original: R;
  cells: { columnId: string; value: unknown }[];
}

export interface SortingState {
  columnId: string;
  desc: boolean;
}

export interface UseTableResult<R> {
  rows: TableRow<R>[];
  headers: string[];
  sorting: SortingState | null;
  toggleSort: (columnId: string) => void;
}

export function useTable<R>(options: {
  entityId: string;
  columns: ColumnDef<R>[];
}): UseTableResult<R> {
  const slice = useRepopSelector((s) => s.entities.get(options.entityId));
  const [sorting, setSorting] = useState<SortingState | null>(null);
  const data = slice?.data;

  const rows = useMemo(() => {
    const src: R[] = Array.isArray(data) ? (data as R[]) : [];
    let list = src.map((original, index) => ({ original, index }));
    if (sorting !== null) {
      const col = options.columns.find((c) => c.id === sorting.columnId);
      if (col !== undefined) {
        const dir = sorting.desc ? -1 : 1;
        list = [...list].sort((a, b) => {
          const x = col.accessor(a.original) as number | string;
          const y = col.accessor(b.original) as number | string;
          return x < y ? -dir : x > y ? dir : 0;
        });
      }
    }
    return list.map<TableRow<R>>(({ original, index }) => ({
      index,
      original,
      cells: options.columns.map((c) => ({ columnId: c.id, value: c.accessor(original) })),
    }));
  }, [data, sorting, options.columns]);

  return {
    rows,
    headers: options.columns.map((c) => c.header),
    sorting,
    toggleSort: (columnId) =>
      setSorting((p) =>
        p !== null && p.columnId === columnId
          ? { columnId, desc: !p.desc }
          : { columnId, desc: false },
      ),
  };
}
