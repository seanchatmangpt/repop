/**
 * RouterError: typed refusal union, one variant per corruption class
 * (P9 dispatch). Gates evaluate in the pinned order; the first failing
 * gate produces its variant — later corruption is never reported past a
 * failing earlier gate.
 */

export type RouterError =
  | { readonly code: "BAD_MAGIC"; readonly got: number }
  | { readonly code: "BAD_VERSION"; readonly got: number }
  | { readonly code: "BAD_FLAGS"; readonly got: number }
  | {
      readonly code: "BAD_RESERVED";
      readonly field: "reserved0" | "reserved1";
      readonly got: number;
    }
  | {
      readonly code: "BAD_DIGEST";
      readonly computed: number;
      readonly stored: number;
      readonly span: number;
    }
  | { readonly code: "BAD_KIND"; readonly got: kindWindow }
  | {
      readonly code: "BAD_LENGTH";
      readonly field: "payloadLen" | "totalBytes";
      readonly expected: number;
      readonly got: number;
    }
  | {
      /** Wrap-safe monotonic seq law refusal (writer-owned seq). */
      readonly code: "BAD_SEQ";
      readonly last: number;
      readonly got: number;
    }
  | {
      readonly code: "BAD_CORRELATION";
      readonly corrId: number;
      readonly why: "unknown" | "echo-mismatch" | "unsolicited-not-ready";
    };

/** Kind value as observed on the wire (u8 window). */
type kindWindow = number;

export type RouterOutcome = { readonly ok: true; frame: DecodedFrame } | {
  readonly ok: false;
  readonly error: RouterError;
};

/** A fully validated router frame; `payload` views the wire bytes. */
export interface DecodedFrame {
  readonly kind: FrameKindV;
  readonly version: number;
  readonly seq: number;
  readonly corrId: number;
  /** Zero-copy view into the incoming frame bytes. */
  readonly payload: Uint8Array;
}

/** Imported as type-only to avoid a runtime cycle with frameKind.ts. */
type FrameKindV = import("./frameKind.ts").FrameKind;

/** Typed-refusal constructor helpers (shared across the gate surface). */
export function err(error: RouterError): RouterOutcome {
  return { ok: false, error };
}

export function ok(frame: DecodedFrame): RouterOutcome {
  return { ok: true, frame };
}
