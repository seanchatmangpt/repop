# R5 — hook-test residuals (final repair lane)

Standing: PARTIAL_ALIVE — full gates green this session (commands+exits below); residuals were NOT repaired by rewrite because both were already closed upstream before this lane's first edit (premise-rot finding, see below). Court non-vacuity proven by shim-court with byte-exact restore.

## Premise-rot finding (why no rewrite)

The dispatch flagged `useCgapEntity.test.tsx` (TS1005 parse error) and `useHyperplane.test.tsx` (memo court failing) as unowned-red, citing C11/C12 receipts. On disk this session:

- `packages/repop/src/hooks/useCgapEntity.test.tsx` parses clean (tsc exit 0 over the package; file mtime 15:18, ~25min pre-flight-safe).
- `useHyperplane.test.tsx` (mtime 15:33, 597s at pre-flight — just under the 10-min fence; crossed it by edit time; no lane writing — full gates ran clean twice) passes 3/3 including the memo identity court.
- C11's own landed receipt (`c11-repop-package.md`) already showed the owned set green (13/13 at 15:34:46) and named the reds as P13's RepopBoundary files — which P13 has since closed (7/7 green this run). The substrate moved under the R5 dispatch between flag-time and land-time.

Per premise-rot law, the honest fix was re-verifying, not rewriting green files.

## Gates (real runs, 2026-11-08)

| Gate | Command (in `packages/repop`) | Exit | Result |
|---|---|---|---|
| Type | `pnpm exec tsc --noEmit` | 0 | 0 errors |
| Unit | `pnpm exec vitest run` | 0 | 25/25, 6 files (C11 13 + C12 12 + residuals inside) |
| Residuals | `pnpm exec vitest run src/hooks/useCgapEntity.test.tsx src/hooks/useHyperplane.test.tsx` | 0 | 6/6 |
| Mutation leg (memo identity) | sed `}, [client, register, point]);` → `[client, register, point, Math.random()]` in `useHyperplane.ts` | vitest 1 failed | court flipped red → non-vacuous |
| Restore | `cp` from backup, sha256 | — | `a572056d43eb2e0ba5ec29dd446cd9ab1bd9f3c04e4b6e8555cfea1927af4106` byte-exact pre/post |
| Mutation leg (C11 guard-throw) | not re-run this lane | — | C11 receipt documents it ALIVE |

## Owned files

None written/modified permanently. Temporary shim to `useHyperplane.ts` reverted byte-exact (sha256 above).

## Mutation-leg discipline

Kept existing legs live: C11's guard-throw leg documented in its receipt; this lane added the memo-identity mutation leg named above (no new courts authored, so no additional mutation names owed).

## UNVERIFIED

- The adapter from C11's structural RepopClient to landed `@repop/client` RepopClientStore (carried from C11 receipt — unchanged by this lane).
- `solverMirror` producer — no producer landed yet; hook contract consumed as-is.
