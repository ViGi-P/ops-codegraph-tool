/**
 * Integration tests for P1: dataflow_vertices and intra def_use edges.
 *
 * Tests the vertex builder in buildDataflowEdges by injecting pre-computed
 * visitor output (DataflowResult with internal VisitorParam/VisitorReturn
 * fields) and verifying that dataflow_vertices rows and def_use edges are
 * created correctly.
 *
 * Fixture topology:
 *   helper(x, y):
 *     assigns local z = transform(x)
 *     returns z + y           -- x param → return, y param → return, z local → return
 *
 *   processData(input):
 *     calls helper(input, 42) -- flows_to edge
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { initSchema } from '../../src/db/index.js';
import { buildDataflowEdges } from '../../src/features/dataflow.js';

// ─── Helpers ───────────────────────────────────────────────────────────

function insertNode(
  db: ReturnType<typeof Database>,
  name: string,
  kind: string,
  file: string,
  line: number,
): number {
  return db
    .prepare('INSERT INTO nodes (name, kind, file, line) VALUES (?, ?, ?, ?)')
    .run(name, kind, file, line).lastInsertRowid as number;
}

// ─── Fixture DB ────────────────────────────────────────────────────────

let tmpDir: string;
let dbPath: string;
let fixturePath: string;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-dfv-'));
  fs.mkdirSync(path.join(tmpDir, '.codegraph'));
  dbPath = path.join(tmpDir, '.codegraph', 'graph.db');
  fixturePath = path.join(tmpDir, 'src', 'utils.js');
  fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
  fs.writeFileSync(
    fixturePath,
    `function helper(x, y) { const z = transform(x); return z + y; }
function processData(input) { return helper(input, 42); }`,
  );

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  initSchema(db);

  insertNode(db, 'helper', 'function', 'src/utils.js', 1);
  insertNode(db, 'processData', 'function', 'src/utils.js', 2);
  insertNode(db, 'transform', 'function', 'src/transform.js', 1);

  // Simulate the visitor's internal DataflowResult for src/utils.js.
  // The public DataflowResult type omits paramName/paramIndex/referencedNames;
  // the actual runtime object carries them (cast required at build time).
  const mockDataflow = {
    parameters: [
      { funcName: 'helper', paramName: 'x', paramIndex: 0, line: 1 },
      { funcName: 'helper', paramName: 'y', paramIndex: 1, line: 1 },
      { funcName: 'processData', paramName: 'input', paramIndex: 0, line: 2 },
    ],
    returns: [
      // helper returns z + y — references 'z' (local) and 'y' (param)
      { funcName: 'helper', expression: 'z + y', referencedNames: ['z', 'y'], line: 1 },
    ],
    assignments: [
      // const z = transform(x) — local z assigned from call return
      {
        varName: 'z',
        callerFunc: 'helper',
        sourceCallName: 'transform',
        expression: 'transform(x)',
        line: 1,
      },
    ],
    argFlows: [
      // helper(input, 42) — input (param of processData) flows to helper arg 0
      {
        callerFunc: 'processData',
        calleeName: 'helper',
        argIndex: 0,
        argName: 'input',
        binding: { type: 'param', index: 0, funcName: 'processData' },
        confidence: 1.0,
        expression: 'input',
        line: 2,
      },
    ],
    mutations: [],
  };

  const fileSymbols = new Map([
    [
      'src/utils.js',
      {
        definitions: [
          { name: 'helper', kind: 'function', line: 1 },
          { name: 'processData', kind: 'function', line: 2 },
        ],
        // Pre-populate dataflow to bypass re-parsing (no WASM grammars in worktree)
        dataflow: mockDataflow as any,
        _langId: 'javascript' as any,
        _tree: null,
      },
    ],
  ]);

  await buildDataflowEdges(db, fileSymbols as any, tmpDir);
  db.close();
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Tests ─────────────────────────────────────────────────────────────

describe('P1: dataflow_vertices', () => {
  function openDb() {
    return new Database(dbPath, { readonly: true });
  }

  test('creates param vertices for helper(x, y)', () => {
    const db = openDb();
    const rows = db
      .prepare(
        `SELECT dv.* FROM dataflow_vertices dv
         JOIN nodes n ON n.id = dv.func_id
         WHERE n.name = 'helper' AND dv.kind = 'param'
         ORDER BY dv.param_index`,
      )
      .all() as any[];
    db.close();

    expect(rows).toHaveLength(2);
    expect(rows[0]!.name).toBe('x');
    expect(rows[0]!.param_index).toBe(0);
    expect(rows[1]!.name).toBe('y');
    expect(rows[1]!.param_index).toBe(1);
  });

  test('creates param vertex for processData(input)', () => {
    const db = openDb();
    const rows = db
      .prepare(
        `SELECT dv.* FROM dataflow_vertices dv
         JOIN nodes n ON n.id = dv.func_id
         WHERE n.name = 'processData' AND dv.kind = 'param'`,
      )
      .all() as any[];
    db.close();

    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('input');
    expect(rows[0]!.param_index).toBe(0);
  });

  test('creates return vertex for helper', () => {
    const db = openDb();
    const rows = db
      .prepare(
        `SELECT dv.* FROM dataflow_vertices dv
         JOIN nodes n ON n.id = dv.func_id
         WHERE n.name = 'helper' AND dv.kind = 'return'`,
      )
      .all() as any[];
    db.close();

    expect(rows).toHaveLength(1);
  });

  test('creates local vertex for z (assigned from transform call)', () => {
    const db = openDb();
    const rows = db
      .prepare(
        `SELECT dv.* FROM dataflow_vertices dv
         JOIN nodes n ON n.id = dv.func_id
         WHERE n.name = 'helper' AND dv.kind = 'local' AND dv.name = 'z'`,
      )
      .all() as any[];
    db.close();

    expect(rows).toHaveLength(1);
  });

  test('creates def_use edge from param y → return in helper', () => {
    const db = openDb();
    const rows = db
      .prepare(
        `SELECT d.* FROM dataflow d
         JOIN dataflow_vertices sv ON sv.id = d.source_vertex
         JOIN dataflow_vertices tv ON tv.id = d.target_vertex
         JOIN nodes fn ON fn.id = sv.func_id
         WHERE fn.name = 'helper'
           AND sv.kind = 'param' AND sv.name = 'y'
           AND tv.kind = 'return'
           AND d.kind = 'def_use'
           AND d.scope = 'intra'`,
      )
      .all() as any[];
    db.close();

    expect(rows).toHaveLength(1);
  });

  test('creates def_use edge from local z → return in helper', () => {
    const db = openDb();
    const rows = db
      .prepare(
        `SELECT d.* FROM dataflow d
         JOIN dataflow_vertices sv ON sv.id = d.source_vertex
         JOIN dataflow_vertices tv ON tv.id = d.target_vertex
         JOIN nodes fn ON fn.id = sv.func_id
         WHERE fn.name = 'helper'
           AND sv.kind = 'local' AND sv.name = 'z'
           AND tv.kind = 'return'
           AND d.kind = 'def_use'
           AND d.scope = 'intra'`,
      )
      .all() as any[];
    db.close();

    expect(rows).toHaveLength(1);
  });

  test('does NOT create def_use edge from param x (not in return expression)', () => {
    const db = openDb();
    const rows = db
      .prepare(
        `SELECT d.* FROM dataflow d
         JOIN dataflow_vertices sv ON sv.id = d.source_vertex
         JOIN nodes fn ON fn.id = sv.func_id
         WHERE fn.name = 'helper'
           AND sv.kind = 'param' AND sv.name = 'x'
           AND d.kind = 'def_use'`,
      )
      .all() as any[];
    db.close();

    expect(rows).toHaveLength(0);
  });

  test('existing flows_to edges still created for processData → helper', () => {
    const db = openDb();
    const rows = db
      .prepare(
        `SELECT d.* FROM dataflow d
         JOIN nodes sn ON sn.id = d.source_id
         JOIN nodes tn ON tn.id = d.target_id
         WHERE sn.name = 'processData' AND tn.name = 'helper'
           AND d.kind = 'flows_to'`,
      )
      .all() as any[];
    db.close();

    expect(rows).toHaveLength(1);
    expect(rows[0]!.param_index).toBe(0);
  });

  test('dataflow_fn view is empty (no inter-function vertex edges yet)', () => {
    const db = openDb();
    const rows = db.prepare('SELECT * FROM dataflow_fn').all();
    db.close();
    // No vertex-linked inter edges yet (those come in P2 stitching)
    expect(rows).toHaveLength(0);
  });
});
