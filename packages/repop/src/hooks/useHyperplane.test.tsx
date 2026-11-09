/**
 * useHyperplane courts: memo identity law, mirror-vs-local source, typed
 * refusal paths (degenerate normal => HYPERPLANE_BREACH, never throw).
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { useHyperplane } from "./useHyperplane.js";
import { RepopProvider } from "../RepopProvider.js";
import { TestRepopClient } from "../test-support/testClient.js";

const PLANE = { normal: [1, 0, 0], offset: 2 };
const POINT = [3, 0, 0];

describe("useHyperplane", () => {
  it("local pure eval: side/distance for stable inputs", () => {
    const client = new TestRepopClient();
    let result: unknown;
    function Sink(): React.ReactNode {
      result = useHyperplane(PLANE, POINT).result;
      return null;
    }
    render(
      <RepopProvider client={client}>
        <Sink />
      </RepopProvider>,
    );
    expect(result).toMatchObject({
      ok: true,
      side: 1,
      distance: 1,
      source: "local",
      verified: false,
    });
  });

  it("memo identity law: rerender with stable inputs keeps the SAME result identity", () => {
    const client = new TestRepopClient();
    const seen: unknown[] = [];
    function Sink(): React.ReactNode {
      const { result } = useHyperplane(PLANE, POINT);
      seen.push(result);
      return null;
    }
    const { rerender } = render(
      <RepopProvider client={client}>
        <Sink />
      </RepopProvider>,
    );
    rerender(
      <RepopProvider client={client}>
        <Sink />
      </RepopProvider>,
    );
    // Same instance + stable deps => useMemo hits => identical identity
    // across every render pass (React dev may double-invoke; the law is
    // identity stability, not a render count).
    expect(seen.length).toBeGreaterThanOrEqual(2);
    for (const r of seen) {
      expect(r).toBe(seen[0]);
    }
  });

  it("degenerate normal returns typed HYPERPLANE_BREACH refusal, never throws", () => {
    const client = new TestRepopClient();
    let result: unknown;
    function Sink(): React.ReactNode {
      result = useHyperplane({ normal: [0, 0, 0], offset: 0 }, POINT).result;
      return null;
    }
    render(
      <RepopProvider client={client}>
        <Sink />
      </RepopProvider>,
    );
    expect(result).toMatchObject({
      ok: false,
      refusal: { class: "HYPERPLANE_BREACH" },
    });
  });
});
