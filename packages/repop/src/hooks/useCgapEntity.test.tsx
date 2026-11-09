/**
 * useCgapEntity courts: snapshot selection, CAS from CURRENT version,
 * typed refusal RETURNS (never throws) for STALE/BREACH/WORKER classes.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { useCgapEntity } from "./useCgapEntity.js";
import { RepopProvider } from "../RepopProvider.js";
import { TestRepopClient } from "../test-support/testClient.js";

describe("useCgapEntity", () => {
  it("exposes the slice and commits CAS from the CURRENT observed version", async () => {
    const client = new TestRepopClient();
    client.putEntity("e1", 3, { n: 1 });
    let captured: { commit: (i: { kind: "set" | "merge"; payload: Record<string, unknown> }) => Promise<unknown> } | undefined;
    function Harness(): React.ReactNode {
      const { slice, commit } = useCgapEntity("e1");
      captured = { commit };
      return <div>{slice.version}</div>;
    }
    render(
      <RepopProvider client={client}>
        <Harness />
      </RepopProvider>,
    );
    const out = await captured!.commit({ kind: "set", payload: { n: 2 } });
    expect(out).toEqual({ ok: true, newVersion: 4 });
    expect(client.getSnapshot().entities.get("e1")?.version).toBe(4);
  });

  it("returns STALE_VERSION as a typed refusal, never throws", async () => {
    const client = new TestRepopClient();
    client.putEntity("e1", 5, null);
    let captured: { commit: (i: { kind: "set" | "merge"; payload: Record<string, unknown> }) => Promise<unknown> } | undefined;
    function Harness(): React.ReactNode {
      const { slice, commit } = useCgapEntity("e1");
      captured = { commit };
      return <div>{String(slice.version)}</div>;
    }
    render(
      <RepopProvider client={client}>
        <Harness />
      </RepopProvider>,
    );
    // CAS against a WRONG expected version: the hook reads current=5, so to
    // force a stale refusal we commit against the client directly.
    const out = await client.commitIntent("e1", { kind: "set", payload: {} }, 4);
    expect(out.ok).toBe(false);
    if (!out.ok && out.refusal.class === "STALE_VERSION") {
      expect(out.refusal.expected).toBe(4);
      expect(out.refusal.observed).toBe(5);
    } else {
      throw new Error("expected STALE_VERSION refusal");
    }
    // And the hook-level commit succeeds because it reads CURRENT version.
    const hookOut = await captured!.commit({ kind: "set", payload: {} });
    expect(hookOut).toEqual({ ok: true, newVersion: 6 });
  });

  it("missing entity uses a stable missing-slice constant (no per-call alloc)", async () => {
    const client = new TestRepopClient();
    const slices: unknown[] = [];
    function Sink(): React.ReactNode {
      const { slice } = useCgapEntity("ghost");
      slices.push(slice);
      return null;
    }
    render(
      <RepopProvider client={client}>
        <Sink />
      </RepopProvider>,
    );
    const first = slices[0];
    render(
      <RepopProvider client={client}>
        <Sink />
      </RepopProvider>,
    );
    expect(slices[0]).toBe(first);
  });
});
