# Dogfood Report — codegraph v2.1.0

**Date:** 2026-02-23
**Platform:** Windows 11 Pro (win32-x64), Node v22.18.0
**Native binary:** `@optave/codegraph-win32-x64-msvc` 2.1.0
**Active engine:** native v0.1.0 (auto-detected)
**Target repo:** codegraph itself (92 files, JS + Rust)

---

## 1. Test Summary

| Area | Result |
|------|--------|
| `npm install` | OK — native binary + WASM grammars built successfully |
| `npm test` | **494 passed**, 5 skipped, 0 failures |
| `npm run lint` | Clean — no issues |
| Native engine build | 500 nodes, 724 edges |
| WASM engine build | 527 nodes, 699 edges |
| Incremental rebuild (no changes) | Correctly detected "Graph is up to date" |

---

## 2. Commands Tested

All 22 CLI commands were exercised against the codegraph codebase:

| Command | Status | Notes |
|---------|--------|-------|
| `build .` | OK | Both `--engine native` and `--engine wasm` |
| `build .` (incremental) | OK | Correctly skips unchanged files |
| `map` | OK | |
| `stats` | OK | |
| `cycles` | OK | 0 file-level, 2 function-level |
| `deps <file>` | OK | |
| `impact <file>` | OK | |
| `fn <name>` | OK | |
| `fn-impact <name>` | OK | |
| `context <name>` | OK | Full source + deps + callers + tests |
| `explain <file>` | OK | Data flow analysis is very useful |
| `explain <function>` | OK | |
| `where <name>` | OK | |
| `diff-impact main` | OK | 56 functions changed, 31 callers affected |
| `export --format dot` | OK | |
| `export --format mermaid` | OK | |
| `export --format json` | OK | |
| `structure` | OK | 18 directories, cohesion scores |
| `hotspots` | OK | |
| `models` | OK | 7 models listed |
| `info` | OK | Correctly reports native engine |
| `--version` | OK | `2.1.0` |

### Edge cases tested

| Scenario | Result |
|----------|--------|
| Non-existent symbol (`query nonexistent`) | Graceful message: "No results for..." |
| Non-existent file (`deps nonexistent.js`) | Graceful message: "No file matching..." |
| Non-existent symbol (`fn nonexistent`) | Graceful message: "No function/method/class..." |
| `--json` flag on all supporting commands | Correct JSON output |
| `--no-tests` on fn, fn-impact, context, explain, where, diff-impact | Correctly filters test files |
| `--file` filter on fn | Correctly scopes results |

---

## 3. Bugs Found & Fixed

### BUG: `--no-tests` flag missing on `map`, `deps`, `impact`, and `hotspots` CLI commands

**Severity:** Medium
**Commit reference:** `ec158c3` claims to add `--no-tests` to these commands, but the CLI option was never wired up.

**Symptoms:**
- `codegraph map --no-tests` → `error: unknown option '--no-tests'`
- `codegraph deps <file> --no-tests` → `error: unknown option '--no-tests'`
- `codegraph impact <file> --no-tests` → `error: unknown option '--no-tests'`
- `codegraph hotspots --no-tests` → `error: unknown option '--no-tests'`

**Root cause:** The underlying data functions (`moduleMapData`, `fileDepsData`, `impactAnalysisData`, `hotspotsData`) all accept a `noTests` option and implement filtering, but the Commander CLI option definitions in `cli.js` were never updated to add `-T, --no-tests` and pass it through.

**Fix:** Added `-T, --no-tests` option and `noTests: !opts.tests` passthrough to all four commands in `cli.js`.

**Verification:**
- `deps src/builder.js --no-tests` → "Imported by" drops from 5 to 1 (filters 4 test files)
- `impact src/parser.js --no-tests` → Total drops from 30 to 8 files
- All 494 tests still pass after fix

---

## 4. Observations

### 4.1 Engine Parity Gap (Native vs WASM)

| Metric | Native | WASM | Delta |
|--------|--------|------|-------|
| Nodes | 500 | 527 | +27 (+5.4%) |
| Edges | 724 | 699 | -25 (-3.5%) |
| Functions | 315 | 342 | +27 |
| Call edges | 591 | 566 | -25 |
| Call confidence | 96.8% | 99.3% | +2.5pp |
| Graph quality | 83/100 | 82/100 | -1 |

The native engine extracts 27 fewer function symbols but resolves 25 more call edges. This suggests the native engine may be merging/deduplicating some symbols while being better at call-site resolution. The WASM engine has higher confidence (99.3% vs 96.8%) but lower caller coverage (55.5% vs 60.4%).

**Recommendation:** The parity test (`build-parity.test.js`) exists but only checks a small fixture. Consider adding a snapshot test on a larger fixture (or the codegraph repo itself) to track parity drift between engines.

### 4.2 `statsData` Does Not Support `noTests`

The `stats` command's underlying `statsData()` function accepts no options — it always reports counts including test files. Unlike `map`/`deps`/`impact`/`hotspots`, there's no `noTests` filtering path. This is an inconsistency: if a user wants a production-code-only view of their graph, `stats` always includes tests.

### 4.3 `query` Command Lacks `--no-tests`

The `query` command is the only remaining query command without `--no-tests`. It shows callers and callees, which often include test files. Adding `--no-tests` here would complete the consistency story.

---

## 5. Suggestions for Improvement

### 5.1 UX: Consistent Flag Coverage

Add `--no-tests` to all remaining query commands (`stats`, `query`, `cycles`, `export`). Users who use it on one command expect it on all. Alternatively, add a config option `noTests: true` in `.codegraphrc.json` so users don't have to repeat the flag every time.

### 5.2 UX: Default `--no-tests` in Config

Many codebases have large test directories. A `.codegraphrc.json` option like `"excludeTests": true` would let users default to production-only views:
```json
{
  "excludeTests": true
}
```
This would save typing `-T` on every command while still allowing `--include-tests` to override.

### 5.3 UX: `map` Could Show Coupling Score

The `map` command shows fan-in/fan-out bars, but doesn't show the actual coupling score (in+out combined). The `stats` command shows "Top 5 coupling hotspots" — `map` could integrate this as a column since it already has the data.

### 5.4 UX: `explain` Is the Most Useful Command for AI Workflows

The `explain` command produces the most AI-agent-friendly output — structured sections (exports, internals, data flow) that give an LLM exactly the context it needs. Consider:
- Making it the default recommendation in the README for AI workflows
- Adding a `--depth` option to recursively explain dependencies (e.g., `explain src/parser.js --depth 1` also explains its imports)

### 5.5 Performance: Build Speed

Building 92 files takes under 2 seconds with the native engine. This is excellent. However, the native engine still prints "Using native engine" to stdout (not stderr), which pollutes piped output. Consider using `console.error` or `process.stderr.write` for status messages, keeping stdout clean for actual data output.

### 5.6 UX: `structure` Cohesion of 0.00 for Test Directories

All test directories show `cohesion=0.00`, which is technically correct (tests import source, not each other) but may alarm users who don't understand the metric. Consider:
- Hiding cohesion for test directories
- Or adding a note like `(test directory — low cohesion expected)`

### 5.7 UX: `diff-impact` Relative to Working Tree

`diff-impact main` is great for PR reviews, but it would be useful to also support `diff-impact HEAD` or `diff-impact` (no args) showing unstaged changes. The CLI help says it supports unstaged, but the default behavior when no ref is given could be better documented.

### 5.8 Missing: `--no-tests` Help Text Inconsistency

Some commands say "Exclude test/spec files from results", others say "Exclude test files from callers", others say "Exclude test/spec files". A consistent description across all commands would be cleaner.

---

## 6. Overall Assessment

Codegraph v2.1.0 on Windows x64 with the native engine is **solid**. All 22 commands work correctly, edge cases are handled gracefully, the test suite is comprehensive (494 tests), and the native binary installs cleanly as an optional dependency.

The one real bug found (missing `--no-tests` wiring on 4 commands) is fixed in this session. The engine parity gap is the most significant technical observation — worth tracking but not blocking since both engines produce usable graphs.

**Rating: 9/10** — Production-ready with minor consistency issues.
