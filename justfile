# repop root justfile — C15 lane (wave v26.11.8)
# Thin wrappers over package.json scripts / scripts/verify.sh (P15 D5).
# C15 owns these recipes; other lanes append per-lane modules
# (justfile.d/NN-*.just + one import line) rather than editing this file.

default:
    @just --list

# jsdom unit project
test:
    npx vitest run --project unit --passWithNoTests

# real-chromium browser project
test-browser:
    npx vitest run --project browser

# playwright COI + boot smoke
test-smoke:
    pnpm exec playwright test --config playwright.smoke.config.ts

# aggregate gate chain — exit law 0 green / 1 red / 2 infra / 3 loud skip
verify:
    bash scripts/verify.sh

# aggregate chain + kernel courts (kernel/justfile:19, P5's runner)
verify-aggregate:
    just verify && just -f kernel/justfile courts
