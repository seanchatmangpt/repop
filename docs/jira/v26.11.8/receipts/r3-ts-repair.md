# R3 TS Repair — Residual Sweep (DRAIN, second pass)

Standing: PARTIAL_ALIVE

Date: 2026-11-08, ~15:32–15:35 JST. Repo: /Users/sac/repop (NOT a git repo — working tree only; no commit/SHA receipt possible).

## Per-package gate table (`npx tsc --noEmit`, un-piped rc)

| Package | rc | Errors | Note |
|---|---|---|---|
| packages/abi | 0 | 0 | clean |
| packages/client | 0 | 0 | clean — dispatch's named lifecycle.test.ts narrowing errors do NOT reproduce (fixed by C10's landing; premise rot confirmed) |
| packages/worker | 0 | 0 | clean |
| packages/repop | 2 | 10 | all 10 in `src/RepopBoundary.test.tsx` (TS6192 ×2, TS6133 ×8, unused imports/bindings) |

## Fixed

None. Zero lawful repairs existed at sweep time.

## Skipped (loudly, with reasons)

| File | Dispatch target | Why skipped |
|---|---|---|
| packages/client/src/lifecycle.test.ts | narrowing errors | mtime 15:22 (<10 min, HOT) AND already clean under tsc — owning lane's landing resolved it |
| packages/repop/src/RepopProvider.tsx | TS6133 | mtime 15:24 (HOT) AND already clean |
| packages/repop/src/useActor.test.tsx | TS1005 syntax | mtime 15:30 (HOT) AND already clean |
| packages/repop/src/hooks/useCgapEntity.test.tsx | TS1005 syntax | mtime 15:18 (~15 min, cold) but already clean — nothing to repair |
| packages/repop/src/selector.test.tsx | stale-API errors | mtime 15:32 (HOT, touched during this sweep) AND already clean |
| packages/repop/src/index.ts | export-type errors | mtime 15:18 (cold) but already clean — nothing to repair |
| packages/repop/src/RepopBoundary.test.tsx | not in dispatch scope | mtime == NOW (15:34:02, actively written during sweep), no owning receipt found (`grep -l RepopBoundary docs/jira/v26.11.8/receipts/*.md` = 0 hits). Un-owned + in-flight = do not touch. This is the SOLE remaining error source (10 errors). |

Also confirmed in-flight-hot (expected, excluded): `packages/abi/src/generated/layout.ts`, `packages/worker/src/protocol/frame.test.ts`, plus `no-react.test.ts`, `client-seam.ts`, `useActor.ts`, `store/repopClient.ts`.

## Findings

1. Dispatch's error inventory is stale: every named repair target already compiles clean. The owning lanes (C10, C6b, C7) fixed their residuals during landing. Premise rot — the honest action was re-verification, not re-repair.
2. One pipe-masked gate reading (first pass reported exit=0 via `tail` pipe; un-piped re-run exposed repop rc=2). Recorded per fail-loud discipline.
3. Residual debt: `RepopBoundary.test.tsx` 10 unused-import errors on an UN-OWNED, actively-written file — no receipt claims it. Flagging for coordinator: assign ownership before next repair wave.

## UNVERIFIED

- RepopBoundary.test.tsx will resolve once its writing lane lands (its imports may be used by the time it finishes). No repair attempted, per scope law.
