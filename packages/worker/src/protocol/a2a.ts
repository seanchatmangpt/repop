/**
 * A2A v1.0 bridge (seam S1, integration wave v26.11.9) — THE JSON boundary.
 *
 * Zero-JSON law: JSON exists only in this module. Every other protocol
 * file is binary-only; the zero-JSON gate (gate/zero-json.test.ts) scans
 * the protocol directory and names this file as the single allowlisted
 * exception. This module emits map shapes (plain objects) — never
 * strings — so the stringifier stays on the HTTP transport, not here.
 *
 * Outgoing: RP9F router frames -> A2A JSON-RPC request maps.
 * Incoming: A2A Task / error maps -> RP9F receipt/refusal outcomes.
 *
 * Vocabulary transcribed from the canonical ash_a2a checkout:
 *  - TaskState wire vocab + final states:
 *    ash_a2a/lib/ash_a2a/protocol/json.ex:39-47 (protojson emission),
 *    :55-66 (string decode incl. the legacy "TASK_STATE_UNKNOWN" row),
 *    :72 (@final_states — input_required/auth_required ARE terminal).
 *  - ErrorInfo envelope: ash_a2a/lib/ash_a2a/to_a2a_error.ex:47-48
 *    (`@type` + domain + reason + metadata.detail).
 *  - -32001 collision law (reason is the ONLY wire discriminator):
 *    ash_a2a/lib/ash_a2a/protocol/jsonrpc/error.ex:47-52 and
 *    ash_a2a/lib/ash_a2a/to_a2a_error.ex:70-74.
 *  - Data part flat shape {data: {...}} with optional "kind"
 *    discriminator accepted on decode (json.ex:595): json.ex:187-191
 *    (encode), :516-520/:963-971 (flat decode); messageId json.ex:143-146.
 *  - Base64 payload encoding: json.ex:700-701 (Base.encode64 alphabet).
 *
 * Domain: refusals ORIGINATING in repop stamp domain "repop"; the -32001
 * reason is the discriminator, never the bare code.
 */

import { FrameKind } from "./frameKind.ts";
import { RefusalReason } from "./refusal.ts";
import type { DecodedFrame } from "./routerError.ts";

/** A2A TaskState wire vocabulary (json.ex:55-63; "unknown" row per :63/:66). */
export const TASK_STATE = [
  "submitted",
  "working",
  "input_required",
  "completed",
  "canceled",
  "failed",
  "rejected",
  "auth_required",
  "unknown",
] as const;
export type TaskState = (typeof TASK_STATE)[number];

/**
 * Terminal set per ash_a2a @final_states (json.ex:72): input_required and
 * auth_required are terminal here. The dispatch summary's 4-state terminal
 * set is the success/failure subset; ash_a2a is the authority.
 */
const FINAL_STATES: ReadonlySet<TaskState> = new Set<TaskState>([
  "completed",
  "canceled",
  "failed",
  "rejected",
  "input_required",
  "auth_required",
]);

/** True iff `s` is terminal per ash_a2a @final_states (json.ex:72). */
export function isTerminalState(s: TaskState): boolean {
  return FINAL_STATES.has(s);
}

/** JSON-RPC id: corrId as string (A2A id is string|number; string pinned). */
function rpcId(corrId: number): string {
  return String(corrId >>> 0);
}

/** Base64, same alphabet as Base.encode64 (json.ex:700-701). */
export function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** RP9F -> A2A request map outcome (typed refusal for non-bridge kinds). */
export type A2AOutgoing =
  | {
      readonly ok: true;
      readonly request: {
        readonly jsonrpc: "2.0";
        readonly id: string;
        readonly method: "message/send" | "tasks/get";
        readonly params: Record<string, unknown>;
      };
    }
  | {
      readonly ok: false;
      readonly error: { readonly code: "BAD_KIND"; readonly got: number };
    };

/**
 * Map an RP9F router frame to its A2A JSON-RPC request map.
 * SUBMIT_INTENT -> message/send (data part, base64 payload);
 * INTENT_RESOLVED -> tasks/get. REFUSE goes through refusalToErrorMap —
 * errors are responses, never requests.
 */
export function a2aOutgoing(frame: DecodedFrame): A2AOutgoing {
  const id = rpcId(frame.corrId);
  if (frame.kind === FrameKind.SUBMIT_INTENT) {
    return {
      ok: true,
      request: {
        jsonrpc: "2.0",
        id,
        method: "message/send",
        params: {
          message: {
            role: "agent",
            parts: [
              {
                kind: "data",
                data: {
                  payload: encodeBase64(frame.payload),
                  mimeType: "application/x-repop-frame",
                },
              },
            ],
            messageId: id,
          },
        },
      },
    };
  }
  if (frame.kind === FrameKind.INTENT_RESOLVED) {
    return {
      ok: true,
      request: {
        jsonrpc: "2.0",
        id,
        method: "tasks/get",
        params: { id },
      },
    };
  }
  return { ok: false, error: { code: "BAD_KIND", got: frame.kind } };
}

/** google.rpc.ErrorInfo as carried in error.data[] (to_a2a_error.ex:47-48). */
export interface ErrorInfo {
  readonly "@type": "type.googleapis.com/google.rpc.ErrorInfo";
  readonly reason: string;
  readonly domain: string;
  readonly metadata?: { readonly detail?: string };
}

/**
 * RP9F refusal class -> ErrorInfo reason (domain "repop"). Every class
 * shares code -32001; the reason is the discriminator (collision law).
 */
const REFUSAL_REASONS = new Map<bigint, string>([
  [RefusalReason.NOT_READY, "NOT_READY"],
  [RefusalReason.UNKNOWN_OBJECT, "UNKNOWN_OBJECT"],
  [RefusalReason.BAD_FRAME_CLASS, "BAD_FRAME_CLASS"],
]);

/** A2A ErrorInfo reason -> RP9F refusal class bits. */
const REASON_TO_BITS = new Map<string, bigint>([
  ["NOT_READY", RefusalReason.NOT_READY],
  ["UNKNOWN_OBJECT", RefusalReason.UNKNOWN_OBJECT],
  ["BAD_FRAME_CLASS", RefusalReason.BAD_FRAME_CLASS],
  // -32001 collision counterparts on the ash_a2a side (jsonrpc/error.ex:51
  // default stamp + to_a2a_error.ex:70 policy class) decode to repop classes:
  ["TASK_NOT_FOUND", RefusalReason.UNKNOWN_OBJECT],
  ["POLICY_FORBIDDEN", RefusalReason.NOT_READY],
]);

/** Map RP9F refusal class bits to its ErrorInfo reason string. */
export function refusalReasonFor(reasonBits: bigint): string | undefined {
  return REFUSAL_REASONS.get(reasonBits);
}

/** Map an A2A ErrorInfo reason to RP9F refusal class bits (undefined = unmapped). */
export function refusalBitsForReason(reason: string): bigint | undefined {
  return REASON_TO_BITS.get(reason);
}

/** RP9F refusal as an A2A decode source (shape of refusal.ts DecodedRefusal). */
export interface RefusalInput {
  readonly statusCode: number;
  readonly reasonBits: bigint;
  readonly corrId: number;
}

/**
 * Build the JSON-RPC error response map for an RP9F REFUSE frame.
 * Envelope per ash_a2a jsonrpc/response.ex:17-19; ErrorInfo per
 * to_a2a_error.ex:47-48. Code pinned -32001 with reason as the
 * discriminator (collision law, jsonrpc/error.ex:47-52).
 */
export function refusalToErrorMap(refusal: RefusalInput): {
  readonly jsonrpc: "2.0";
  readonly id: string;
  readonly error: {
    readonly code: -32001;
    readonly message: string;
    readonly data: readonly [ErrorInfo];
  };
} {
  const reason = REFUSAL_REASONS.get(refusal.reasonBits) ?? "BAD_FRAME_CLASS";
  return {
    jsonrpc: "2.0",
    id: rpcId(refusal.corrId),
    error: {
      code: -32001,
      // Reason — not the bare code — is the wire discriminator:
      message: `repop refusal: ${reason}`,
      data: [
        {
          "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          reason,
          domain: "repop",
          metadata: { detail: `statusCode=${refusal.statusCode}` },
        },
      ],
    },
  };
}

/** Receipt tier per the RP9F INTENT_RESOLVED receipt/refusal split. */
export type ReceiptTier =
  | "fulfilled"
  | "canceled"
  | "failed"
  | "refused"
  | "blocked"
  | "pending"
  | "indeterminate";

/** Incoming receipt/refusal outcome. */
export interface A2AIncoming {
  readonly tier: ReceiptTier;
  readonly state: TaskState;
  /** Present only on refusal-shaped tiers (canceled/failed/refused). */
  readonly reasonBits?: bigint;
}

/**
 * Incoming: A2A Task map -> RP9F receipt outcome. Terminal states map to
 * receipt tiers; non-terminal states stay pending; unmapped states are
 * typed-indeterminate, never silently dropped.
 */
export function a2aIncoming(task: {
  readonly status?: { readonly state?: string };
}): A2AIncoming {
  const raw = task.status?.state;
  const state = (TASK_STATE as readonly string[]).includes(raw as TaskState)
    ? (raw as TaskState)
    : "unknown";
  switch (state) {
    case "completed":
      return { tier: "fulfilled", state };
    case "canceled":
      return { tier: "canceled", state };
    case "failed":
      return { tier: "failed", state };
    case "rejected":
      return { tier: "refused", state };
    case "input_required":
    case "auth_required":
      return { tier: "blocked", state };
    case "submitted":
    case "working":
      return { tier: "pending", state };
    default:
      return { tier: "indeterminate", state };
  }
}

/**
 * Incoming: A2A JSON-RPC error map -> RP9F refusal class. Walks
 * error.data[] for the google.rpc.ErrorInfo (ash_a2a wraps A2A-specific
 * codes in a single-element data array — jsonrpc/error.ex:186-199) and
 * maps reason -> class bits; the reason is the discriminator, so two
 * -32001 errors decode to DIFFERENT classes.
 */
export function a2aIncomingError(error: {
  readonly code?: number;
  readonly data?: ReadonlyArray<Record<string, unknown>>;
}): A2AIncoming {
  const info = error.data?.find(
    (d) => d["@type"] === "type.googleapis.com/google.rpc.ErrorInfo",
  );
  const reason = typeof info?.reason === "string" ? info.reason : undefined;
  const bits = reason !== undefined ? REASON_TO_BITS.get(reason) : undefined;
  return {
    tier: "refused",
    state: "rejected",
    reasonBits: bits ?? RefusalReason.BAD_FRAME_CLASS,
  };
}
