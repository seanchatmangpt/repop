import { describe, it, expect } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { RepopProvider } from "../RepopProvider.js";
import { TestRepopClient } from "../test-support/testClient.js";
import { useQuery, queryEntityId, type UseQueryResult } from "./useQuery.js";

const KEY = ["platform", "things", "list", {}] as const;

function Probe(props: {
  fn: () => Promise<unknown>;
  onResult: (r: UseQueryResult<unknown>) => void;
}): React.ReactNode {
  const r = useQuery({ queryKey: KEY, queryFn: props.fn });
  props.onResult(r);
  return null;
}

describe("compat useQuery", () => {
  it("rerenders with new data after store update", async () => {
    const client = new TestRepopClient();
    let last: UseQueryResult<unknown> | undefined;
    client.putEntity(queryEntityId(KEY), 1, ["a"]);
    render(
      <RepopProvider client={client}>
        <Probe fn={async () => ["fetched"]} onResult={(r) => (last = r)} />
      </RepopProvider>,
    );
    expect(last?.data).toEqual(["a"]);
    await act(async () => {
      client.putEntity(queryEntityId(KEY), 2, ["a", "b"]);
    });
    expect(last?.data).toEqual(["a", "b"]);
    expect(last?.isSuccess).toBe(true);
  });

  it("exposes data/error/isLoading/isError/refetch", async () => {
    const client = new TestRepopClient();
    let last: UseQueryResult<unknown> | undefined;
    render(
      <RepopProvider client={client}>
        <Probe fn={async () => ({ ok: 1 })} onResult={(r) => (last = r)} />
      </RepopProvider>,
    );
    for (const k of ["data", "error", "isLoading", "isError", "refetch"]) {
      expect(last).toHaveProperty(k);
    }
    expect(typeof last?.refetch).toBe("function");
    await waitFor(() => expect(last?.data).toEqual({ ok: 1 }));
    expect(last?.isError).toBe(false);
    expect(last?.isLoading).toBe(false);
  });

  it("surfaces queryFn failure as error and recovers on refetch", async () => {
    const client = new TestRepopClient();
    let last: UseQueryResult<unknown> | undefined;
    let attempt = 0;
    render(
      <RepopProvider client={client}>
        <Probe
          fn={async () => {
            attempt += 1;
            if (attempt === 1) throw new Error("boom");
            return "fine";
          }}
          onResult={(r) => (last = r)}
        />
      </RepopProvider>,
    );
    await waitFor(() => expect(last?.isError).toBe(true));
    await act(async () => {
      await last?.refetch();
    });
    await waitFor(() => expect(last?.data).toBe("fine"));
    expect(last?.isError).toBe(false);
  });
});
