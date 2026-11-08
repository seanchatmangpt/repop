// Typed error surface for @repop/client. Fail-closed: every refusal across the
// async seam is one of these classes, never a thrown bare Error and never a
// silent state change.

/** Base class — never thrown across the async seam; always returned in Either. */
export class RepopError extends Error {
  readonly kind: string;
  constructor(kind: string, message: string) {
    super(message);
    this.name = kind;
    this.kind = kind;
  }
}

/** Client-side operation attempted before the worker/kernel is booted + ready. */
export class RepopNotBootedError extends RepopError {
  constructor(message = 'repop client is not booted (no kernel-ready frame received)') {
    super('RepopNotBootedError', message);
  }
}

/** A write arrived with a version that would clobber a newer entity record. */
export class StaleVersionError extends RepopError {
  readonly entityKey: string;
  readonly currentVersion: number;
  readonly rejectedVersion: number;
  constructor(entityKey: string, currentVersion: number, rejectedVersion: number) {
    super('StaleVersionError',
      `stale version write for entity "${entityKey}": have ${currentVersion}, rejected ${rejectedVersion}`,
    );
    this.entityKey = entityKey;
    this.currentVersion = currentVersion;
    this.rejectedVersion = rejectedVersion;
  }
}

/** A frame kind outside the pinned wire union arrived on the transport. */
export class UnknownFrameError extends RepopError {
  readonly frameKind: number;
  constructor(frameKind: number) {
    super('UnknownFrameError',`unknown frame kind 0x${frameKind.toString(16).padStart(2, '0')}`);
    this.frameKind = frameKind;
  }
}

/** A correlated request passed its injected deadline without settling. */
export class TimeoutError extends RepopError {
  readonly entityKey: string;
  readonly deadline: number;
  constructor(entityKey: string, deadline: number) {
    super('TimeoutError',`request for entity "${entityKey}" timed out at deadline ${deadline}`);
    this.entityKey = entityKey;
    this.deadline = deadline;
  }
}

/** The worker refused a correlated request with a typed code. */
export class WorkerRefusalError extends RepopError {
  readonly corrId: number;
  readonly code: number;
  readonly message: string;
  constructor(corrId: number, code: number, message: string) {
    super('WorkerRefusalError',`worker refused corrId ${corrId} (code 0x${code.toString(16).padStart(2, '0')}): ${message}`);
    this.corrId = corrId;
    this.code = code;
    this.message = message;
  }
}

/** An invariant of the wire/state machine was violated (truncated frame, bad payload). */
export class BreachError extends RepopError {
  readonly reason: string;
  constructor(reason: string) {
    super('BreachError',`wire breach: ${reason}`);
    this.reason = reason;
  }
}
