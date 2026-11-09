# Generation Targets — cgap-popcorn-aoq docs projection

> GENERATED from `docs/targets.ttl` via `docs/queries/targets.rq` + `docs/templates/targets.md.tera` (ggen 26.11.5, declarative manifest `docs/ggen.toml`). Generated wins over hand-written; never hand-patch — edit `docs/targets.ttl` and re-run `cd docs && ggen sync run`.

Each row is one ggen rule in `docs/ggen.toml`: one SPARQL SELECT over the ontology/targets graph, one Tera template, one generated markdown surface under `docs/`. Code targets (`crates/abi/src/generated`, `packages/abi/src/generated`, languages rs+ts) are declared in `../targets.toml` and are downstream lanes' ownership — this table covers the docs projection only.

| doc | template | query | freeze policy | rows projected from |
|---|---|---|---|---|

| `hook_registry.md` | `templates/hook_registry.md.tera` | `queries/hook_registry.rq` | Overwrite: generated wins over hand-written; never hand-patch the output — edit ontology.ttl and re-run ggen sync run | HookName + ActorMessageKind owl:oneOf members |

| `targets.md` | `templates/targets.md.tera` | `queries/targets.rq` | Overwrite: generated wins over hand-written; never hand-patch the output — edit docs/targets.ttl and re-run ggen sync run | cp:DocTarget individuals in docs/targets.ttl |

| `wire_law.md` | `templates/wire_law.md.tera` | `queries/wire_law.rq` | Overwrite: generated wins over hand-written; never hand-patch the output — edit ontology.ttl/targets.ttl and re-run ggen sync run | FrameField (fieldOf cp:hdr) + StatusConstant + SeamNote individuals |

