# code-alignment — repop v26.11.17

Standing: PASS

## Identity
- Path: `/Users/sac/repop`
- Branch at generation: main
- HEAD: 6a17bb28a7c21aaebc9f340bed0f5bbb2d70dc2f
- Tracked files: 389
- Tracked docs markdown: 95

## Build manifests (tracked at the commit above)
- `package.json`
- `justfile`

## Top-level layout (tracked file counts)
- `.`: 12
- `.run`: 2
- `docs`: 96
- `kernel`: 41
- `packages`: 137
- `packs`: 86
- `playwright`: 3
- `scripts`: 12

## Prior doc waves
- `docs/jira/v26.11.8`
- `docs/jira/v26.11.16`

## Falsifiers
- Any tracked path above absent at HEAD, or a count differing from `git ls-files`.
- HEAD sha not equal to or an ancestor of the live HEAD.

## Acceptance
```bash
python3 ~/zcode-cli/scripts/docs_v261117.py validate /Users/sac/repop
```
Expected: exit 0 and `PASS`.

## See Also
- `~/zcode-cli/scripts/docs_v261117.py`
