import { describe, expect, it } from "vitest";
import { crc32 } from "./crc32.ts";

describe("crc32", () => {
  it("IEEE CRC-32 of '123456789' is 0xCBF43926", () => {
    const bytes = new TextEncoder().encode("123456789");
    expect(crc32(bytes)).toBe(0xcbf43926);
  });

  it("empty input is 0x00000000", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it("is deterministic and input-sensitive", () => {
    const a = new TextEncoder().encode("WIR0 slot checksum payload");
    const b = new TextEncoder().encode("WIR0 slot checksum payloae");
    expect(crc32(a)).toBe(crc32(a));
    expect(crc32(a)).not.toBe(crc32(b));
  });

  it("honors start/end window", () => {
    const bytes = new TextEncoder().encode("abcdef");
    const win = bytes.subarray(1, 4);
    expect(crc32(bytes, 1, 4)).toBe(crc32(win));
  });
});
