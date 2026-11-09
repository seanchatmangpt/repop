# Hook Registry — cgap-popcorn-aoq closed sets

> GENERATED from `packs/cgap-popcorn-aoq/ontology.ttl` via `docs/queries/hook_registry.rq` + `docs/templates/hook_registry.md.tera` (ggen 26.11.5, declarative manifest `docs/ggen.toml`). Generated wins over hand-written; never hand-patch — edit the ontology and re-run `cd docs && ggen sync run`.

Two closed sets govern the actor surface. Membership below is exhaustive — a name not in a table is a typed refusal, not an extension point.

## HookName (closed set)

| value | name |
|---|---|

| 1 | `OnFrameDecode` |

| 2 | `OnReceiptSeal` |

| 3 | `OnBreach` |


## ActorMessageKind (closed set)

| value | name |
|---|---|

| 1 | `Decode` |

| 2 | `Encode` |

| 3 | `Seal` |

| 4 | `Verify` |

| 5 | `Refuse` |

