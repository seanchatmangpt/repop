# I1 — RP9F↔A2A bridge (seam S1) — receipt

Standing: PARTIAL_ALIVE

Lane: I1, integration wave v26.11.9. Repo: /Users/sac/repop. Authority:
`docs/jira/v26.11.9-integration/resolutions.md` (X-wave synthesis; X3 receipt
not landed — resolutions summary governs per dispatch).

## Landed

- `packages/worker/src/protocol/a2a.ts` — THE JSON boundary (single file;
  the dispatch's `a2aOutgoing.ts`/`a2aIncoming.ts` were folded here because
  the zero-JSON gate names a2a.ts as the only allowlisted exception;
  disclosed conflict, resolved toward the gate law). Outgoing: SUBMIT_INTENT
  → `message/send` (role "agent", `kind:"data"` part, base64 payload,
  mimeType `application/x-repop-frame`, messageId=corrId-as-string);
  INTENT_RESOLVED → `tasks/get {id}`; REFUSE → -32001 JSON-RPC error
  envelope with google.rpc.ErrorInfo in `data[]` (domain "repop", reason =
  refusal class, metadata.detail = statusCode). Incoming: Task state →
  receipt tier (fulfilled/canceled/failed/refused/blocked/pending/
  indeterminate); error.data[] ErrorInfo reason → refusal class bits.
- `packages/worker/src/protocol/gate/zero-json.test.ts` — gate extended:
  directory-scan (a new file cannot escape), allowlist = {a2a.ts} with
  non-empty + file-exists assertions; kill-leg unchanged (still detects
  injected JSON token).
- `packages/worker/src/protocol/a2a.test.ts` — court: pinned wire-shape
  fixtures transcribed from the canonical ash_a2a checkout with file:line
  citations in comments (json.ex:39-47/55-66/72/143-146/187-191/516-520/
  963-971, to_a2a_error.ex:47-48, jsonrpc/error.ex:47-52,
  jsonrpc/response.ex:13-19); round-trip map-shape equality; -32001
  mutation leg (flipping the refusal class flips the ErrorInfo reason,
  same bare code); incoming state-table across all 9 states + unmapped
  fallback; reason-discriminator decode leg (TASK_NOT_FOUND vs
  POLICY_FORBIDDEN under the same -32001 decode to different classes);
  typed fallback when ErrorInfo missing.

## Deviations from dispatch (disclosed)

- Single-file bridge (see above) instead of a2aOutgoing/a2aIncoming split.
- Terminal set: dispatch implied 4-state; ash_a2a `@final_states`
  (json.ex:72) is the authority — input_required/auth_required ARE
  terminal and map to tier "blocked". Pinned by test.
- messageId = corrId as string (A2A id is string|number; string pinned).
- Base64 via Buffer (same alphabet as Base.encode64, json.ex:700-701);
  fixtures computed with node, not hand-derived.

## Gates

- `npx tsc --noEmit` (packages/worker): protocol/uplink/boot clean; 6
  errors remain in `src/ocel/` (batch.ts null-vs-undefined ×3, chain.ts
  unused ROOT, chain.test.ts .value access) — PRE-EXISTING, files outside
  lane ownership, untouched.
- `npx vitest run src/protocol src/uplink src/boot`: 86/86 PASS (includes
  extended zero-JSON gate + all a2a court legs).
- `npx vitest run` (full worker): 132 passed / 4 failed — the 4 failures
  are `src/ocel/chain.test.ts` blake3 KAT (empty-input vector
  `ebe3da5b…` vs reference `af1349b9…`), PRE-EXISTING (the X-wave Y2
  blake3 nonconforming item, FNV-1a32-class), untouched by this lane.

## UNVERIFIED / deferred

- Cross-repo ExUnit round-trip court (ash_a2a decodes repop's emitted
  maps) — deferred per resolutions.
- Live ash_a2a interop (real HTTP plug) untested.
- Domain "repop" vs ash_a2a's "a2a-protocol.org": repop-originated
  refusals stamp their own domain; wire acceptance by ash_a2a is
  UNVERIFIED (the ErrorInfo is data[], not validated, so low risk).
