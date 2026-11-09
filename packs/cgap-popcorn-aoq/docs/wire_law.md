# Wire Law — cgap-popcorn-aoq FrameHeader

> GENERATED from `packs/cgap-popcorn-aoq/ontology.ttl` via `docs/queries/wire_law.rq` + `docs/templates/wire_law.md.tera` (ggen 26.11.5, declarative manifest `docs/ggen.toml`). Generated wins over hand-written; never hand-patch — edit the ontology and re-run `cd docs && ggen sync run`.

The pinned 64-byte `FrameHeader` is the single wire surface across kernel/worker/client. All multi-byte scalars are little-endian.

## Field table (offsets)

Rows projected from `cp:FrameField` individuals (`cp:fieldOf cp:hdr`), ordered by offset.

| offset | end | size | wire | C name | rust | ts | description |
|---|---|---|---|---|---|---|---|

| 0 | 4 | 4 | U32LE | `magic` | `magic` | `magic` | frame magic, pinned 0x52503031 |

| 4 | 6 | 2 | U16LE | `version` | `version` | `version` | layout version, pinned 1 |

| 6 | 8 | 2 | U16LE | `alg_id` | `alg_id` | `algId` | algId seam: 0x0000 keyed-BLAKE3 \\| 0x0001 ML-DSA-65; unknown = typed refusal |

| 8 | 10 | 2 | U16LE | `status` | `status` | `status` | statusCode, default OK (0x5250A001); out-of-band decodes fail-closed |

| 10 | 12 | 2 | U16LE | `flags` | `flags` | `flags` | reserved, zero-on-write, ignored-but-pinned on read |

| 12 | 16 | 4 | U32LE | `frame_seq` | `frame_seq` | `frameSeq` | monotonic per-issuer sequence (mod 2^32) |

| 16 | 48 | 32 | Bytes32 | `binding` | `binding` | `binding` | 32B keyed-BLAKE3 binding of the 229B UnsealedReceipt |

| 48 | 56 | 8 | Bytes8 | `root_prefix` | `root_prefix` | `rootPrefix` | 8B admissions Merkle root prefix |

| 56 | 60 | 4 | U32LE | `payload_len` | `payload_len` | `payloadLen` | reserved for future variable-length annex; zero now |

| 60 | 64 | 4 | U32LE | `fnv1a32` | `fnv1a32` | `fnv1a32` | FNV-1a32 digest over bytes [0x00,0x3C); offset basis 2166136261, prime 16777619 |


Total = 64 bytes (contiguity chain ends at 64 per the ontology's contiguity comment).

## Status constants

Projected from `cp:StatusConstant` individuals.

| constant | value | band/doc |
|---|---|---|

| ALG_ID_KEYED_BLAKE3 | 0 | 229B UnsealedReceipt tier (client) |

| ALG_ID_ML_DSA_65 | 1 | 3309B sealed tier (server trust boundary) |

| VERSION | 1 | layout version, starts at 1 |

| MAGIC | 1380986929 | 0x52503031 |


## Status band (StatusCode closed enum)

Band 0x5250A001..0x5250A009 is closed — out-of-band decodes fail closed. Projected from `cp:StatusCode` individuals.

| code | value |
|---|---|

| scA001 | 1381015553 |

| scA002 | 1381015554 |

| scA003 | 1381015555 |

| scA004 | 1381015556 |

| scA005 | 1381015557 |

| scA006 | 1381015558 |

| scA007 | 1381015559 |

| scA008 | 1381015560 |

| scA009 | 1381015561 |


## Digest law


- FNV-1a32 digest over bytes [0x00,0x3C), stored at offset 60 (4 bytes, U32LE); offset basis 2166136261, prime 16777619.

- A frame whose recomputed FNV-1a32 does not match the trailing 4 bytes fails closed (`DIGEST_MISMATCH`).

## alg_id seam


- `alg_id` at offset 6 (u16 LE): `0x0000` keyed-BLAKE3 | `0x0001` ML-DSA-65; unknown alg_id = typed refusal.


## Seam notes


- header grounding: 64B frame; FNV-1a32 (basis 2166136261, prime 16777619) over bytes [0x00,0x3C), digest at offset 0x3C

- zero-JSON across worker boundary and kernel ABI; binary fixed-width only

- determinism law: generated code wins over hand-written; no wall-clock stamping

- algId upgrade seam: client emits keyed-BLAKE3 (0x0000); ML-DSA-65 seal (0x0001) applies at server trust boundary

