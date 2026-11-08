/**
 * Typed refusals + result type. Fail-closed law: unknown frames, corrupt
 * slots are typed refusals, never silent drops.
 */

/** Closed union of ring/wire refusal classes. */
export type WireErrorCode =
  | "BAD_MAGIC"
  | "BAD_CRC"
  | "BAD_ORDINAL"
  | "OVERSIZE"
  | "BAD_CAPACITY"
  | "BAD_STATE"
  | "EMPTY"
  | "FULL"
  | "TRANSPORT_CLOSED";

export interface WireError {
  readonly code: WireErrorCode;
  readonly message: string;
  readonly observed?: number;
  readonly expected?: number;
}

/** Closed result type; `error` is always a typed WireError. */
export type RingResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: WireError };

export function ok<T>(value: T): RingResult<T> {
  return { ok: true, value };
}

export function err(
  code: WireErrorCode,
  message: string,
  observed?: number,
  expected?: number,
): RingResult<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(observed !== undefined ? { observed } : {}),
      ...(expected !== undefined ? { expected } : {}),
    },
  };
}
