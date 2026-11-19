import { describe, it, expect } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { RepopProvider } from "../RepopProvider.js";
import { TestRepopClient } from "../test-support/testClient.js";
import useSWR, { mutate, swrEntityId, type SWRResponse } from "./useSWR.js";

describe("compat useSWR", () => {
  it("mutate(key) revalidates and returns fresh data", async () => {
    const client = new TestRepopClient();
    let last: SWRResponse<number> | undefined;
    let n = 0;
    const fetcher = async (): Promise<number> => {
      n += 1;
      return n;
    };
    function C(): React.ReactNode {
      last = useSWR<number>("/things", fetcher);
      return null;
    }
    render(
      <RepopProvider client={client}>
        <C />
      </RepopProvider>,
    );
    await waitFor(() => expect(last?.data).toBe(1));
    let fresh: number | undefined;
    await act(async () => {
      fresh = await mutate<number>("/things");
    });
    expect(fresh).toBe(2);
    expect(last?.data).toBe(2);
  });

  it("seeds from the repop store slice before first fetch", async () => {
    const client = new TestRepopClient();
    client.putEntity(swrEntityId("/seeded"), 1, "seed");
    let last: SWRResponse<string> | undefined;
    function C(): React.ReactNode {
      last = useSWR<string>("/seeded", () => new Promise<string>(() => {}));
      return null;
    }
    render(
      <RepopProvider client={client}>
        <C />
      </RepopProvider>,
    );
    expect(last?.data).toBe("seed");
  });

  it("surfaces fetcher error and null key skips fetch", async () => {
    const client = new TestRepopClient();
    let last: SWRResponse<string> | undefined;
    let nullCalls = 0;
    function C(): React.ReactNode {
      last = useSWR<string>("/bad", () => {
        throw new Error("boom");
      });
      useSWR<string>(null, () => {
        nullCalls += 1;
        return "x";
      });
      return null;
    }
    render(
      <RepopProvider client={client}>
        <C />
      </RepopProvider>,
    );
    await waitFor(() => expect(last?.error).toBeInstanceOf(Error));
    expect(nullCalls).toBe(0);
  });
});
