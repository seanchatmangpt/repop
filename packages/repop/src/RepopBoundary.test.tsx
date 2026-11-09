/**
 * RepopBoundary courts (Chicago: real render through @testing-library/react).
 * Mutation legs executed by the lane shim-court, not in-file.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import {
  RepopBoundary,
  RepopBoundaryRoot,
  useBoundaryRefuse,
  useBoundaryRegistry,
} from "./RepopBoundary.js";

function Child({ pid }: { pid: string }): ReactNode {
  return <div data-testid={`child-${pid}`}>live</div>;
}

function Refuser({ raw }: { raw: unknown }): ReactNode {
  const refuse = useBoundaryRefuse();
  return (
    <button data-testid="refuse-btn" onClick={() => refuse(raw)}>
      refuse
    </button>
  );
}

const STALE = { class: "STALE_VERSION", expected: 3, observed: 2 };
const UNKNOWN = { kind: "UnknownFrameError", message: "frame kind 0xff" };

afterEach(cleanup);

describe("RepopBoundary containment", () => {
  it("UNKNOWN_FRAME causes an immediate fail-closed subtree swap", () => {
    render(
      <RepopBoundary pid="e1" fallback={<div data-testid="fb">swapped</div>}>
        <Refuser raw={UNKNOWN} />
        <Child pid="e1" />
      </RepopBoundary>,
    );
    expect(screen.getByTestId("child-e1")).toBeTruthy();
    fireEvent.click(screen.getByTestId("refuse-btn"));
    expect(screen.getByTestId("fb")).toBeTruthy();
    expect(screen.queryByTestId("child-e1")).toBeNull();
  });

  it("STALE_VERSION renders inline UI first and retry clears it", () => {
    render(
      <RepopBoundary
        pid="e1"
        fallback={<div data-testid="fb">swapped</div>}
        inline={(refusal, retry) => (
          <button data-testid="inline-retry" onClick={retry}>
            stale seq={refusal.seq}
          </button>
        )}
      >
        <Refuser raw={STALE} />
        <Child pid="e1" />
      </RepopBoundary>,
    );
    fireEvent.click(screen.getByTestId("refuse-btn"));
    expect(screen.getByTestId("inline-retry")).toBeTruthy();
    expect(screen.queryByTestId("child-e1")).toBeNull();
    fireEvent.click(screen.getByTestId("inline-retry"));
    expect(screen.getByTestId("child-e1")).toBeTruthy();
    expect(screen.queryByTestId("inline-retry")).toBeNull();
  });

  it("STALE_VERSION promotes to fallback after maxStaleRetries distinct seqs", () => {
    render(
      <RepopBoundary
        pid="e1"
        maxStaleRetries={2}
        fallback={<div data-testid="fb">swapped</div>}
        inline={(_r, retry) => (
          <button data-testid="inline-retry" onClick={retry}>
            retry
          </button>
        )}
      >
        <Refuser raw={STALE} />
        <Child pid="e1" />
      </RepopBoundary>,
    );
    // Refuse, clear, refuse, clear, refuse -> 3 distinct seqs > 2 -> promoted.
    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getByTestId(i % 2 === 0 ? "refuse-btn" : "inline-retry"));
    }
    expect(screen.getByTestId("fb")).toBeTruthy();
    expect(screen.queryByTestId("inline-retry")).toBeNull();
  });
});

describe("RepopBoundary isolation + recovery", () => {
  it("swapping pid A leaves pid B's subtree untouched (per-entity Map)", () => {
    render(
      <RepopBoundaryRoot>
        <RepopBoundary pid="a" fallback={<div data-testid="fb-a">a swapped</div>}>
          <Refuser raw={UNKNOWN} />
          <Child pid="a" />
        </RepopBoundary>
        <RepopBoundary pid="b" fallback={<div data-testid="fb-b">b swapped</div>}>
          <Child pid="b" />
        </RepopBoundary>
      </RepopBoundaryRoot>,
    );
    fireEvent.click(screen.getByTestId("refuse-btn"));
    expect(screen.getByTestId("fb-a")).toBeTruthy();
    expect(screen.queryByTestId("child-a")).toBeNull();
    expect(screen.getByTestId("child-b")).toBeTruthy();
    expect(screen.queryByTestId("fb-b")).toBeNull();
  });

  it("KERNEL_UNREADY is transparent containment (children still render)", () => {
    render(
      <RepopBoundary
        pid="e1"
        fallback={<div data-testid="fb">swapped</div>}
      >
        <Refuser raw={{ kind: "RepopNotBootedError", message: "not booted" }} />
        <Child pid="e1" />
      </RepopBoundary>,
    );
    fireEvent.click(screen.getByTestId("refuse-btn"));
    expect(screen.getByTestId("child-e1")).toBeTruthy();
    expect(screen.queryByTestId("fb")).toBeNull();
  });

  it("a real throw swaps the same subtree to fallback", () => {
    function Bomber(): ReactNode {
      throw new Error("boom");
    }
    render(
      <RepopBoundary pid="e1" fallback={<div data-testid="fb">swapped</div>}>
        <Bomber />
      </RepopBoundary>,
    );
    expect(screen.getByTestId("fb")).toBeTruthy();
  });

  it("registry records the entry (map law, observable)", () => {
    function Probe(): ReactNode {
      const registry = useBoundaryRegistry();
      return <div data-testid="probe">{registry.size}</div>;
    }
    render(
      <RepopBoundaryRoot>
        <Probe />
        <RepopBoundary pid="e1" fallback={<div data-testid="fb">x</div>}>
          <Refuser raw={STALE} />
        </RepopBoundary>
      </RepopBoundaryRoot>,
    );
    fireEvent.click(screen.getByTestId("refuse-btn"));
    expect(Number(screen.getByTestId("probe").textContent)).toBe(1);
  });
});
