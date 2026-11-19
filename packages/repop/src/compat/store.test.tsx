import { describe, it, expect } from "vitest";
import { act, render } from "@testing-library/react";
import { RepopProvider } from "../RepopProvider.js";
import { TestRepopClient } from "../test-support/testClient.js";
import { create, useRepopSlice } from "./store.js";

interface S {
  count: number;
  other: number;
  inc: () => void;
  bump: () => void;
}

describe("compat store", () => {
  it("selector does not rerender on unrelated change", async () => {
    const useStore = create<S>((set) => ({
      count: 0,
      other: 0,
      inc: () => set((s) => ({ count: s.count + 1 })),
      bump: () => set((s) => ({ other: s.other + 1 })),
    }));
    let renders = 0;
    let seen = -1;
    function C(): React.ReactNode {
      const count = useStore((s) => s.count);
      renders += 1;
      seen = count;
      return null;
    }
    render(<C />);
    await act(async () => {});
    const base = renders;
    await act(async () => {
      useStore.getState().bump();
      useStore.getState().bump();
    });
    expect(renders).toBe(base);
    await act(async () => {
      useStore.getState().inc();
    });
    expect(seen).toBe(1);
    expect(renders).toBe(base + 1);
  });

  it("repop slice selector does not rerender on unrelated entity change", async () => {
    const client = new TestRepopClient();
    client.putEntity("a", 1, { n: 1 });
    client.putEntity("b", 1, { n: 1 });
    let renders = 0;
    let seen: number | undefined;
    function C(): React.ReactNode {
      seen = useRepopSlice<{ n: number }, number | undefined>("a", (d) => d?.n);
      renders += 1;
      return null;
    }
    render(
      <RepopProvider client={client}>
        <C />
      </RepopProvider>,
    );
    await act(async () => {});
    const base = renders;
    await act(async () => {
      client.putEntity("b", 2, { n: 2 });
    });
    expect(renders).toBe(base);
    await act(async () => {
      client.putEntity("a", 2, { n: 5 });
    });
    expect(seen).toBe(5);
  });
});
