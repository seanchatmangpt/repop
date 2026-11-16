# repop fleet-integration wave — resolutions (X-wave synthesis)

Standing: PARTIAL_ALIVE — 19/20 explore receipts landed; Y1/Y2/YX repairs+survey in flight.

## Ranked seams (X20, adopted)

- S1 RP9F↔A2A v1.0 bridge (first): TS adapter in packages/worker/src/protocol/a2a.ts;
  REFUSE→ErrorInfo (reason+metadata.detail, -32001 collision documented — reason is
  discriminator); INTENT_RESOLVED→Task terminal mapping per ash_a2a json.ex state table.
  Cross-repo round-trip court deferred; fixture vectors pinned from json.ex vocabulary.
- S2 OCEL→beam4pm (second): packages/worker/src/ocel/export.ts — u16→vocab strings,
  {id,type,time,attributes,relationships[{objectId,qualifier}]} shape per
  beam4pm_ocel_ingest.ex decode law; vocab crosswalk in ONE pinned file per side with
  sha drift detection (srveLaw pattern); receipt chains NOT conflated (repop receipts
  stay payload attributes).
- S3 wasmex host (third, gated on experiment): beam4pm_repop.ex facade cloned from
  beam4pm_tract.ex pattern; kernel is raw C-ABI — simpler than graphlaw (no
  __wbindgen shadow stack; empty import map passes EngineLoad admission trivially).
  PRECONDITION: verify wasmex 0.15 loads wasm32-unknown-unknown (X20's biggest unknown).
- S4 marketplace admission: unblock-only, no build (upstream xstate-v5 red).
- S5 worker-bundle build + boot-smoke: cheap closure, unblocks S1 substrate.

## Additional adopted findings

- smalt: substrate.sh + shim_court/lib.sh + NO_SLEEP_DOCTRINE import verbatim;
  receipt_standing_lint.py port near-zero cost (repop convention currently manual).
- xaas: first FE↔BEAM seam = worker→postMessage→TanStack Query→Ash RPC
  (new rpc_action; familyFlags gate flips only after witness court); sjira mapping
  via Xaas.Pack.admit/3 (plane_kind→requires_capability, binding→graph_digest);
  ReceiptSealed OCEL event class already exists.
- arcus: mmap-arena SPSC producer pattern (cmd/arcus_e2e_producer); EA graph
  QUALIFIED-PENDING promote-by-rename contribution path; exclusion-zone law —
  generated surfaces checksum-frozen, never hand-edit.
- beam4pm tamper tier: FNV-1a32 nonconforming (X2/X12) — Y2 upgrade in flight;
  ingest recipe: OcelAccumulator.ingest/2 + sibling repop chain verifier +
  verify_vocabulary/2 with pinned manifest.
- pack: family modules staged via build/graph.ttl concat (FM-CONFIG-003); gates .rq
  only; cross-repo vocab via ontology-level imports + extra_ontologies (greene
  precedent), requires URNs lawful, [dependencies] refused; cp:subject +
  StatusCode labels + targets.toml drift = admission preconditions.

## Laws

- Zero-JSON holds worker-side; JSON exists only at the A2A/HTTP boundary.
- No receipt-chain conflation (repop receipts = payload attributes in fleet logs).
- Every cross-repo vocab table: one pinned file per side + sha drift court.
- Cross-repo vendored copies carry attribution + conformance court (KAT law —
  keyed_blake3 drift row is the cautionary precedent).
- blake3 is the ecosystem canonical-graph digest (GraphLaw precedent) — sha256
  fleet convergence question owned by the YX survey (operator-directed).
- Plan lanes read this file + cited X receipts; construct lanes land with courts.

## YX verdict (sha256→BLAKE3, operator-directed survey) — parked as named track

Per-class verdicts adopted as the conversion law: zcode port law = don't-convert
unless zcode-cli locksteps (lockstep strictly cheaper: 2 fixture receipts + 1
manifest vs KD divergence row); ReceiptChain = dual-hash window (per-receipt
hash_algorithm, verify per recorded algorithm); pinned formulas + wire
passthroughs + license HMAC = don't-convert (law/contract change, not impl);
internal content digests (~14 sites) = injectable Beam4PM.Digest seam;
Standing.Chain = extend dispatch + lazy ledger migration. No native Elixir
blake3 in fleet — canonical ref is repop kernel vendor/keyed_blake3.rs (KAT
unproven — its conformance court is a precondition for any conversion).
Migration order + ~25-30 court actions per YX receipt. NOT dispatched this
window: needs zcode-cli lockstep coordination + repop blake3 KAT first.
