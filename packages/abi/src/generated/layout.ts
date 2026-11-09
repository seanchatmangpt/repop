/* DO NOT EDIT — generated from the Rust layout spec.
 *
 * Generator: scripts/gen_ts_mirror.py
 * Source of truth: kernel/crates/repop-abi/src/layout_spec.rs
 * Spec-SHA256: e7328a09fcc6d75e49031c63faa791ff82813529be274c011422cbc0ed4f92dc
 *
 * All offsets in bytes. All multi-byte scalars are LITTLE-ENDIAN.
 * Every frame is exactly 64 bytes; the FNV-1a32 digest lives at
 * DIGEST_OFFSET over DIGEST_SPAN ([0x00, 0x3C)).
 */
export const SPEC_SHA256 = "e7328a09fcc6d75e49031c63faa791ff82813529be274c011422cbc0ed4f92dc";
export const FRAME_SIZE = 64;
export const DIGEST_OFFSET = 60;
export const DIGEST_SPAN = 60;
export const FNV1A32_OFFSET_BASIS = 2166136261;
export const FNV1A32_PRIME = 16777619;
export const LAYOUT_VERSION = 1;
export const INTENT_MAGIC = 0x4946;
export const HYPERPLANE_MAGIC = 0x4850;
export const RECEIPT_MAGIC = 0x5246;
export const ALG_ID_KEYED_BLAKE3 = 0x0000;
export const ALG_ID_ML_DSA_65 = 0x0001;
export const FNV_OFFSET_BASIS = FNV1A32_OFFSET_BASIS;
export const FNV_PRIME = FNV1A32_PRIME;

/** Row tuple: [name, offsetBytes, widthBytes, kind]. */
export type FieldRow = readonly [
  name: string,
  offset: number,
  width: number,
  kind: string,
];

/** Projected verbatim from `INTENT_FIELDS` in layout_spec.rs. */
export const INTENT_FIELDS: readonly FieldRow[] = [
  ["magic", 0, 2, "U16"],
  ["version", 2, 2, "U16"],
  ["intent_kind", 4, 2, "U16"],
  ["flags", 6, 2, "U16"],
  ["hyperplane_id", 8, 8, "U64"],
  ["threshold", 16, 8, "F64"],
  ["weight", 24, 8, "F64"],
  ["issuer", 32, 8, "Bytes"],
  ["payload_binding", 40, 16, "Bytes"],
  ["frame_seq", 56, 2, "U16"],
  ["reserved", 58, 2, "U16"],
];

/** Projected verbatim from `HYPERPLANE_FIELDS` in layout_spec.rs. */
export const HYPERPLANE_FIELDS: readonly FieldRow[] = [
  ["magic", 0, 2, "U16"],
  ["version", 2, 2, "U16"],
  ["plane_kind", 4, 2, "U16"],
  ["flags", 6, 2, "U16"],
  ["plane_id", 8, 8, "U64"],
  ["normal_x", 16, 8, "F64"],
  ["normal_y", 24, 8, "F64"],
  ["normal_z", 32, 8, "F64"],
  ["offset", 40, 8, "F64"],
  ["binding", 48, 8, "Bytes"],
  ["epoch", 56, 2, "U16"],
  ["reserved", 58, 2, "U16"],
];

/** Projected verbatim from `RECEIPT_FIELDS` in layout_spec.rs. */
export const RECEIPT_FIELDS: readonly FieldRow[] = [
  ["magic", 0, 2, "U16"],
  ["version", 2, 2, "U16"],
  ["alg_id", 4, 2, "U16"],
  ["flags", 6, 2, "U16"],
  ["binding", 8, 32, "Bytes"],
  ["admissions_root_prefix", 40, 16, "Bytes"],
  ["frame_seq", 56, 2, "U16"],
  ["payload_len", 58, 2, "U16"],
  ["digest", 60, 4, "Digest"],
];
