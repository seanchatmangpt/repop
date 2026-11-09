/**
 * u64 helpers over DataView: little-endian bigint access plus a safe-number
 * range guard for field values that fit a JS-safe integer.
 */

export function getU64(
  view: DataView,
  byteOffset: number,
): bigint {
  return view.getBigUint64(byteOffset, true);
}

export function setU64(
  view: DataView,
  byteOffset: number,
  value: bigint,
): void {
  view.setBigUint64(byteOffset, value, true);
}

/**
 * Convert a u64 to a JS number, refusing lossy values with a typed error
 * rather than silently truncating past Number.MAX_SAFE_INTEGER.
 */
export function u64ToSafeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    const err = new RangeError(
      `u64 value ${value} exceeds Number.MAX_SAFE_INTEGER (lossy conversion refused)`,
    );
    (err as RangeError & { code: string }).code = "U64_RANGE";
    throw err;
  }
  return Number(value);
}
