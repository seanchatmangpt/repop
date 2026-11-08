# License: P28 Source-Intermediate License (P28-SIL)

Copyright (c) 2026 the repop contributors.

## 1. Definitions

- **Source-Intermediate**: the kernel Rust sources vendored into
  `kernel/crates/` (the "Vendored Copy"), being a copy of files originating
  from the cgap workspace (`~/cgap/crates/*`), carried into this repository
  per Wave-1 resolution R11.
- **This Repository**: the repop monorepo, comprising everything under the
  repository root except the Vendored Copy.

## 1. Grant

This repository's own code is licensed for any use, including commercial use,
modification, and redistribution, subject to the attribution conditions in
Section 3.

## 2. Vendored Copy terms

The Vendored Copy is redistributed under its upstream license (P28-SIL) as a
convenience copy. It is **not** a path dependency on the cgap workspace; repop
keeps its own Rust workspace at `kernel/` (R11: no path-dependency on the cgap
workspace). Upstream cgap is the canonical source of the vendored files;
upstream fixes do not propagate automatically — maintenance of the vendored
copy is repop's responsibility.

## 3. Attribution conditions

Any redistribution or derivative of the Vendored Copy MUST:

1. Carry this `LICENSE-P28-SIL.md` file unmodified.
2. Carry the `NOTICE` file at the repository root, unmodified in its
   attribution portion.
3. Retain the vendored provenance URN (`urn:repop:vendor:cgap:<sha>` recorded
   in NOTICE) so the vendored copy's upstream identity is replayable.

## 4. Warranty

The whole work is provided "AS IS", without warranty of any kind.
