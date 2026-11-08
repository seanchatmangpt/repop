# G1 — repop-abi layout vs cgap-popcorn-aoq ontology reconciliation

Standing: PARTIAL

## Scope + lane ownership

- Lane G1 (maximize ggen usage). Read-only on `kernel/` and `packs/`; owns
  only this receipt + `/Users/sac/repop/scratch/g1-abi-reconcile/`.
- Landed kernel truth: `/Users/sac/repop/kernel/crates/repop-abi/src/layout_spec.rs`
  (landed by C1; cargo test 17/17 per wave dispatch, not re-run by G1).
- C16 ontology: `/Users/sac/repop/packs/cgap-popcorn-aoq/ontology.ttl` —
  exists (13.7KB) but its own header says `Standing: UNVERIFIED (offsets-vs-P1
  reconciliation pending)`, and file content changed between two reads this
  session (label wording drifted between the Read and the ggen render — C16
  is mid-write). Therefore Standing PARTIAL; the reconciled pins below are
  the registry of truth for C16 to adopt.

## ggen commands + real exits

| command | exit | evidence |
|---|---|---|
| `ggen --version` | 0 | `ggen 26.11.5` |
| `ggen sync run` (scratch manifest) | 1 | `[FM-LAW-015]`: EA gate, no `ea.graph.json` |
| `ggen sync run --skip-ea-admission` | 1 | `[FM-GEN-008]`: `r.band2` never bound |
| `ggen sync run --skip-ea-admission` (fixed) | 0 | JSON `written: 2 files`, hash `688c…b8aa` |

Scratch pipeline: declarative-schema `ggen.toml`, `queries/fields.rq` (10
FrameField rows, ORDER BY ?offset), `queries/constants.rq` (4 StatusConstant
rows), Tera -> `out/generated_layout.rs` + `out/generated_constants.rs`.
Closure hashes in the sync JSON; chain receipt-log at scratch `.ggen-v2/`
(`payload_hash_hex d5124e13…efca34d`, andon Green).

## Structural mismatch (gating)

The ontology models **one** 64B `FrameHeader` (cgap-aoq lineage: magic
0x52503031, `cp:hdr` with 10 field rows). The landed kernel pins **three**
64B frames (`INTENT_FIELDS` 11 rows, `HYPERPLANE_FIELDS` 12 rows,
`RECEIPT_FIELDS` 9 rows). A single-header field table cannot express the
landed ABI; C16 must restructure to per-frame tables (`fieldOf` per frame
individual, e.g. `cp:hdrIntent / cp:hdrHyperplane / cp:hdrReceipt`).

## Offset/width diff — ontology row vs layout_spec.rs

Ontology rows (single header) diffed against the three landed frame tables;
"closest" = landed frame sharing the field's role.

| field | ontology | closest spec row | verdict |
|---|---|---|---|
| magic | (0,4,u32) 0x52503031 | per-frame u16@0: 0x4946 / 0x4850 / 0x5246 | MISMATCH |
| version | (4,2,u16) | (2,2,u16) all frames | MISMATCH offset |
| alg_id | (6,2,u16) | Receipt alg_id (4,2,u16) | MISMATCH offset |
| status | (8,2,u16) OK | — | EXTRA (no status wire field; band is enum/gate layer) |
| flags | (10,2,u16) | (6,2,u16) all frames | MISMATCH offset |
| frame_seq | (12,4,u32) | (56,2,u16) Intent+Receipt | MISMATCH |
| binding | (16,32,bytes32) | Receipt binding (8,32,bytes) | MISMATCH offset |
| root_prefix | (48,8,bytes8) | Receipt root_prefix (40,16,bytes) | MISMATCH |
| payload_len | (56,4,u32) | Receipt payload_len (58,2,u16) | MISMATCH |
| fnv1a32 digest | (60,4,u32) | digest (60,4) all frames | MATCH |
| FNV basis | 2166136261 | FNV1A32_OFFSET_BASIS | MATCH |
| FNV prime | 16777619 | FNV1A32_PRIME | MATCH |
| VERSION | 1 | LAYOUT_VERSION 1 | MATCH |
| ALG_ID_KEYED_BLAKE3 | 0 | 0x0000 | MATCH |
| ALG_ID_ML_DSA_65 | 1 | 0x0001 | MATCH |

Summary: 6 of 10 field rows mismatch (offset and/or width); 1 extra field
(`status`); 5 constant pins match (digest pos, FNV basis/prime, layout
version, both alg IDs).

## Fields in layout_spec.rs with NO ontology row

IntentFrame: `intent_kind`, `hyperplane_id`, `threshold` f64, `weight` f64,
`issuer` 8B, `payload_binding` 16B, `reserved`. HyperplaneRegister:
`plane_kind`, `plane_id`, `normal_x/y/z` f64, `offset` f64, `binding` 8B,
`epoch`, `reserved`. The `cp:Hyperplane` class models solver config, not the
wire frame.

## Registry of truth for C16 to adopt (layout_spec.rs, cargo test 17/17)

- Three frames, each 64B, align 64; LAYOUT_VERSION = 1 (all).
- IntentFrame (magic 0x4946): magic(0,2) version(2,2) intent_kind(4,2)
  flags(6,2) hyperplane_id u64(8,8) threshold f64(16,8) weight f64(24,8)
  issuer 8B(32,8) payload_binding 16B(40,16) frame_seq(56,2) reserved(58,2).
- HyperplaneRegister (magic 0x4850): magic(0,2) version(2,2) plane_kind(4,2)
  flags(6,2) plane_id u64(8,8) normal_x f64(16,8) normal_y f64(24,8)
  normal_z f64(32,8) offset f64(40,8) binding 8B(48,8) epoch(56,2)
  reserved(58,2).
- ReceiptFrame (magic 0x5246): magic(0,2) version(2,2) alg_id(4,2) flags(6,2)
  binding 32B(8,32) admissions_root_prefix 16B(40,16) frame_seq(56,2)
  payload_len(58,2) digest FNV-1a32(60,4).
- Digest law: FNV-1a32 over [0x00,0x3C) at 60, basis 2166136261, prime
  16777619 — shared across all three frames.
- alg_id seam: 0x0000 keyed-BLAKE3 (client tier), 0x0001 ML-DSA-65 (server
  trust boundary) — ontology constants already match; keep.
- Status band 0x5250A001..0x5250A009 is not a wire field; keep it in the
  enum/gate layer, out of the FrameField table.
- The scratch queries work verbatim against a corrected per-frame ontology;
  rerun `ggen sync run --skip-ea-admission` from the scratch dir, or fold the
  scratch ggen.toml shape into the pack once P17/P18 templates land.

## UNVERIFIED / caveats

- `cargo test 17/17` taken from the wave dispatch (kernel is C1's lane).
- Ontology changed mid-session under me (label wording between Read and
  render); diff is against the graph at closure hash of the last sync —
  re-diff after C16 lands.
- The 12 gate files declared in pack.toml do not exist yet (P17's lane);
  not diffed here.
- Marketplace admission of the pack not attempted (P17/coordinator scope;
  ontology header says admission deferred).
