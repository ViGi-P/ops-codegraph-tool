# ADR-003: Interprocedural Dataflow — Variable-Level Vertex Model

**Date:** 2026-06-21
**Status:** Implemented
**Context:** Codegraph's dataflow analysis was intraprocedural (single-function scope) and function-keyed. It could not answer "where does this user input end up?" across call boundaries. This ADR documents the architectural decisions for making it interprocedural with variable-level precision.

---

## Decision

Dataflow analysis is upgraded from **function-keyed** to **variable-level** by introducing **dataflow vertices** — addressable data locations (`param`, `local`, `return`, `receiver`) that belong to enclosing function nodes. Interprocedural stitching rides on the already-resolved `calls` edges rather than ambiguous name-based matching.

Key structural decisions:

1. **Dedicated `dataflow_vertices` table** — variable vertices are never added to `nodes`, to avoid polluting role classification, dead-code detection, fan-in/out, communities, and every graph analytic keyed off `nodes`.
2. **Function summaries** — a `dataflow_summary` table caches `param[i] →* return` intra-reachability per function, enabling interprocedural stitching without full callee inlining.
3. **Backward-compatible `dataflow_fn` view** — the existing function-level edge contract is preserved during migration; all current queries continue working unchanged.
4. **Extend to all 34 supported languages** — the 26 languages with no `DATAFLOW_RULES` today get extraction support.
5. **Decision Point DP-1 resolved at P6** — variable-level output remains opt-in behind `--dataflow`; the default output shape is unchanged. All P1–P5 work shipped independently without a breaking change.

---

## Context

### The problem

`codegraph dataflow` answered function-scoped questions: "what does *this function* pass/return/mutate?" The graph was keyed by functions; data passing *through* a helper, middleware chain, or factory was invisible. The `README.md` documented this as a known limitation:

> **Intraprocedural (single-function scope), not interprocedural** — data flow across call boundaries is not tracked.

The existing visitor already computed the raw material for variable-level summaries (`parameters`, `returns.referencedNames`, binding indices) — but three of the five fact types were thrown away by `insertDataflowEdges`/`collectNativeEdges`. The implementation consumed facts that already existed; it did not start from scratch.

### Existing assets

- **Parameter nodes are already first-class** (`kind: 'parameter'`, linked by `parameter_of` edge and `parent_id`). Variable-level `param` vertices link back to these existing nodes — no new node kind needed.
- **Call edges are already resolved** into the `edges` table (`kind: 'calls'`), via the 6-level import-aware resolver. Interprocedural stitching rides on these proven, high-precision edges — a precision upgrade over the current name-based `flows_to` resolution (top-10 by file/line, ambiguous).

### Languages

8 languages had dataflow rules at the start (JavaScript, TypeScript, TSX, Python, Go, Rust, Java, C#, PHP, Ruby). P5 B1–B5 extended coverage to all 34 supported languages.

---

## Trade-offs

### Costs

1. **Schema migration complexity.** Repointing `dataflow` FKs from `nodes` to `dataflow_vertices` is a potentially breaking change. Mitigated by the backward-compatible `dataflow_fn` view and by treating the DB as a derived cache (a rebuild is always acceptable — codegraph already prompts rebuild when dataflow is missing).

2. **Parity surface grows significantly.** Variable-level facts are far more numerous than function-level. Ordering and deduplication must be deterministic across engines. The parity comparator (`scripts/parity-compare.mjs`) must be extended to diff `dataflow_vertices` + new edge columns (`scope`, `call_edge_id`).

3. **Performance / DB size.** A variable graph can be 10–50× more edges than the function graph. Hard per-function vertex caps, `MAX_WALK_DEPTH`, and indexed `(func_id, kind)` lookups are mandatory before enabling by default. `bench-check` baseline required before/after each phase.

4. **26 new language extractors.** Each requires `DATAFLOW_RULES` in TS + a `DataflowRules` static + `ParamStrategy` in Rust, with fixtures and parity gate. Functional languages (Haskell, OCaml, F#, Gleam, Elixir, Erlang, Clojure) need a `TailExpression` return strategy — no `return_node` exists in these grammars. Declarative languages (HCL/Terraform, Verilog) may yield low-value output; implementation vs explicit exclusion is decided per language during that batch.

5. **Worker-protocol serialization seam.** Any new `ExtractorOutput` field (e.g. `dataflowVertices`) not added to `SerializedExtractorOutput` in `wasm-worker-{protocol,entry,pool}.ts` is silently dropped at the Worker thread boundary — the canonical parity divergence risk in this codebase.

### Benefits

1. **Cross-boundary taint tracking.** `dataflow path <src> <dst>` and `dataflow --impact` traverse a precise variable graph across function and file boundaries — the core ask for security audits and refactor impact.

2. **Precision upgrade.** Stitching on resolved `calls` edges eliminates the ambiguous name-based `flows_to` matching (top-10 by proximity). Call-resolution precision directly bounds dataflow precision.

3. **No limitation in README.** The "intraprocedural only" caveat was removed at P6, reflecting a genuinely resolved limitation.

4. **Full language coverage.** Taint analysis works for all 34 languages, not just the 8 with rules today.

---

## Target Architecture

### Variable-level vertices

| Vertex kind | Identity | Source |
|-------------|----------|--------|
| `param` | (func_id, param_index) | Reuse existing `parameter` nodes; set `node_id` link |
| `local` | (func_id, name, decl_line) | New — from `assignments`/`var_declarator` |
| `return` | (func_id) | New — one per function with a return value |
| `receiver` | (func_id) | New — `this`/`self` for mutation tracking (optional, Phase 3) |

Vertices live in `dataflow_vertices(id, func_id, kind, name, param_index, line, node_id)` — not in `nodes`.

### Edge taxonomy

| Edge kind | Scope | Meaning |
|-----------|-------|---------|
| `def_use` | `intra` | `param→local`, `local→local`, `*→return` within one function |
| `arg_in` | `inter` | Caller arg-vertex → callee `param[j]` vertex at a resolved call site |
| `return_out` | `inter` | Callee `return` vertex → caller capture-vertex |
| `mutates` | `inter` | Callee mutates arg — propagated back to caller vertex |

`call_edge_id` links each inter-edge to the `edges` row it was stitched from (precision provenance).

### Stitching algorithm

Post-pass after all per-file intra edges and summaries exist:

```
for each resolved call edge A --calls--> B:
    for each argFlow at that call site (argIndex=j, sourceVertex=x):
        emit  dataflow(x → B.param[j],  kind='arg_in',    scope='inter')
        if B.summary.param[j].flows_to_return:
            emit dataflow(B.return → v,  kind='return_out', scope='inter')
        if B.summary.param[j].is_mutated:
            emit dataflow(x → x,         kind='mutates',    scope='inter')
```

Where `v` is the caller's capture vertex for `B(...)`.

### Backward-compatible view

```sql
CREATE VIEW dataflow_fn AS
  SELECT sv.func_id AS source_id, tv.func_id AS target_id,
         d.kind, d.param_index, d.expression, d.line, d.confidence
  FROM dataflow d
  JOIN dataflow_vertices sv ON d.source_vertex = sv.id
  JOIN dataflow_vertices tv ON d.target_vertex = tv.id
  WHERE sv.func_id != tv.func_id;
```

Existing `dataflowData`/`dataflowPathData`/`dataflowImpactData` queries and MCP tool continue working during migration.

---

## Delivery

Each phase shipped independently behind the existing `--dataflow` flag.

| Phase | Deliverable | Status |
|-------|-------------|--------|
| **P0** | Schema finalization, migration, parity-comparator extension, worker-protocol fields. Prototype on a single JS fixture end-to-end. | ✅ PR #1608 |
| **P1** | `dataflow_vertices` + intra `def_use` edges + summaries. Both engines. `dataflow_fn` view. | ✅ PR #1608 |
| **P2** | `arg_in`/`return_out`/`mutates` inter stitching; cross-file; new variable-path queries. | ✅ PR #1608 |
| **P3** | Python, Go, Rust, Java, C#, PHP, Ruby variable model + stitch. | ✅ Covered by P1/P2 — vertex machinery is language-agnostic; all 8 languages with `DATAFLOW_RULES` gained the vertex model automatically |
| **P4** | Cross-file re-stitch on incremental builds; perf caps + benchmarks. | ✅ PRs #1615, #1635 |
| **P5 B1** | New languages — C/C++/ObjC/CUDA dataflow rules + `nameExtractor` extension. | ✅ Standalone commit (ee525180) |
| **P5 B2–B5** | New languages — JVM/mobile, scripting, functional, systems/DSL (18 languages). | ✅ Standalone commit (0d8039cc) |
| **P6** | CLI/MCP polish, docs, README limitation removed. DP-1 resolved. | ✅ PR #1617 (README); DP-1 resolved as opt-in (see below) |

---

## Decision Point DP-1 — Variable-Level Default vs Opt-In

**Resolved at P6: variable-level output stays opt-in behind `--dataflow`.**

The P4 benchmarks showed that vertex-level graphs are significantly larger than function graphs on real repos. Replacing the default output shape would be a breaking change with non-trivial DB-size and build-time impact. DP-1 was resolved to keep the existing default unchanged: `codegraph dataflow` continues emitting function-level edges; variable-level vertices and inter-edges are available when `--dataflow` is passed. All P1–P5 work shipped without a breaking PR.

---

## Alternatives Considered

| Alternative | Why rejected |
|-------------|-------------|
| **Add variable vertices to `nodes`** | Pollutes role classification, dead-code detection, fan-in/out, communities, complexity, and every graph analytic keyed off `nodes`. A dedicated table keeps the analytical layer clean |
| **Keep function-keyed, add cross-function BFS** | Ambiguous name matching (`flows_to` uses top-10 by proximity) gives low precision at call boundaries. Riding on resolved `calls` edges is architecturally superior and reuses the work already done by the 6-level import resolver |
| **Single-level interprocedural only** | Variable-level is required for precise taint paths — knowing that `param[2]` of function A reaches `param[0]` of helper B is what makes a taint report actionable. Function-level only tells you A calls B |
| **Full type inference (TypeScript compiler, etc.)** | External heavy dependency; not in scope. The visitor's existing `parameters`/`returns`/`argFlows` facts are sufficient for the IFDS-style summary approach |
| **WASM-only first, then native** | CLAUDE.md mandates identical output from both engines. Implementing TS first and deferring the Rust mirror creates a window where the tool is in a parity-broken state; mirror module-by-module per the mirrored-engine-layout convention instead |

---

## Decision Outcome

The variable-level vertex model with a dedicated `dataflow_vertices` table, function summaries, and stitching on resolved `calls` edges is the canonical architecture for interprocedural dataflow in codegraph. The backward-compatible `dataflow_fn` view delivered a non-breaking path through P5. DP-1 was resolved at P6 in favor of keeping variable-level opt-in.

All phases shipped both WASM and native engine implementations, gated by `/parity`. The worker-protocol serialization seam was a required checklist item on every phase PR.
