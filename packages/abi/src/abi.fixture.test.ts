/**
 * Cross-language golden-byte leg (C2b): the fixture at
 * scripts/parity_fixture.json is emitted by the Rust court
 * (kernel/crates/repop-abi/tests/golden_fixture.rs, REPOP_EMIT_FIXTURE=1).
 * Each leg proves: Rust bytes decode in TS, TS re-encode is byte-identical,
 * and the digest re-seals to the same FNV-1a32.
 */
import { describe, expect, it } from "vitest";

import fixture from "../../../scripts/parity_fixture.json";

import {
  HyperplaneRegisterView,
  IntentFrameView,
  ReceiptFrameView,
  computeDigest,
  FRAME_SIZE,
} from "./index.ts";

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

function roundtripLeg(
  hexKey: "intent_hex" | "hyperplane_hex" | "receipt_hex",
  View: { // eslint-disable-line -- structural: any frame view class
    fromBytes(b: Uint8Array): { ok: boolean; value?: unknown };
    new (buf: ArrayBuffer): { write(f: unknown): void };
  },
): void {
  const raw = hexToBytes((fixture as any)[hexKey]);
  expect(raw.length).toBe(FRAME_SIZE);
  const decoded = View.fromBytes(raw);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) return;
  const resealed = new ArrayBuffer(FRAME_SIZE);
  new View(resealed).write(decoded.value);
  const resealedHex = bytesToHex(new Uint8Array(resealed));
  expect(resealedHex).toBe((fixture as any)[hexKey]);
  const dv = new DataView(resealed);
  expect(dv.getUint32(60, true)).toBe(computeDigest(dv));
}

describe("cross-language golden bytes (Rust emit -> TS decode -> TS re-encode)", () => {
  it("IntentFrame: byte-identical re-encode", () => {
    roundtripLeg("intent_hex", IntentFrameView);
  });
  it("HyperplaneRegister: byte-identical re-encode", () => {
    roundtripLeg("hyperplane_hex", HyperplaneRegisterView);
  });
  it("ReceiptFrame: byte-identical re-encode", legs);
  function legs(): void {
    roundtripLeg("receipt_hex", ReceiptFrameView);
  }
});
