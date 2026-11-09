# R4 Backfill: C20 uplink/ocel/demo

Standing: PARTIAL

## Census

LANDED-WITHOUT-RECEIPT — partially. Demo surface is on disk; no ocel or uplink
artifacts were found anywhere in packages/ or packs/ (searched *ocel*, *uplink*).

## Files found on disk

- packs/cgap-popcorn-aoq/servengine-projection/queries/: demo.rq, headers.rq,
  aliases.rq, slot.rq
- packs/cgap-popcorn-aoq/servengine-projection/templates/: demo-route.snippet.tsx.tera,
  demo-route-test.snippet.tsx.tera, app-provider-slot.snippet.tsx.tera,
  server-headers.snippet.ts.tera, vitest/vite-alias snippets,
  amplify-custom-headers.snippet.yml.tera
- packs/cgap-popcorn-aoq/docs/: ggen.toml, targets.ttl, targets.md, wire_law.md,
  hook_registry.md

## Gate (run by R4)

- `pnpm run typecheck` — exit 0 (all packages clean).
- No ocel/uplink-specific gate exists (no matching artifacts to gate).

## Findings (real, not repaired)

1. MISSING: no ocel artifacts and no uplink artifacts on disk. The lane's declared
   scope (uplink/ocel/demo) is only ~1/3 present (demo). This lane is classified
   PARTIAL LANDED — remainder belongs on the re-dispatch list.

## Notes

Attests current disk state. Re-dispatch list + maxStaleRetries decision: r4-census.md.
