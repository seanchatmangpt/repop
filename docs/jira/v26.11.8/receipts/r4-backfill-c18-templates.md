# R4 Backfill: C18 templates

Standing: PARTIAL

## Census

LANDED-WITHOUT-RECEIPT (settled ~15:41).

## Files owned (on disk, no receipt existed)

- packs/cgap-popcorn-aoq/templates/: abi_kernel.rs.tmpl, abi_mirror.ts.tmpl,
  repop_boundary.tsx.tmpl, repop_provider.tsx.tmpl, use_cgapp_entity.ts.tmpl,
  use_hyperplane.ts.tmpl, worker_boot_vocab.ts.tmpl (7 templates)

## Gate (run by R4)

- No render/determinism gate exists on disk — searched scripts/ and
  packs/cgap-popcorn-aoq/scripts/ for any renderer or determinism check; none found.
  Template determinism is therefore UNVERIFIED, not PASS.

## Findings (real, not repaired)

1. Missing mechanical gate: no template render/determinism court anywhere in the
   repo. The C18 surface is files-present-only. A render-twice-diff court is needed
   before determinism can be claimed.

## Notes

Attests current disk state. Re-dispatch list + maxStaleRetries decision: r4-census.md.
