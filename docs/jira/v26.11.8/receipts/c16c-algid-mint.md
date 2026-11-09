# C16c — alg_id cp:value mint + court re-run

Standing: ALIVE

## Change

`packs/cgap-popcorn-aoq/scripts/gen_ontology.py` line 77: `frameReceipt` `alg_id`
row pinned value `None` → `ALG_BLAKE3` (0x0000, keyed-BLAKE3 client emission tier
per the C1/R3 seam law; 0x0001 is server-boundary, not minted client-side).
Ontology regenerated via the generator — no hand-edit of the .ttl.

## Gates

- `python3 packs/cgap-popcorn-aoq/scripts/self_check.py` (repo root) → exit 0,
  ALL_GATES_PASS, 638 triples, all FRAME/ENUM/BAND/CONST/SHAPES gates green.
- `python3 packs/cgap-popcorn-aoq/qualification/verify.py` (repo root) → exit 0,
  verdict CONFORMANT, 8/8 FLIP-OK including gate 050_alg_id_closure.

## Determinism

Two regens + tree copy byte-identical (`cmp` clean, /tmp/regen1.ttl ==
/tmp/regen2.ttl == packs/cgap-popcorn-aoq/ontology.ttl).

## sha256

- before: `9fe01e153dd39bbc68e201239e338bd43aee54f8ea3188e25fcbf6a151ca4a12`
- after:  `94c7576f0883b7854a29ed165e1ca9ce92f4d1c6dd1b367fb927b559528464f5`

## Diff

- `packs/cgap-popcorn-aoq/scripts/gen_ontology.py` (1 line)
- `packs/cgap-popcorn-aoq/ontology.ttl` (regenerated)

Commands/exits: as above, all exit 0. No test regressions observed.
