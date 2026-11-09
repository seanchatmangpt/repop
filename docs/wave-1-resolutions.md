# repop Wave 1 — Explore Resolutions (read-only fan-out, 20 lanes)

Standing: PARTIAL_ALIVE — 20/20 explore receipts landed 2026-11-08; all findings below are read-only observations with file:line citations in lane reports; no code written yet.

Purpose: shared contract for the Wave-2 Plan fan-out. Each Plan lane owns a section; conflicts resolve here.

## Ground truth from the fleet (validated)

### R1. Bootable BEAM-on-WASM = AtomVM, not Popcorn
- Popcorn has zero fleet presence (E8). The bootable asset is `/Users/sac/unrdf/packages/atomvm`: prebuilt `AtomVM-web-agnostic.wasm` (~0.67MB), `.avm` loader, `coi-serviceworker.js`, JS OTP layer (`src/otp/`, `supervisor-tree.mjs`, `process-broker.mjs`), browser boot proven in vitest-browser tests (E3, E8, E20).
- Constraint: **no erlc on this machine** — no new Erlang module compilation. repop worker = AtomVM wasm + JS OTP shim + cgap kernel FFI. "Popcorn proper" is upstream-fetch, out of scope for v26.11.8.

### R2. cgap reuse map (v26.11.5, no_std, zero-dep) — wasm32-unknown-unknown
- Compiles today: `cgap-core` (64B `CgapFrameHeader` codec, `DmaRing`, checkpoint), `cgap-crypto` (DeltaS 112B, PhiLease 80B, UnsealedReceipt 229B keyed-BLAKE3, Receipt 3538B ML-DSA-65, `keyed_digest`, admissions Merkle root), `cgap-blake3` (scalar wasm path), `cgap-arrow` (IPC1/AOQ1 `emit_verified`/`read_verified`, `StreamWriter`, Batch/BatchBuilder), `cgap-git` (ObjectStore CAS + ref_store + commit_synth LeaseReceipt), `cgap-branchless` (SWAR idioms), `cgap-aoq` (session/KEM/AEAD), `cgap-storage`. (E1, E2, E19)
- Not wasm: `cgap-ffi` (host cdylib — C-ABI shapes reference only), `wire-shm` (unix file I/O — port WIR0 slot format to a SAB-backed transport trait), `cgap-receipt` (std-only), `cgap-verification` (std). (E2, E19)
- Wasm glue precedent: `crates/wasm-footprint` (bump allocator, panic handler, eh stub) — port from wasm32-wasip1 to wasm32-unknown-unknown. (E1, E20)
- cgap justfile:150 already builds `wasm32-unknown-unknown` somewhere — verify which crate. (E20)

### R3. Receipt tiering (the PQC seam)
Client emits 229B `UnsealedReceipt` (keyed BLAKE3, algorithm-ID 0x0000); the 3309B ML-DSA-65 seal (ID 0x0001) applies at a server trust boundary. Algorithm-ID field is the designed upgrade seam. (E19)

### R4. Solver: hyperplane solver is NET-NEW; idioms exist
- Branchless SWAR: `cgap-branchless/src/{swar,select,scan,arithmetic}.rs`; f64 boundary checks not in cgap-core — bench crate has f64 threshold-court patterns (`challenger_sales_court.rs` named consts + `assert_live` anti-pinned). (E15)
- Bench: Divan (not criterion), min-of-7, `CountingAlloc` non-vacuity probe; scalar-oracle differential courts with SplitMix64 seed `0xA20C_0FFE_E5A7_E000`. (E15)
- Warning: hand-SWAR stream-compact LOST 11% to autovectorized code — measure, never claim. (E15)
- `portable_simd` is nightly-only; prefer SWAR/autovector on stable unless a measured win justifies nightly. (E15, E20)

### R5. Worker/SAB boot
- COI/SAB boot chain exists battle-tested: atomvm `service-worker-manager.mjs` + `atomvm-runtime.mjs` (SAB check + graceful reload, lines 154–167). (E20)
- servengine-frontend has NO worker/SAB precedent (E10, E16). COOP/COEP must be added in exactly two spots: `vite.config.ts` `server.headers` (~line 103) and `amplify.yml` `customHeaders` (~line 24). Use `COEP: credentialless` to avoid breaking Google Fonts (E16). **Non-SAB fallback (postMessage) is REQUIRED** — COI is environment-fragile. (E20)
- WIR0 slot format (16B BE header + CRC32 + ordinal, 4KiB slots) = the SAB ring layout; only I/O backing swaps. (E2)

### R6. servengine-frontend integration law (React 19, Vite 7)
- No npm workspaces — linking is path aliases in THREE places: `tsconfig.json` paths, `vite.config.ts` resolve.alias, `vitest.config.ts` resolve.alias. Package shape mirrors `packages/avion` (`@srve/repop`, `main/exports` → raw TS entry). (E6)
- Store template: `src/components/features/Procurement/design/procurementDesignStore.ts` (module singleton + `Set<listeners>` + stable-fallback constants law from `tableFilterStore.ts:9-17`). (E10)
- Tests: unit `.test.tsx` (jsdom project) vs browser `.browser.test.tsx` (vitest browser project, real chromium) — worker/WASM tests MUST be `.browser.test.tsx`. (E6)
- AppProvider composition root in `src/providers/AppProvider.tsx`; RepopProvider slots there. (E6)

### R7. A2A coordinator substrate (a2a-sim)
- Reuse: `DurableTaskStore` monotonic fsync-sealed `ckptSeq` tape + start-or-adopt by flowId + typed refusals + `srveLaw.ts` law-surface pattern (sha256-pinned source, typed verdict unions). (E13)
- Lease/CAS/preemption are extensions: lease table as sibling of checkpoint tape; `withVersion(task, expected, fn)` seam; preemption via `tasks/cancel` + re-send (terminal-state law respected). (E13)
- a2a-sim drives the real app XState machines — coordinator tests integrate with real dispatch law. (E13)

### R8. OCEL ledger shape
- `cgap-ocel2` gives the schema precedent: events/objects/e2o batches, closed activity vocab, 64B TapEvent wire row; std-only — reuse schema, not crate. (E2)
- zoela law: events batch (wide, typed columns), separate `e2o` batch `(event_id, object_id, qualifier)`, never embed object lists in event rows; dictionary-encode enums; hash chain at durability boundary not hot path; derived-projection positioning (never consequence authority). (E12)
- Optional SPARQL-over-ledger: `KGCStore` + oxigraph wasm is worker-safe (append-only, `ConstitutionalViolationError`); cost = Arrow→quad materialization (~3–5d); defer to post-v26.11.8 unless a Plan lane finds it cheap. (E17)

### R9. ggen pack (`cgap-popcorn-aoq`)
- Scaffold: `python3 scripts/new_pack.py cgap-popcorn-aoq --profile projection` (or project if ggen.toml rules wanted). (E5)
- Anatomy to copy: aoq-pack (`pack.toml`, ontology.ttl single pack-scoped IRI, 12 gates/*.rq, witnesses/pass+fail per stem, gate-court.toml `ggen.semantic-gate-witness-court/1`, qualification/verify.py). Pass AND fail witnesses mandatory. (E5, E14)
- TSX template conventions: `{% raw %}` wrap, `"use client"`, `to:` frontmatter, `gc:GenerationSubject` case variants (fix the IRI-mismatch bug seen in ai-chatbot-shadcn-pack). (E18)
- Frontend contracts: mint `sh:NodeShape`s → shacl-to-zod projection for runtime types. (E18)
- Admission sequence (all must pass): `marketplace.py validate` / `catalog ×2 + cmp` / `fingerprint` / `check_gate_witness_courts.py` / `qualify_packs.py` / pytest / ci_plan.py courts. **No `[dependencies]` table in pack.toml** (FM-PACK-014). (E5, E14)
- Pack profile: projection (templates + gates + witnesses). Ship last — needs finalized ABI vocabulary. (E5, E20)

### R10. Build order (E20, adopted)
1. `@repop/abi` — 64B pinned layout, generated single-source-of-truth, precedent `cgap-aoq/src/{header.rs, generated_aoq_header_layout.rs, pin_table.rs}` + TS mirror.
2. Kernel (Rust no_std): CAS + hyperplane solver + 64B receipt emit; deps = cgap-blake3/cgap-branchless/cgap-arrow via **vendored copy** (P28-SIL license decision below).
3. Kernel wasm build (wasm32-unknown-unknown, raw linear-memory/SAB exchange — NOT wasm-bindgen JS objects for the hot path).
4. `@repop/worker` — AtomVM COI boot + kernel instantiation + WIR0-style SAB ring + postMessage fallback.
5. `@repop/client` — headless store per procurementDesignStore pattern + useSyncExternalStore contract.
6. `repop` React package — RepopProvider, useCgapEntity, useHyperplane, useActor, RepopBoundary.
7. `@repop/ggen` pack — parallel from step 1, ships after ABI freeze.
8. Integration into `~/srve/servengine-frontend` + COOP/COEP headers + browser tests.

### R11. OPEN DECISION (coordinator default, Plan lanes may refine but not contradict)
- **cgap license**: default = vendor-copy of needed cgap files into repop carrying LICENSE-P28-SIL.md attribution + URN notice, no path-dependency on the cgap workspace (its coordinator-owned root Cargo.toml and version pins make path deps fragile). repop keeps its own workspace.
- **Determinism**: ggen pack is the generation contract; unrdf codegen only as reference (its `new Date()` stamping violates determinism law — E11).
- **Solver claims**: every perf claim measured with Divan bench + non-vacuity probe; SIMD wins asserted only with receipts.
- **Test law**: Chicago (real collaborators, final-state asserts); worker tests in `.browser.test.tsx`; every court has a mutation leg.

## Per-lane plan ownership (Wave 2)

| Plan lane | Owns | Target repo/dir |
|---|---|---|
| P1 | `@repop/abi` — 64B IntentFrame/HyperplaneRegister/Receipt layouts, Rust + TS mirror + compile-time pin asserts | ~/repop/packages/abi |
| P2 | Kernel: hyperplane solver (SWAR/f64 boundaries, branchless reduction) | ~/repop/kernel |
| P3 | Kernel: CAS version registry + receipt emission (UnsealedReceipt tier, admissions root) | ~/repop/kernel |
| P4 | Kernel wasm build: bump-alloc glue, panic handler, raw C-ABI exports, footprint gate | ~/repop/kernel |
| P5 | Kernel courts: differential scalar-oracle + boundary sweep + mutation legs | ~/repop/kernel/tests |
| P6 | SAB ring: WIR0 slot format port, Atomics-based ring, transport trait split | ~/repop/packages/worker |
| P7 | `@repop/worker`: boot chain (COI service worker port, SAB check + postMessage fallback) | ~/repop/packages/worker |
| P8 | `@repop/worker`: AtomVM integration (wasm asset fetch, .avm load, JS OTP shim bridge to kernel) | ~/repop/packages/worker |
| P9 | Worker message protocol: binary frame router (correlation IDs, receipt dispatch), zero-JSON law | ~/repop/packages/worker |
| P10 | `@repop/client`: headless store (listeners, stable fallback constants, promise map) | ~/repop/packages/client |
| P11 | repop: RepopProvider + worker lifecycle (lazy boot, SSR-safe) | ~/repop/packages/repop |
| P12 | repop: useCgapEntity + useHyperplane hooks (slice selectors, pre-flight solver) | ~/repop/packages/repop |
| P13 | repop: useActor + RepopBoundary (typed refusal/drift/breach containment) | ~/repop/packages/repop |
| P14 | Monorepo scaffolding: pnpm workspace, package.json conventions, tsconfig, build (tsup/bob-analog) | ~/repop |
| P15 | Test infrastructure: vitest projects (unit + browser), playwright smoke, COOP/COEP dev headers | ~/repop |
| P16 | ggen pack: ontology.ttl + pack.toml + namespace law | ~/repop/packs/cgap-popcorn-aoq |
| P17 | ggen pack: gates (12, refusal-class) + pass/fail witnesses + gate-court.toml + verify.py | ~/repop/packs/cgap-popcorn-aoq |
| P18 | ggen pack: TSX/TS/Rust templates (Provider/hooks/boundary/kernel) with GenerationSubject mechanism | ~/repop/packs/cgap-popcorn-aoq |
| P19 | servengine-frontend integration: package placement, 3-way alias wiring, AppProvider slot, COOP/COEP headers, browser test | ~/srve/servengine-frontend |
| P20 | AoQ uplink seam: cgap-arrow emit_verified payload path + pluggable transport (SAB ring in-worker; extracted-quinn deferred), plus demo work-order domain (NTE/GPM/geofence hyperplane config) | ~/repop/packages/worker + demo |

## Laws all Plan lanes inherit
- Read-only Plan output: exact edit plans (files, contents outline, gates), no writes.
- Every lane cites explore receipts (this file + lane findings) for every design claim.
- Chicago testing; no mocks of owned collaborators; courts carry mutation legs.
- Zero-JSON across worker boundary and kernel ABI; binary fixed-width only.
- Fail-closed: unknown frames/stale versions/breaches are typed refusals, never silent.
- Stage explicit paths in any later git commit; coordinator owns git transitions.
- Receipt format: Standing line after H1, gates table with real exits, owned-files list, UNVERIFIED section.
