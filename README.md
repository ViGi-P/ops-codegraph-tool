<p align="center">
  <img src="https://img.shields.io/badge/codegraph-dependency%20intelligence-blue?style=for-the-badge&logo=graphql&logoColor=white" alt="codegraph" />
</p>

<h1 align="center">codegraph</h1>

<p align="center">
  <strong>Always-fresh code intelligence for AI agents — sub-second incremental rebuilds, zero-cost by default, optionally enhanced with your LLM.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@optave/codegraph"><img src="https://img.shields.io/npm/v/@optave/codegraph?style=flat-square&logo=npm&logoColor=white&label=npm" alt="npm version" /></a>
  <a href="https://github.com/optave/codegraph/blob/main/LICENSE"><img src="https://img.shields.io/github/license/optave/codegraph?style=flat-square&logo=opensourceinitiative&logoColor=white" alt="Apache-2.0 License" /></a>
  <a href="https://github.com/optave/codegraph/actions"><img src="https://img.shields.io/github/actions/workflow/status/optave/codegraph/codegraph-impact.yml?style=flat-square&logo=githubactions&logoColor=white&label=CI" alt="CI" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node >= 20" />
  <img src="https://img.shields.io/badge/graph-always%20fresh-brightgreen?style=flat-square&logo=shield&logoColor=white" alt="Always Fresh" />
</p>

<p align="center">
  <a href="#-why-codegraph">Why codegraph?</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-features">Features</a> •
  <a href="#-commands">Commands</a> •
  <a href="#-language-support">Languages</a> •
  <a href="#-ai-agent-integration">AI Integration</a> •
  <a href="#-recommended-practices">Practices</a> •
  <a href="#-ci--github-actions">CI/CD</a> •
  <a href="#-roadmap">Roadmap</a> •
  <a href="#-contributing">Contributing</a>
</p>

---

> **Free. Open source. Fully local.** Zero network calls, zero telemetry. Your code stays on your machine. When you want deeper intelligence, bring your own LLM provider — your code only goes where you choose to send it.

---

## 🔄 Why most code graph tools can't keep up with your commits

If you use a code graph with an AI agent, the graph needs to be **current**. A stale graph gives the agent wrong answers — deleted functions still show up, new dependencies are invisible, impact analysis misses the code you just wrote. The graph should rebuild on every commit, ideally on every save.

Most tools in this space can't do that:

| Problem | Who has it | Why it breaks on every commit |
|---|---|---|
| **Full re-index on every change** | code-graph-rag, CodeMCP, axon, joern, cpg, GitNexus | No file-level change tracking. Change one file → re-parse and re-insert the entire codebase. On a 3,000-file project, that's 30+ seconds per commit minimum |
| **Cloud API calls baked into the pipeline** | code-graph-rag, CodeRAG | Embeddings are generated through cloud APIs (OpenAI, Voyage AI, Gemini). Every rebuild = API round-trips for every function. Slow, expensive, and rate-limited. You can't put this in a commit hook |
| **Heavy infrastructure that's slow to restart** | code-graph-rag (Memgraph), axon (KuzuDB), badger-graph (Dgraph) | External databases add latency to every write. Bulk-inserting a full graph into Memgraph is not a sub-second operation |
| **No persistence between runs** | pyan, cflow | Re-parse from scratch every time. No database, no delta, no incremental anything |

**Codegraph solves this with three-tier incremental change detection:**

1. **Tier 0 — Journal (O(changed)):** If `codegraph watch` was running, a change journal records exactly which files were touched. The next build reads the journal and only processes those files — zero filesystem scanning
2. **Tier 1 — mtime+size (O(n) stats, O(changed) reads):** No journal? Codegraph stats every file and compares mtime + size against stored values. Matching files are skipped without reading a single byte — 10-100x cheaper than hashing
3. **Tier 2 — Hash (O(changed) reads):** Files that fail the mtime/size check are read and MD5-hashed. Only files whose hash actually changed get re-parsed and re-inserted

**Result:** change one file in a 3,000-file project → rebuild completes in **under a second**. With watch mode active, rebuilds are near-instant — the journal makes the build proportional to the number of changed files, not the size of the codebase. Put it in a commit hook, a file watcher, or let your AI agent trigger it. The graph is always current.

And because the core pipeline is pure local computation (tree-sitter + SQLite), there are no API calls, no network latency, and no cost. LLM-powered features (semantic search, richer embeddings) are a separate optional layer — they enhance the graph but never block it from being current.

---

## 💡 Why codegraph?

<sub>Comparison last verified: February 2026</sub>

Most code graph tools make you choose: **fast local analysis with no AI, or powerful AI features that require full re-indexing through cloud APIs on every change.** Codegraph gives you both — a graph that rebuilds in milliseconds on every commit, with optional LLM enhancement through the provider you're already using.

### Feature comparison

| Capability | codegraph | [joern](https://github.com/joernio/joern) | [narsil-mcp](https://github.com/postrv/narsil-mcp) | [code-graph-rag](https://github.com/vitali87/code-graph-rag) | [cpg](https://github.com/Fraunhofer-AISEC/cpg) | [GitNexus](https://github.com/abhigyanpatwari/GitNexus) | [CodeMCP](https://github.com/SimplyLiz/CodeMCP) | [axon](https://github.com/harshkedia177/axon) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Function-level analysis | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** |
| Multi-language | **11** | **14** | **32** | Multi | **~10** | **9** | SCIP langs | Few |
| Semantic search | **Yes** | — | **Yes** | **Yes** | — | **Yes** | — | — |
| MCP / AI agent support | **Yes** | — | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | — |
| Git diff impact | **Yes** | — | — | — | — | **Yes** | — | **Yes** |
| Watch mode | **Yes** | — | **Yes** | — | — | — | — | — |
| Cycle detection | **Yes** | — | **Yes** | — | — | — | — | **Yes** |
| Incremental rebuilds | **O(changed)** | — | O(n) Merkle | — | — | — | — | — |
| Zero config | **Yes** | — | **Yes** | — | — | — | — | — |
| Embeddable JS library (`npm install`) | **Yes** | — | — | — | — | — | — | — |
| LLM-optional (works without API keys) | **Yes** | **Yes** | **Yes** | — | **Yes** | **Yes** | **Yes** | **Yes** |
| Commercial use allowed | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | — | — | — |
| Open source | **Yes** | Yes | Yes | Yes | Yes | Yes | Custom | — |

### What makes codegraph different

| | Differentiator | In practice |
|---|---|---|
| **⚡** | **Always-fresh graph** | Three-tier change detection: journal (O(changed)) → mtime+size (O(n) stats) → hash (O(changed) reads). Sub-second rebuilds even on large codebases. Competitors re-index everything from scratch; Merkle-tree approaches still require O(n) filesystem scanning |
| **🔓** | **Zero-cost core, LLM-enhanced when you want** | Full graph analysis with no API keys, no accounts, no cost. Optionally bring your own LLM provider for richer embeddings and AI-powered search — your code only goes to the provider you already chose |
| **🔬** | **Function-level, not just files** | Traces `handleAuth()` → `validateToken()` → `decryptJWT()` and shows 14 callers across 9 files break if `decryptJWT` changes |
| **🤖** | **Built for AI agents** | 17-tool [MCP server](https://modelcontextprotocol.io/) — AI assistants query your graph directly. Single-repo by default, your code doesn't leak to other projects |
| **🌐** | **Multi-language, one CLI** | JS/TS + Python + Go + Rust + Java + C# + PHP + Ruby + HCL in a single graph — no juggling Madge, pyan, and cflow |
| **💥** | **Git diff impact** | `codegraph diff-impact` shows changed functions, their callers, and full blast radius — ships with a GitHub Actions workflow |
| **🧠** | **Semantic search** | Local embeddings by default, LLM-powered embeddings when opted in — multi-query with RRF ranking via `"auth; token; JWT"` |

---

## 🚀 Quick Start

```bash
# Install from npm
npm install -g @optave/codegraph

# Or install from source
git clone https://github.com/optave/codegraph.git
cd codegraph
npm install
npm link

# Build a graph for any project
cd your-project
codegraph build        # → .codegraph/graph.db created

# Start exploring
codegraph map          # see most-connected files
codegraph query myFunc # find any function, see callers & callees
codegraph deps src/index.ts  # file-level import/export map
```

## ✨ Features

| | Feature | Description |
|---|---|---|
| 🔍 | **Symbol search** | Find any function, class, or method by name with callers/callees |
| 📁 | **File dependencies** | See what a file imports and what imports it |
| 💥 | **Impact analysis** | Trace every file affected by a change (transitive) |
| 🧬 | **Function-level tracing** | Call chains, caller trees, and function-level impact |
| 📊 | **Diff impact** | Parse `git diff`, find overlapping functions, trace their callers |
| 🗺️ | **Module map** | Bird's-eye view of your most-connected files |
| 🔄 | **Cycle detection** | Find circular dependencies at file or function level |
| 📤 | **Export** | DOT (Graphviz), Mermaid, and JSON graph export |
| 🧠 | **Semantic search** | Embeddings-powered natural language search with multi-query RRF ranking |
| 👀 | **Watch mode** | Incrementally update the graph as files change |
| 🤖 | **MCP server** | 17-tool MCP server for AI assistants; single-repo by default, opt-in multi-repo |
| 🔒 | **Your code, your choice** | Zero-cost core with no API keys. Optionally enhance with your LLM provider — your code only goes where you send it |

## 📦 Commands

### Build & Watch

```bash
codegraph build [dir]          # Parse and build the dependency graph
codegraph build --no-incremental  # Force full rebuild
codegraph build --engine wasm  # Force WASM engine (skip native)
codegraph watch [dir]          # Watch for changes, update graph incrementally
```

### Query & Explore

```bash
codegraph query <name>         # Find a symbol — shows callers and callees
codegraph deps <file>          # File imports/exports
codegraph map                  # Top 20 most-connected files
codegraph map -n 50            # Top 50
```

### Impact Analysis

```bash
codegraph impact <file>        # Transitive reverse dependency trace
codegraph fn <name>            # Function-level: callers, callees, call chain
codegraph fn <name> --no-tests --depth 5
codegraph fn-impact <name>     # What functions break if this one changes
codegraph diff-impact          # Impact of unstaged git changes
codegraph diff-impact --staged # Impact of staged changes
codegraph diff-impact HEAD~3   # Impact vs a specific ref
```

### Export & Visualization

```bash
codegraph export -f dot        # Graphviz DOT format
codegraph export -f mermaid    # Mermaid diagram
codegraph export -f json       # JSON graph
codegraph export --functions -o graph.dot  # Function-level, write to file
codegraph cycles               # Detect circular dependencies
codegraph cycles --functions   # Function-level cycles
```

### Semantic Search

Codegraph can build local embeddings for every function, method, and class, then search them by natural language. Everything runs locally using [@huggingface/transformers](https://huggingface.co/docs/transformers.js) — no API keys needed.

```bash
codegraph embed                # Build embeddings (default: minilm)
codegraph embed --model nomic  # Use a different model
codegraph search "handle authentication"
codegraph search "parse config" --min-score 0.4 -n 10
codegraph models               # List available models
```

#### Multi-query search

Separate queries with `;` to search from multiple angles at once. Results are ranked using [Reciprocal Rank Fusion (RRF)](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf) — items that rank highly across multiple queries rise to the top.

```bash
codegraph search "auth middleware; JWT validation"
codegraph search "parse config; read settings; load env" -n 20
codegraph search "error handling; retry logic" --kind function
codegraph search "database connection; query builder" --rrf-k 30
```

A single trailing semicolon is ignored (falls back to single-query mode). The `--rrf-k` flag controls the RRF smoothing constant (default 60) — lower values give more weight to top-ranked results.

#### Available Models

| Flag | Model | Dimensions | Size | License | Notes |
|---|---|---|---|---|---|
| `minilm` | all-MiniLM-L6-v2 | 384 | ~23 MB | Apache-2.0 | Fastest, good for quick iteration |
| `jina-small` | jina-embeddings-v2-small-en | 512 | ~33 MB | Apache-2.0 | Better quality, still small |
| `jina-base` | jina-embeddings-v2-base-en | 768 | ~137 MB | Apache-2.0 | High quality, 8192 token context |
| `jina-code` (default) | jina-embeddings-v2-base-code | 768 | ~137 MB | Apache-2.0 | **Best for code search**, trained on code+text |
| `nomic` | nomic-embed-text-v1 | 768 | ~137 MB | Apache-2.0 | Good quality, 8192 context |
| `nomic-v1.5` | nomic-embed-text-v1.5 | 768 | ~137 MB | Apache-2.0 | Improved nomic, Matryoshka dimensions |
| `bge-large` | bge-large-en-v1.5 | 1024 | ~335 MB | MIT | Best general retrieval, top MTEB scores |

The model used during `embed` is stored in the database, so `search` auto-detects it — no need to pass `--model` when searching.

### Multi-Repo Registry

Manage a global registry of codegraph-enabled projects. The registry stores paths to your built graphs so the MCP server can query them when multi-repo mode is enabled.

```bash
codegraph registry list        # List all registered repos
codegraph registry list --json # JSON output
codegraph registry add <dir>   # Register a project directory
codegraph registry add <dir> -n my-name  # Custom name
codegraph registry remove <name>  # Unregister
```

`codegraph build` auto-registers the project — no manual setup needed.

### AI Integration

```bash
codegraph mcp                  # Start MCP server (single-repo, current project only)
codegraph mcp --multi-repo     # Enable access to all registered repos
codegraph mcp --repos a,b      # Restrict to specific repos (implies --multi-repo)
```

By default, the MCP server only exposes the local project's graph. AI agents cannot access other repositories unless you explicitly opt in with `--multi-repo` or `--repos`.

### Common Flags

| Flag | Description |
|---|---|
| `-d, --db <path>` | Custom path to `graph.db` |
| `-T, --no-tests` | Exclude `.test.`, `.spec.`, `__test__` files |
| `--depth <n>` | Transitive trace depth (default varies by command) |
| `-j, --json` | Output as JSON |
| `-v, --verbose` | Enable debug output |
| `--engine <engine>` | Parser engine: `native`, `wasm`, or `auto` (default: `auto`) |
| `-k, --kind <kind>` | Filter by kind: `function`, `method`, `class`, `struct`, `enum`, `trait`, `record`, `module` (search) |
| `--file <pattern>` | Filter by file path pattern (search) |
| `--rrf-k <n>` | RRF smoothing constant for multi-query search (default 60) |

## 🌐 Language Support

| Language | Extensions | Coverage |
|---|---|---|
| ![JavaScript](https://img.shields.io/badge/-JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black) | `.js`, `.jsx`, `.mjs`, `.cjs` | Full — functions, classes, imports, call sites |
| ![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) | `.ts`, `.tsx` | Full — interfaces, type aliases, `.d.ts` |
| ![Python](https://img.shields.io/badge/-Python-3776AB?style=flat-square&logo=python&logoColor=white) | `.py` | Functions, classes, methods, imports, decorators |
| ![Go](https://img.shields.io/badge/-Go-00ADD8?style=flat-square&logo=go&logoColor=white) | `.go` | Functions, methods, structs, interfaces, imports, call sites |
| ![Rust](https://img.shields.io/badge/-Rust-000000?style=flat-square&logo=rust&logoColor=white) | `.rs` | Functions, methods, structs, traits, `use` imports, call sites |
| ![Java](https://img.shields.io/badge/-Java-ED8B00?style=flat-square&logo=openjdk&logoColor=white) | `.java` | Classes, methods, constructors, interfaces, imports, call sites |
| ![C#](https://img.shields.io/badge/-C%23-512BD4?style=flat-square&logo=dotnet&logoColor=white) | `.cs` | Classes, structs, records, interfaces, enums, methods, constructors, using directives, invocations |
| ![PHP](https://img.shields.io/badge/-PHP-777BB4?style=flat-square&logo=php&logoColor=white) | `.php` | Functions, classes, interfaces, traits, enums, methods, namespace use, calls |
| ![Ruby](https://img.shields.io/badge/-Ruby-CC342D?style=flat-square&logo=ruby&logoColor=white) | `.rb` | Classes, modules, methods, singleton methods, require/require_relative, include/extend |
| ![Terraform](https://img.shields.io/badge/-Terraform-844FBA?style=flat-square&logo=terraform&logoColor=white) | `.tf`, `.hcl` | Resource, data, variable, module, output blocks |

## ⚙️ How It Works

```
┌──────────┐    ┌───────────┐    ┌───────────┐    ┌──────────┐    ┌─────────┐
│  Source  │──▶│ tree-sitter│──▶│  Extract  │──▶│  Resolve │──▶│ SQLite  │
│  Files   │    │   Parse   │    │  Symbols  │    │  Imports │    │   DB    │
└──────────┘    └───────────┘    └───────────┘    └──────────┘    └─────────┘
                                                                       │
                                                                       ▼
                                                                 ┌─────────┐
                                                                 │  Query  │
                                                                 └─────────┘
```

1. **Parse** — tree-sitter parses every source file into an AST (native Rust engine or WASM fallback)
2. **Extract** — Functions, classes, methods, interfaces, imports, exports, and call sites are extracted
3. **Resolve** — Imports are resolved to actual files (handles ESM conventions, `tsconfig.json` path aliases, `baseUrl`)
4. **Store** — Everything goes into SQLite as nodes + edges with tree-sitter node boundaries
5. **Query** — All queries run locally against the SQLite DB — typically under 100ms

### Dual Engine

Codegraph ships with two parsing engines:

| Engine | How it works | When it's used |
|--------|-------------|----------------|
| **Native** (Rust) | napi-rs addon built from `crates/codegraph-core/` — parallel multi-core parsing via rayon | Auto-selected when the prebuilt binary is available |
| **WASM** | `web-tree-sitter` with pre-built `.wasm` grammars in `grammars/` | Fallback when the native addon isn't installed |

Both engines produce identical output. Use `--engine native|wasm|auto` to control selection (default: `auto`).

### Call Resolution

Calls are resolved with priority and confidence scoring:

| Priority | Source | Confidence |
|---|---|---|
| 1 | **Import-aware** — `import { foo } from './bar'` → link to `bar` | `1.0` |
| 2 | **Same-file** — definitions in the current file | `1.0` |
| 3 | **Same directory** — definitions in sibling files | `0.7` |
| 4 | **Same parent directory** — definitions in sibling dirs | `0.5` |
| 5 | **Global fallback** — match by name across codebase | `0.3` |
| 6 | **Method hierarchy** — resolved through `extends`/`implements` | — |

Dynamic patterns like `fn.call()`, `fn.apply()`, `fn.bind()`, and `obj["method"]()` are also detected on a best-effort basis.

## 📊 Performance

Self-measured on every release via CI ([full history](generated/BENCHMARKS.md)):

| Metric | Latest |
|---|---|
| Build speed (native) | **2.5 ms/file** |
| Build speed (WASM) | **5 ms/file** |
| Query time | **1ms** |
| ~50,000 files (est.) | **~125.0s build** |

Metrics are normalized per file for cross-version comparability. Times above are for a full initial build — incremental rebuilds only re-parse changed files.

## 🤖 AI Agent Integration

### MCP Server

Codegraph includes a built-in [Model Context Protocol](https://modelcontextprotocol.io/) server with 17 tools, so AI assistants can query your dependency graph directly:

```bash
codegraph mcp                  # Single-repo mode (default) — only local project
codegraph mcp --multi-repo     # Multi-repo — all registered repos accessible
codegraph mcp --repos a,b      # Multi-repo with allowlist
```

**Single-repo mode (default):** Tools operate only on the local `.codegraph/graph.db`. The `repo` parameter and `list_repos` tool are not exposed to the AI agent.

**Multi-repo mode (`--multi-repo`):** All tools gain an optional `repo` parameter to target any registered repository, and `list_repos` becomes available. Use `--repos` to restrict which repos the agent can access.

### CLAUDE.md / Agent Instructions

Add this to your project's `CLAUDE.md` to help AI agents use codegraph (full template in the [AI Agent Guide](docs/ai-agent-guide.md#claudemd-template)):

```markdown
## Code Navigation

This project uses codegraph. The database is at `.codegraph/graph.db`.

### Before modifying code, always:
1. `codegraph where <name>` — find where the symbol lives
2. `codegraph explain <file-or-function>` — understand the structure
3. `codegraph context <name> -T` — get full context (source, deps, callers)
4. `codegraph fn-impact <name> -T` — check blast radius before editing

### After modifying code:
5. `codegraph diff-impact --staged -T` — verify impact before committing

### Other useful commands
- `codegraph build .` — rebuild the graph (incremental by default)
- `codegraph map` — module overview
- `codegraph fn <name> -T` — function call chain
- `codegraph deps <file>` — file-level dependencies
- `codegraph search "<query>"` — semantic search (requires `codegraph embed`)
- `codegraph cycles` — check for circular dependencies

### Flags
- `-T` / `--no-tests` — exclude test files (use by default)
- `-j` / `--json` — JSON output for programmatic use
- `-f, --file <path>` — scope to a specific file
- `-k, --kind <kind>` — filter by symbol kind

### Semantic search

Use `codegraph search` to find functions by intent rather than exact name.
When a single query might miss results, combine multiple angles with `;`:

  codegraph search "validate auth; check token; verify JWT"
  codegraph search "parse config; load settings" --kind function

Multi-query search uses Reciprocal Rank Fusion — functions that rank
highly across several queries surface first. This is especially useful
when you're not sure what naming convention the codebase uses.

When writing multi-queries, use 2-4 sub-queries (2-4 words each) that
attack the problem from different angles. Pick from these strategies:
- **Naming variants**: cover synonyms the author might have used
  ("send email; notify user; deliver message")
- **Abstraction levels**: pair high-level intent with low-level operation
  ("handle payment; charge credit card")
- **Input/output sides**: cover the read half and write half
  ("parse config; apply settings")
- **Domain + technical**: bridge business language and implementation
  ("onboard tenant; create organization; provision workspace")

Use `--kind function` to cut noise. Use `--file <pattern>` to scope.
```

## 📋 Recommended Practices

See **[docs/recommended-practices.md](docs/recommended-practices.md)** for integration guides:

- **Git hooks** — auto-rebuild on commit, impact checks on push, commit message enrichment
- **CI/CD** — PR impact comments, threshold gates, graph caching
- **AI agents** — MCP server, CLAUDE.md templates, Claude Code hooks
- **Developer workflow** — watch mode, explore-before-you-edit, semantic search
- **Secure credentials** — `apiKeyCommand` with 1Password, Bitwarden, Vault, macOS Keychain, `pass`

For AI-specific integration, see the **[AI Agent Guide](docs/ai-agent-guide.md)** — a comprehensive reference covering the 6-step agent workflow, complete command-to-MCP mapping, Claude Code hooks, and token-saving patterns.

## 🔁 CI / GitHub Actions

Codegraph ships with a ready-to-use GitHub Actions workflow that comments impact analysis on every pull request.

Copy `.github/workflows/codegraph-impact.yml` to your repo, and every PR will get a comment like:

> **3 functions changed** → **12 callers affected** across **7 files**

## 🛠️ Configuration

Create a `.codegraphrc.json` in your project root to customize behavior:

```json
{
  "include": ["src/**", "lib/**"],
  "exclude": ["**/*.test.js", "**/__mocks__/**"],
  "ignoreDirs": ["node_modules", ".git", "dist"],
  "extensions": [".js", ".ts", ".tsx", ".py"],
  "aliases": {
    "@/": "./src/",
    "@utils/": "./src/utils/"
  },
  "build": {
    "incremental": true
  }
}
```

### LLM credentials

Codegraph supports an `apiKeyCommand` field for secure credential management. Instead of storing API keys in config files or environment variables, you can shell out to a secret manager at runtime:

```json
{
  "llm": {
    "provider": "openai",
    "apiKeyCommand": "op read op://vault/openai/api-key"
  }
}
```

The command is split on whitespace and executed with `execFileSync` (no shell injection risk). Priority: **command output > `CODEGRAPH_LLM_API_KEY` env var > file config**. On failure, codegraph warns and falls back to the next source.

Works with any secret manager: 1Password CLI (`op`), Bitwarden (`bw`), `pass`, HashiCorp Vault, macOS Keychain (`security`), AWS Secrets Manager, etc.

## 📖 Programmatic API

Codegraph also exports a full API for use in your own tools:

```js
import { buildGraph, queryNameData, findCycles, exportDOT } from '@optave/codegraph';

// Build the graph
buildGraph('/path/to/project');

// Query programmatically
const results = queryNameData('myFunction', '/path/to/.codegraph/graph.db');
```

```js
import { parseFileAuto, getActiveEngine, isNativeAvailable } from '@optave/codegraph';

// Check which engine is active
console.log(getActiveEngine());      // 'native' or 'wasm'
console.log(isNativeAvailable());    // true if Rust addon is installed

// Parse a single file (uses auto-selected engine)
const symbols = await parseFileAuto('/path/to/file.ts');
```

```js
import { searchData, multiSearchData, buildEmbeddings } from '@optave/codegraph';

// Build embeddings (one-time)
await buildEmbeddings('/path/to/project');

// Single-query search
const { results } = await searchData('handle auth', dbPath);

// Multi-query search with RRF ranking
const { results: fused } = await multiSearchData(
  ['auth middleware', 'JWT validation'],
  dbPath,
  { limit: 10, minScore: 0.3 }
);
// Each result has: { name, kind, file, line, rrf, queryScores[] }
```

## ⚠️ Limitations

- **No full type inference** — parses `.d.ts` interfaces but doesn't use TypeScript's type checker for overload resolution
- **Dynamic calls are best-effort** — complex computed property access and `eval` patterns are not resolved
- **Python imports** — resolves relative imports but doesn't follow `sys.path` or virtual environment packages

## 🗺️ Roadmap

See **[ROADMAP.md](ROADMAP.md)** for the full development roadmap. Current plan:

1. ~~**Rust Core**~~ — **Complete** (v1.3.0) — native tree-sitter parsing via napi-rs, parallel multi-core parsing, incremental re-parsing, import resolution & cycle detection in Rust
2. ~~**Foundation Hardening**~~ — **Complete** (v1.4.0) — parser registry, 12-tool MCP server with multi-repo support, test coverage 62%→75%, `apiKeyCommand` secret resolution, global repo registry
3. **Intelligent Embeddings** — LLM-generated descriptions, hybrid search
4. **Natural Language Queries** — `codegraph ask` command, conversational sessions
5. **Expanded Language Support** — 8 new languages (12 → 20)
6. **GitHub Integration & CI** — reusable GitHub Action, PR review, SARIF output
7. **Visualization & Advanced** — web UI, dead code detection, monorepo support, agentic search

## 🤝 Contributing

Contributions are welcome! See **[CONTRIBUTING.md](CONTRIBUTING.md)** for the full guide — setup, workflow, commit convention, testing, and architecture notes.

```bash
git clone https://github.com/optave/codegraph.git
cd codegraph
npm install
npm test
```

Looking to add a new language? Check out **[Adding a New Language](docs/adding-a-language.md)**.

## 📄 License

[Apache-2.0](LICENSE)

---

<p align="center">
  <sub>Built with <a href="https://tree-sitter.github.io/">tree-sitter</a> and <a href="https://github.com/WiseLibs/better-sqlite3">better-sqlite3</a>. Your code only goes where you choose to send it.</sub>
</p>
