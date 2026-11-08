/**
 * @repop/client — headless, React-free store over the repop worker transport.
 * React (useSyncExternalStore) binds in packages/repop via its structural
 * RepopClient contract; nothing here imports or references react.
 *
 * Supersedes the C11 SLA shell (types-only by design, replaced when P10/C10
 * landed).
 */

export { RepopClientStore } from './store/repopClient.js';
export type { RepopClientOptions } from './store/repopClient.js';

export {
  EMPTY_ENTITIES,
  EMPTY_ENTITY_LIST,
  SERVER_SNAPSHOT,
} from './store/empty.js';

export { WorkerOwner } from './worker/owner.js';
export type { WorkerOwnerOptions } from './worker/owner.js';

export { CorrelationMap } from './protocol/correlate.js';
export type { PendingRequest } from './protocol/correlate.js';

export { decodeFrame } from './protocol/decode.js';

export {
  encodeFrame,
  FRAME_KIND,
  HEADER_BYTES,
  RECEIPT_BYTES,
  REFUSAL_CODE,
} from './protocol/frames.js';
export type {
  WireFrame,
  KernelReadyFrame,
  ReceiptFrame,
  RefusalFrame,
  BreachFrame,
} from './protocol/frames.js';

export {
  BreachError,
  RepopError,
  RepopNotBootedError,
  StaleVersionError,
  TimeoutError,
  UnknownFrameError,
  WorkerRefusalError,
} from './errors.js';

export type {
  EntityRecord,
  EntityStatus,
  RepopResult,
  RepopSnapshot,
  TransportHandle,
  WorkerFactory,
  WorkerLike,
} from './types.js';
