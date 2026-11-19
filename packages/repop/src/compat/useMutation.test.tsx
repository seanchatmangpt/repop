import { describe, it, expect } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { RepopProvider } from "../RepopProvider.js";
import { TestRepopClient } from "../test-support/testClient.js";
import { useQuery, queryEntityId, type UseQueryResult } from "./useQuery.js";
import { useMutation, type UseMutationResult } from "./useMutation.js";

const KEY = ["platform", "things", "list", {}] as const;

describe("compat useMutation", () => {
  it("mutate updates store and query rerenders", async () => {
    const client = new TestRepopClient();
    client.putEntity(queryEntityId(KEY), 1, ["a"]);
    let q: UseQueryResult<unknown> | undefined;
    let m: UseMutationResult<string, string> | undefined;
    function Probe(): React.ReactNode {
      q = useQuery({ queryKey: KEY, queryFn: async () => ["unused"] });
      m = useMutation<string, string>({
        mutationFn: async (item) => {
          const cur = (q?.data as string[]) ?? [];
          client.putEntity(queryEntityId(KEY), 2, [...cur, item]);
          return item;
        },
      });
      return null;
    }
    render(
      <RepopProvider client={client}>
        <Probe />
      </RepopProvider>,
    );
    expect(q?.data).toEqual(["a"]);
    expect(m?.isIdle).toBe(true);
    await act(async () => {
      m?.mutate("b");
    });
    await waitFor(() => expect(q?.data).toEqual(["a", "b"]));
    expect(m?.isSuccess).toBe(true);
    expect(m?.data).toBe("b");
  });

  it("reports mutationFn failure as error state", async () => {
    const client = new TestRepopClient();
    let m: UseMutationResult<string, void> | undefined;
    function Probe(): React.ReactNode {
      m = useMutation<string, void>({
        mutationFn: async () => {
          throw new Error("nope");
        },
      });
      return null;
    }
    render(
      <RepopProvider client={client}>
        <Probe />
      </RepopProvider>,
    );
    await act(async () => {
      m?.mutate();
    });
    await waitFor(() => expect(m?.isError).toBe(true));
    expect((m?.error as Error).message).toBe("nope");
  });
});
