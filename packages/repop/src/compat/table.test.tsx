import { describe, it, expect } from "vitest";
import { act, render } from "@testing-library/react";
import { RepopProvider } from "../RepopProvider.js";
import { TestRepopClient } from "../test-support/testClient.js";
import { useTable, type ColumnDef, type UseTableResult } from "./table.js";

interface Row {
  name: string;
  qty: number;
}
const columns: ColumnDef<Row>[] = [
  { id: "name", header: "Name", accessor: (r) => r.name },
  { id: "qty", header: "Qty", accessor: (r) => r.qty },
];

describe("compat table", () => {
  it("renders rows from the projection store and sorts", async () => {
    const client = new TestRepopClient();
    client.putEntity("rows", 1, [
      { name: "b", qty: 2 },
      { name: "a", qty: 9 },
    ]);
    let t: UseTableResult<Row> | undefined;
    function C(): React.ReactNode {
      t = useTable<Row>({ entityId: "rows", columns });
      return null;
    }
    render(
      <RepopProvider client={client}>
        <C />
      </RepopProvider>,
    );
    expect(t?.rows.map((r) => r.original.name)).toEqual(["b", "a"]);
    await act(async () => {
      t?.toggleSort("name");
    });
    expect(t?.rows.map((r) => r.original.name)).toEqual(["a", "b"]);
    await act(async () => {
      client.putEntity("rows", 2, [{ name: "z", qty: 1 }]);
    });
    expect(t?.rows).toHaveLength(1);
    expect(t?.headers).toEqual(["Name", "Qty"]);
  });
});
