import { describe, it, expect } from "vitest";
import { act, render } from "@testing-library/react";
import { RepopProvider } from "../RepopProvider.js";
import { TestRepopClient } from "../test-support/testClient.js";
import { gql, graphqlEntityId, useGraphQL, useGraphQLMutation } from "./graphql.js";

const Q = gql`
  query Me($id: ID!) { me(id: $id) { name } }
`;

describe("compat graphql", () => {
  it("renders loading then data from the projection store", async () => {
    const client = new TestRepopClient();
    const seen: { loading: boolean; name?: string }[] = [];
    function C(): React.ReactNode {
      const r = useGraphQL<{ me: { name: string } }>(Q, { id: "1" });
      seen.push({ loading: r.loading, name: r.data?.me.name });
      return null;
    }
    render(
      <RepopProvider client={client}>
        <C />
      </RepopProvider>,
    );
    expect(seen[0]?.loading).toBe(true);
    await act(async () => {
      client.putEntity(graphqlEntityId(Q, { id: "1" }), 1, { me: { name: "ada" } });
    });
    const last = seen[seen.length - 1];
    expect(last).toEqual({ loading: false, name: "ada" });
  });

  it("refuses mutations", () => {
    expect(() => useGraphQLMutation()).toThrow(/read-only/);
  });
});
