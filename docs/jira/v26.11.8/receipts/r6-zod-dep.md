# R6 — zod dependency for packages/repop

Standing: ALIVE

Lane: MICRO R6 · repo /Users/sac/repop · closes the UNVERIFIED item in
`docs/jira/v26.11.8/receipts/g2b-landing.md` (TS2307: cannot find module 'zod'
for `packages/repop/src/generated/zodSchemas.ts`).

## Change

- `packages/repop/package.json`: added `"zod": "^4.1.12"` to `devDependencies`
  (servengine-aligned version per P19a preflight). No other keys touched;
  C11's owned file was idle (mtime ~42 min old at edit time, >10 min skip
  threshold, so no lane-collision skip).

## Gates (real exits)

| Gate | Command | Exit | Result |
|---|---|---|---|
| install | `pnpm install --ignore-scripts` (repo root) | 0 | +1 package (zod), 214 resolved |
| typecheck | `pnpm exec tsc --noEmit` (packages/repop) | 0 | TS2307 gone; generated schemas compile against zod v4 |
| tests | `pnpm exec vitest run` (packages/repop) | 0 | 6 files, 25/25 passed (unchanged) |

## Notes

- zod v4 API compatibility of the generated file is confirmed transitively by
  the tsc gate: `generated/zodSchemas.ts` typechecks with zero errors under
  `^4.1.12`. No v3→v4 breaking-change errors observed; no hand-edit to the
  generated file was made or needed (G2b ownership respected).
- pnpm reported pre-existing peer-dependency warnings at workspace scope —
  not introduced by this lane, not investigated here.
