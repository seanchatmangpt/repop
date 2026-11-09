/**
 * Selector courts: stable identity, SSR server snapshot fallback,
 * dev-mode Object.is stability warning.
 */

import { describe, it, expect } from "vitest";
import { act, render } from "@testing-library/react";
import { useRepopSelector } from "./useRepopSelector.js";
import { RepopProvider } from "./RepopProvider.js";
import { EMPTY } from "./types.js";
import { TestRepopClient } from "./test-support/testClient.js";

function Sink(props: { onValue: (v: unknown) => void }): React.ReactNode {
  const v = useRepopSelector((s) => s.status);
  props.onValue(v);
  return null;
}

describe("useRepopSelector", () => {
  it("returns the selected slice and updates on store change", async () => {
    const client = new TestRepopClient();
    const seen: unknown[] = [];
    render(
      <RepopProvider client={client}>
        <Sink onValue={(v) => seen.push(v)} />
      </RepopProvider>,
    );
    expect(seen.at(-1)).toBe("idle");
    await act(async () => {
      client.publish({ status: "ready" });
    });
    expect(seen.at(-1)).toBe("ready");
  });

  it("server snapshot: selector receives the stable EMPTY constant", () => {
    const client = new TestRepopClient();
    let received: unknown = undefined;
    function ServerSink(): React.ReactNode {
      const s = useRepopSelector((snap) => snap === EMPTY ? "EMPTY" : "other");
      received = s;
      return null;
    }
    // The SSR path: renderToString must deliver EMPTY identity.
    return import("react-dom/server").then(({ renderToString }) => {
      renderToString(
        <RepopProvider client={client}>
          <ServerSink />
        </RepopProvider>,
      );
      expect(received).toBe("EMPTY");
    });
  });

  it("churned selector fails LOUD: uSES infinite-loop guard fires", () => {
    const client = new TestRepopClient();
    function Churn(): React.ReactNode {
      useRepopSelector((s) => ({ fresh: s.status }));
      return null;
    }
    // Object.is law enforced by React itself: a per-call-new selector result
    // must trip the maximum-update-depth guard, not pass silently.
    expect(() => {
      render(
        <RepopProvider client={client}>
          <Churn />
        </RepopProvider>,
      );
    }).toThrow(/Maximum update depth/);
  });
});
