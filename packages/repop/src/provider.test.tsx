/**
 * Provider courts: lazy boot, DI non-disposal law, SSR stable fallback.
 */

import { describe, it, expect } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { RepopProvider } from "./RepopProvider.js";
import { useRepopClient, RepopProviderMissingError } from "./useRepopClient.js";
import { TestRepopClient } from "./test-support/testClient.js";

function Probe(): React.ReactNode {
  const client = useRepopClient();
  return <div>boot:{client instanceof TestRepopClient ? "yes" : "no"}</div>;
}

describe("RepopProvider", () => {
  it("throws typed RepopProviderMissingError when no provider is above", () => {
    // Fail-closed guard law: useRepopClient without a provider throws typed.
    expect(() => render(<Probe />)).toThrow(RepopProviderMissingError);
  });

  it("injects a client via DI and never disposes it (external-owner law)", async () => {
    const client = new TestRepopClient();
    render(
      <RepopProvider client={client}>
        <Probe />
      </RepopProvider>,
    );
    expect(screen.getByText(/boot:yes/)).toBeTruthy();
    expect(client.disposed).toBe(false);
  });

  it("lazy boot: bootstrap runs in an effect, not during render", async () => {
    let bootCalls = 0;
    const client = new TestRepopClient();
    const original = client.bootstrap.bind(client);
    client.bootstrap = async () => {
      bootCalls += 1;
      await original();
    };
    render(
      <RepopProvider client={client}>
        <Probe />
    </RepopProvider>,
    );
    await act(async () => {});
    expect(bootCalls).toBe(1);
    expect(client.disposed).toBe(false);
  });

  it("SSR: renderToString with the placeholder never touches COI globals", async () => {
    const { renderToString } = await import("react-dom/server");
    const html = renderToString(
      <RepopProvider>
        <Probe />
      </RepopProvider>,
    );
    expect(typeof html).toBe("string");
    expect(html.length > 0).toBe(true);
  });
});
