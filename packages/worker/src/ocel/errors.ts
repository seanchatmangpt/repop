/**
 * OCEL ledger typed refusals (fail-closed, closed union).
 *
 * Mirrors the ring errors.ts result shape: every failure is a typed refusal,
 * never a thrown string.
 */

/** Closed union of ledger refusal classes. */
export type OcelErrorCode =
  | "OUT_OF_VOCAB"
  | "ARITY_MISMATCH"
  | "ORDER_VIOLATION"
  | "CHAIN_MISMATCH"
  | "NOT_SEALED"
  | "ALREADY_SEALED"
  | "BUFFER_TOO_SHORT";

export interface OcelError {
  readonly code: OcelErrorCode;
  readonly message: string;
  readonly observed?: number;
  readonly expected?: number;
  readonly activity?: string;
}

/** Closed result type; `error` is always a typed OcelError. */
export type OcelResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: OcelError };

export function ok<T>(value: T): OcelResult<T> {
  return { ok: true, value };
}

export function ocelErr(
  code: OcelErrorCode,
  message: string,
  extra?: Partial<Pick<OcelError, "observed" | "expected" | "activity">>,
): OcelResult<never> {
  return {
    ok: false,
    error: { code, message, ...extra },
  };
}
