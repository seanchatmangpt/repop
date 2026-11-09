# R4 Backfill: C11 provider/hooks (packages/repop)

Standing: PASS

## Census

LANDED-WITHOUT-RECEIPT (settled ~15:41; gates run post-settlement).

## Files owned (on disk, no receipt existed)

- packages/repop/src/RepopProvider.tsx, RepopBoundary.tsx, context.ts, types.ts,
  errors.ts, index.ts, client-seam.ts, useActor.ts, useRepopClient.ts,
  useRepopSelector.ts
- packages/repop/src/hooks/ (useHyperplane etc.)
- packages/repop/src/provider.test.tsx, RepopBoundary.test.tsx, selector.test.tsx,
  useActor.test.tsx
- packages/repop/src/test-support/

## Gate (run by R4)

- `pnpm run typecheck` — exit 0 (packages/repop tsc --noEmit clean).
- `pnpm test` (vitest unit project) — packages/repop tests all pass
  (3 workspace failures confined to packages/worker ring, C6b surface — not this lane).

## Findings

None on C11's own surface.

## Notes

Attests current disk state only. Re-dispatch list + maxStaleRetries decision:
r4-census.md.
