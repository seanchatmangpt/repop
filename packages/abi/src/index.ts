/**
 * @repop/abi — pinned 64-byte frame layouts for the kernel/worker/client
 * boundary. Zero-JSON, fixed-width little-endian only.
 */

export {
  ALG_ID_KEYED_BLAKE3,
  ALG_ID_ML_DSA_65,
  DIGEST_OFFSET,
  DIGEST_SPAN,
  FRAME_SIZE,
  FNV_OFFSET_BASIS,
  FNV_PRIME,
  HYPERPLANE_MAGIC,
  HYPERPLANE_FIELDS,
  INTENT_MAGIC,
  INTENT_FIELDS,
  LAYOUT_VERSION,
  RECEIPT_MAGIC,
  RECEIPT_FIELDS,
} from "./generated/layout.ts";
export type { DecodeError, DecodeResult } from "./layout.ts";
export {
  HyperplaneRegisterView,
  IntentFrameView,
  ReceiptFrameView,
  computeDigest,
  fnv1a32,
  isDecodeError,
} from "./layout.ts";
export type {
  HyperplaneRegister,
  IntentFrame,
  ReceiptFrame,
} from "./layout.ts";
export { getU64, setU64, u64ToSafeNumber } from "./u64.ts";
export type { FieldRow } from "./generated/layout.ts";
