import { describe, it, expect } from "vitest";
import { act, render } from "@testing-library/react";
import { RepopProvider } from "../RepopProvider.js";
import { TestRepopClient } from "../test-support/testClient.js";
import { createDbClient, useDbRow } from "./dbClient.js";

describe("compat db-client", () => {
  it("get/list read the real store and writes are refused", () => {
    const client = new TestRepopClient();
    client.putEntity("user:1", 1, { n: "a" });
    client.putEntity("user:2", 1, { n: "b" });
    client.putEntity("task:1", 1, { n: "c" });
    const db = createDbClient(client);
    expect(db.get("user:1")?.data).toEqual({ n: "a" });
    expect(db.list("user:").map((r) => r.id)).toEqual(["user:1", "user:2"]);
    expect(() => db.insert()).toThrow(/read-only/);
  });

  it("useDbRow rerenders only for its own row", async () => {
    const client = new TestRepopClient();
    client.putEntity("a", 1, { n: 1 });
    client.putEntity("b", 1, { n: 1 });
    let renders = 0;
    let seen: unknown;
    function C(): React.ReactNode {
      seen = useDbRow("a")?.data;
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
      client.putEntity("a", 2, { n: 7 });
    });
    expect(seen).toEqual({ n: 7 });
  });
});
