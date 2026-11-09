/**
 * @repop/worker protocol surface (P9): binary frame router — zero-JSON,
 * fixed-width, typed refusals. Exports the codec, gate law, stateful
 * router, correlation/seq law, refusal codec, and the transport seam.
 */

export {
  DIGEST_OFFSET,
  DIGEST_SPAN,
  Field,
  HEADER_SIZE,
  MAGIC,
  VERSION,
  encodeFrame,
  isFrameShaped,
  decodeFrame,
} from "./frame.ts";
export {
  FrameKind,
  PAYLOAD_WIDTH,
  isFrameKind,
} from "./frameKind.ts";
export type {
  DecodedFrame,
  RouterError,
  RouterOutcome,
} from "./routerError.ts";
export { CorrelationTable } from "./correlation.ts";
export { SeqTracker, wrapSafeLt, seqNext, toU32, isReplay } from "./seq.ts";
export { Router } from "./router.ts";
export type { FrameHandler, RouterIo } from "./router.ts";
export {
  RefusalReason,
  REFUSE_PAYLOAD_SIZE,
  encodeRefusal,
  decodeRefusal,
} from "./refusal.ts";
export type { DecodedRefusal } from "./refusal.ts";
export {
  PostMessageTransport,
  transportPair,
  transportIo,
} from "./transport.ts";
