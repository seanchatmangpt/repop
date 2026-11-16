/**
 * A2A bridge court (seam S1): pinned wire-shape fixtures transcribed from
 * ash_a2a lib/ash_a2a/protocol/json.ex (canonical checkout), round-trip
 * map-shape equality, and the -32001 reason-discriminator mutation leg.
 */
import { describe, expect, it } from "vitest";
import { encodeFrame, decodeFrame } from "./frame.ts";
import { FrameKind } from "./frameKind.ts";
import { encodeRefusal, RefusalReason } from "./refusal.ts";
import {
  a2aIncoming,
  a2aIncomingError,
  a2aOutgoing,
  isTerminalState,
  refusalToErrorMap,
  TASK_STATE,
  type A2AIncoming,
} from "./a2a.ts";

/** 64-byte intent-frame payload (width from @repop/abi FRAME_SIZE law). */
const INTENT_PAYLOAD = new Uint8Array(64).fill(0xab);

/** Encode + decode a fixture frame; DecodedFrame or throw. */
function fixtureFrame(kind: (typeof FrameKind)[keyof typeof FrameKind], seq: number, corrId: number, payload: Uint8Array) {
  const res = encodeFrame(kind, seq, corrId, payload);
  if (!res.ok) throw new Error(`fixture frame refused: ${res.error.code}`);
  const decoded = decodeFrame(res.frame);
  if (!decoded.ok) throw new Error(`fixture decode refused: ${decoded.error.code}`);
  return decoded.frame;
}

function submitFrame(corrId: number) {
  return fixtureFrame(FrameKind.SUBMIT_INTENT, 1, corrId, INTENT_PAYLOAD);
}

function resolvedFrame(corrId: number) {
  return fixtureFrame(FrameKind.INTENT_RESOLVED, 2, corrId, new Uint8Array(64).fill(0x01));
}

/**
 * Pinned fixture: message/send request shape. Transcribed from
 * ash_a2a/lib/ash_a2a/protocol/json.ex:143-146 ("role", "messageId"),
 * :187-191 (data part flat encode %{"data" => part.data}), with the
 * "kind":"data" discriminator lawful on decode (json.ex:595).
 */
const MESSAGE_SEND_FIXTURE = {
  jsonrpc: "2.0",
  id: "7",
  method: "message/send",
  params: {
    message: {
      role: "agent",
      parts: [
        {
          kind: "data",
          data: {
            payload: "q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6urqw==",
            mimeType: "application/x-repop-frame",
          },
        },
      ],
      messageId: "7",
    },
  },
};

/**
 * Pinned fixture: tasks/get request shape (json.ex task read surface;
 * JSON-RPC envelope per jsonrpc/response.ex:13-15).
 */
const TASKS_GET_FIXTURE = {
  jsonrpc: "2.0",
  id: "7",
  method: "tasks/get",
  params: { id: "7" },
};

/**
 * Pinned fixture: -32001 refusal envelope with google.rpc.ErrorInfo in
 * data[]. Transcribed from ash_a2a jsonrpc/response.ex:17-19 (envelope),
 * to_a2a_error.ex:47-48 (ErrorInfo @type/domain/reason), jsonrpc/error.ex:51
 * (code table; -32001 default reason TASK_NOT_FOUND).
 */
const REFUSAL_ENVELOPE_FIXTURE = {
  jsonrpc: "2.0",
  id: "7",
  error: {
    code: -32001,
    message: "repop refusal: UNKNOWN_OBJECT",
    data: [
      {
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        reason: "UNKNOWN_OBJECT",
        domain: "repop",
        metadata: { detail: "statusCode=404" },
      },
    ],
  },
};

describe("a2a outgoing (RP9F frame -> JSON-RPC map)", () => {
  it("SUBMIT_INTENT pins the message/send data-part shape", () => {
    const out = a2aOutgoing(submitFrame(7));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.request).toEqual(MESSAGE_SEND_FIXTURE);
  });

  it("INTENT_RESOLVED pins the tasks/get read", () => {
    const out = a2aOutgoing(resolvedFrame(7));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.request).toEqual(TASKS_GET_FIXTURE);
  });

  it("non-bridge kinds are typed refusals", () => {
    const res = encodeFrame(FrameKind.KERNEL_READY, 0, 0, new Uint8Array(0));
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error.code);
    const decoded = decodeFrame(res.frame);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.error.code);
    const out = a2aOutgoing(decoded.frame);
    expect(out).toEqual({ ok: false, error: { code: "BAD_KIND", got: 2 } });
  });
});

describe("a2a refusal envelope (RP9F REFUSE -> ErrorInfo)", () => {
  it("pins the -32001 envelope with ErrorInfo in data[]", () => {
    const r = encodeRefusal(404, RefusalReason.UNKNOWN_OBJECT, 7);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("fixture refusal refused");
    const env = refusalToErrorMap({
      statusCode: 404,
      reasonBits: RefusalReason.UNKNOWN_OBJECT,
      corrId: 7,
    });
    expect(env).toEqual(REFUSAL_ENVELOPE_FIXTURE);
  });

  it(
    "mutation leg: flipping the refusal class MUST flip the ErrorInfo reason " +
      "(the -32001 collision is discriminated by reason, never by code)",
    () => {
      const a = refusalToErrorMap({
        statusCode: 404,
        reasonBits: RefusalReason.UNKNOWN_OBJECT,
        corrId: 7,
      });
      const b = refusalToErrorMap({
        statusCode: 404,
        reasonBits: RefusalReason.NOT_READY,
        corrId: 7,
      });
      // same bare code, different wire discriminator:
      expect(a.error.code).toBe(b.error.code);
      expect(a.error.data[0]["@type"]).toBe(b.error.data[0]["@type"]);
      expect(a.error.data[0].reason).not.toBe(b.error.data[0].reason);
      expect(a).not.toEqual(b);
    },
  );
});

describe("a2a incoming (Task/error map -> RP9F receipt/refusal)", () => {
  const cases: Array<[Parameters<typeof a2aIncoming>[0], A2AIncoming]> = [
    [{ status: { state: "completed" } }, { tier: "fulfilled", state: "completed" }],
    [{ status: { state: "canceled" } }, { tier: "canceled", state: "canceled" }],
    [{ status: { state: "failed" } }, { tier: "failed", state: "failed" }],
    [{ status: { state: "rejected" } }, { tier: "refused", state: "rejected" }],
    [
      { status: { state: "input_required" } },
      { tier: "blocked", state: "input_required" },
    ],
    [
      { status: { state: "auth_required" } },
      { tier: "blocked", state: "auth_required" },
    ],
    [{ status: { state: "working" } }, { tier: "pending", state: "working" }],
    [{ status: { state: "submitted" } }, { tier: "pending", state: "submitted" }],
    [{ status: { state: "TASK_STATE_UNKNOWN" } }, { tier: "indeterminate", state: "unknown" }],
    [{}, { tier: "indeterminate", state: "unknown" }],
  ];
  for (const [task, expected] of cases) {
    it(`maps ${(task.status?.state ?? "(none)")} -> tier ${expected.tier}`, () => {
      expect(a2aIncoming(task)).toEqual(expected);
    });
  }

  it("terminal set matches ash_a2a @final_states (json.ex:72)", () => {
    for (const s of ["completed", "canceled", "failed", "rejected", "input_required", "auth_required"]) {
      expect(isTerminalState(s as (typeof TASK_STATE)[number])).toBe(true);
    }
    for (const s of ["submitted", "working", "unknown"]) {
      expect(isTerminalState(s as (typeof TASK_STATE)[number])).toBe(false);
    }
  });

  it("error.reason is the discriminator: two -32001s decode to different classes", () => {
    const notFound = a2aIncomingError({
      code: -32001,
      data: [
        {
          "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          reason: "TASK_NOT_FOUND",
          domain: "a2a-protocol.org",
        },
      ],
    });
    const policy = a2aIncomingError({
      code: -32001,
      data: [
        {
          "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          reason: "POLICY_FORBIDDEN",
          domain: "a2a-protocol.org",
        },
      ],
    });
    expect(notFound.tier).toBe("refused");
    expect(policy.tier).toBe("refused");
    expect(notFound.reasonBits).toBe(RefusalReason.UNKNOWN_OBJECT);
    expect(policy.reasonBits).toBe(RefusalReason.NOT_READY);
    expect(notFound.reasonBits).not.toBe(policy.reasonBits);
  });

  it("missing ErrorInfo falls back typed, never silently", () => {
    const out = a2aIncomingError({ code: -32001 });
    expect(out).toEqual({
      tier: "refused",
      state: "rejected",
      reasonBits: RefusalReason.BAD_FRAME_CLASS,
    });
  });
});
