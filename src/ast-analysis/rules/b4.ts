import type { DataflowRulesConfig, TreeSitterNode } from '../../types.js';
import { makeDataflowRules } from '../shared.js';

// ─── Haskell ──────────────────────────────────────────────────────────────────
//
// Haskell `function` node: name via `childForFieldName('name')` (confirmed in extractor line 62).
// Params: `patterns` or `parameter` children of the function node (extractor line 81).
// No explicit return keyword — last expression is the return value. returnNode: null.
// apply: `childForFieldName('function')` for the called function (extractor line 264).
// No standard variable declarations or member access in the conventional sense.

function extractHaskellParamName(node: TreeSitterNode): string[] | null {
  if (node.type === 'variable' || node.type === 'identifier') return [node.text];
  if (node.type === 'wildcard') return ['_'];
  // For pattern nodes, collect all variable bindings
  if (node.type === 'patterns' || node.type === 'parameter') {
    const names: string[] = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) continue;
      if (child.type === 'variable' || child.type === 'identifier') names.push(child.text);
    }
    return names.length > 0 ? names : null;
  }
  return null;
}

function getHaskellParamListNode(funcNode: TreeSitterNode): TreeSitterNode | null {
  // Haskell params are positional children; find the `patterns` child if present
  for (let i = 0; i < funcNode.childCount; i++) {
    const child = funcNode.child(i);
    if (child?.type === 'patterns') return child;
  }
  return null;
}

export const dataflowHaskell: DataflowRulesConfig = makeDataflowRules({
  functionNodes: new Set(['function']),
  nameField: 'name',

  getParamListNode: getHaskellParamListNode,
  paramWrapperTypes: new Set(['variable', 'identifier', 'wildcard', 'parameter']),
  extractParamName: extractHaskellParamName,

  returnNode: null, // Haskell: no explicit return; last expression is the result

  callNode: 'apply',
  callFunctionField: 'function',
  // `apply` args don't have a single named 'arguments' field in tree-sitter-haskell.
});

// ─── OCaml ────────────────────────────────────────────────────────────────────
//
// OCaml functions are `value_definition` → `let_binding` nodes with parameter children.
// The extractor handles both `value_definition` (top-level) and standalone `let_binding`.
// Params: `parameter` or `value_pattern` children of let_binding (extractor line 139).
// No explicit return keyword — last expression is the result. returnNode: null.
// application_expression: first child is function node (extractor line 314).
// field_get_expression: `childForFieldName('field')` (extractor line 327).
// Variable declarations: `let_binding` with no params (extractor line 103-110).

function extractOCamlParamName(node: TreeSitterNode): string[] | null {
  if (node.type === 'value_name' || node.type === 'identifier') return [node.text];
  if (node.type === 'parameter' || node.type === 'value_pattern') {
    // Pattern may be value_name or identifier
    if (node.namedChildCount === 0) return [node.text];
    for (const child of node.namedChildren) {
      if (child.type === 'value_name' || child.type === 'identifier') return [child.text];
    }
  }
  return null;
}

function getOCamlParamListNode(funcNode: TreeSitterNode): TreeSitterNode | null {
  // For value_definition, params are inside let_binding children
  if (funcNode.type === 'value_definition') {
    for (let i = 0; i < funcNode.childCount; i++) {
      const child = funcNode.child(i);
      if (child?.type === 'let_binding') return child;
    }
  }
  // For let_binding directly — return it as the "param list" (walker will iterate its children)
  if (funcNode.type === 'let_binding') return funcNode;
  return null;
}

export const dataflowOCaml: DataflowRulesConfig = makeDataflowRules({
  functionNodes: new Set(['value_definition', 'let_binding']),
  nameField: 'pattern',

  getParamListNode: getOCamlParamListNode,
  paramWrapperTypes: new Set(['parameter', 'value_pattern']),
  extractParamName: extractOCamlParamName,

  returnNode: null, // OCaml: no explicit return; last expression is the result

  callNode: 'application_expression',
  // application_expression: first child is function (no named 'function' field in tree-sitter-ocaml).
  // Leave callFunctionField at default — will return null gracefully.

  memberNode: 'field_get_expression',
  memberPropertyField: 'field',
  // field_get_expression object is first child, not a named field. Leave memberObjectField at default.
});

// ─── F# ───────────────────────────────────────────────────────────────────────
//
// F# functions: `function_declaration_left` is the LHS of a `let` binding (confirmed extractor).
// The name is a direct `identifier` child of `function_declaration_left` (extractor line 127).
// Params: `argument_patterns` child of `function_declaration_left` (extractor line 150).
// No explicit return keyword in F#. returnNode: null.
// application_expression: first child is function (extractor line 265).
// dot_expression: member access (extractor line 276).

function extractFSharpParamName(node: TreeSitterNode): string[] | null {
  if (node.type === 'identifier') return [node.text];
  // Collect all identifier descendants for pattern-destructured params
  const names: string[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child?.type === 'identifier') names.push(child.text);
  }
  return names.length > 0 ? names : null;
}

function getFSharpParamListNode(funcNode: TreeSitterNode): TreeSitterNode | null {
  // function_declaration_left contains argument_patterns as a child
  for (let i = 0; i < funcNode.childCount; i++) {
    const child = funcNode.child(i);
    if (child?.type === 'argument_patterns') return child;
  }
  return null;
}

export const dataflowFSharp: DataflowRulesConfig = makeDataflowRules({
  functionNodes: new Set(['function_declaration_left']),
  nameField: 'name',

  getParamListNode: getFSharpParamListNode,
  paramWrapperTypes: new Set(['identifier']),
  extractParamName: extractFSharpParamName,

  returnNode: null, // F#: no explicit return; last expression is the result

  callNode: 'application_expression',
  // application_expression: first child is function (no named 'function' field).

  memberNode: 'dot_expression',
  // dot_expression field names are not standard; leave memberObjectField/memberPropertyField at defaults.
});

// ─── Gleam ────────────────────────────────────────────────────────────────────
//
// Gleam `function` and `external_function`: name via `childForFieldName('name')` (extractor line 70).
// Params: `childForFieldName('parameters')` or findChild('function_parameters') (extractor line 221).
// Each param is `function_parameter` or `parameter` with `childForFieldName('name')` (extractor line 228).
// No explicit return keyword in Gleam. returnNode: null.
// function_call/call: `childForFieldName('function')` (extractor line 202).
// field_access/module_select: `childForFieldName('field')` / `childForFieldName('label')` (extractor line 207).

function extractGleamParamName(node: TreeSitterNode): string[] | null {
  if (node.type === 'function_parameter' || node.type === 'parameter') {
    const nameNode = node.childForFieldName('name');
    if (nameNode) return [nameNode.text];
    for (const child of node.namedChildren) {
      if (child.type === 'identifier') return [child.text];
    }
  }
  if (node.type === 'identifier') return [node.text];
  return null;
}

export const dataflowGleam: DataflowRulesConfig = makeDataflowRules({
  functionNodes: new Set(['function', 'external_function']),
  nameField: 'name',

  paramListField: 'parameters',
  paramWrapperTypes: new Set(['function_parameter', 'parameter']),
  extractParamName: extractGleamParamName,

  returnNode: null, // Gleam: no explicit return; last expression is the result

  callNodes: new Set(['function_call', 'call']),
  callFunctionField: 'function',

  memberNode: 'field_access',
  memberObjectField: 'record',
  memberPropertyField: 'field',
});

// ─── Elixir ───────────────────────────────────────────────────────────────────
//
// Elixir functions are `call` nodes where target is `def`/`defp` (confirmed extractor).
// The extractor emits the function definition from `handleDefFunction` which walks
// `call` nodes. The actual function body lives inside a `do_block`.
// Params: inside `call` → `arguments` → inner `call` → `arguments` (extractor line 181-196).
// No explicit return keyword in Elixir. returnNode: null.
// Regular call: `call` nodes with `target` identifier (extractor handleElixirCall).
// Dot call: `call` with `dot` target (extractor handleDotCall).
//
// For dataflow purposes: the function scope is a `call` node with `def`/`defp` target.
// This requires a custom nameExtractor to identify which calls are function definitions.
// The simplified approach: mark `call` as a function node but filter by target in nameExtractor.

function extractElixirFunctionName(node: TreeSitterNode): string | null {
  if (node.type !== 'call') return null;
  const target = node.childForFieldName('target');
  if (target?.type !== 'identifier') return null;
  if (target.text !== 'def' && target.text !== 'defp') return null;
  // Extract the function name from arguments → first call → target identifier
  const args =
    node.childForFieldName('arguments') ??
    (() => {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child?.type === 'arguments') return child;
      }
      return null;
    })();
  if (!args) return null;
  for (let i = 0; i < args.childCount; i++) {
    const child = args.child(i);
    if (!child) continue;
    if (child.type === 'call') {
      const fnTarget = child.childForFieldName('target');
      if (fnTarget?.type === 'identifier') return fnTarget.text;
    }
    if (child.type === 'identifier') return child.text;
  }
  return null;
}

export const dataflowElixir: DataflowRulesConfig = makeDataflowRules({
  functionNodes: new Set(['call']),
  nameField: 'target',
  nameExtractor: extractElixirFunctionName,

  // Param list extraction is complex for Elixir (nested calls inside arguments).
  // Leave at defaults — param list discovery will gracefully return null.

  returnNode: null, // Elixir: no explicit return; last expression is the result

  callNode: 'call',
  // Elixir call nodes use 'target' for the function name, not 'function'.
  // Leave callFunctionField at default 'function' — will return null gracefully.
  // The primary value here is function scope marking.
});

// ─── Erlang ───────────────────────────────────────────────────────────────────
//
// Erlang `fun_decl` contains `function_clause` children.
// The extractor handles `fun_decl` by extracting from the first `function_clause`.
// function_clause: name via `childForFieldName('name')` or `findChild(node, 'atom')` (extractor line 151).
// Params: `childForFieldName('args')` or findChild('expr_args') (extractor line 179).
// Each arg in expr_args is a named child (pattern). arity preserved by param count.
// No explicit return keyword in Erlang. returnNode: null.
// call: first named child is function (extractor line 272).

function extractErlangParamName(node: TreeSitterNode): string[] | null {
  // Erlang params are pattern nodes; var/atom get their text as name
  if (node.type === 'var' || node.type === 'atom') return [node.text];
  // For complex patterns, use a placeholder
  return [`_${node.startPosition.row}`];
}

function getErlangParamListNode(funcNode: TreeSitterNode): TreeSitterNode | null {
  // fun_decl: find first function_clause, then its expr_args
  if (funcNode.type === 'fun_decl') {
    for (let i = 0; i < funcNode.childCount; i++) {
      const child = funcNode.child(i);
      if (child?.type === 'function_clause') {
        const args = child.childForFieldName('args');
        if (args) return args;
        for (let j = 0; j < child.childCount; j++) {
          const argChild = child.child(j);
          if (argChild?.type === 'expr_args') return argChild;
        }
      }
    }
  }
  // function_clause directly: find expr_args
  if (funcNode.type === 'function_clause') {
    const args = funcNode.childForFieldName('args');
    if (args) return args;
    for (let i = 0; i < funcNode.childCount; i++) {
      const child = funcNode.child(i);
      if (child?.type === 'expr_args') return child;
    }
  }
  return null;
}

export const dataflowErlang: DataflowRulesConfig = makeDataflowRules({
  functionNodes: new Set(['fun_decl', 'function_clause']),
  nameField: 'name',

  getParamListNode: getErlangParamListNode,
  extractParamName: extractErlangParamName,

  returnNode: null, // Erlang: no explicit return; last expression is the result

  callNode: 'call',
  // Erlang call: first named child is function (atom or remote). No named 'function' field.
});

// ─── Clojure ──────────────────────────────────────────────────────────────────
//
// Clojure functions are `list_lit` nodes where first symbol is `defn`/`defn-`/`defmacro`.
// The extractor uses `findFirstSymbol` / `findSecondSymbol` helpers.
// The function name is the second symbol in the list.
// Params: first `vec_lit` child after the name (extractor extractClojureParams line 222).
// No explicit return keyword in Clojure. returnNode: null.
// Regular calls: `list_lit` nodes where first symbol is not a def form (extractor default case).
//
// nameExtractor must distinguish function-defining lists from call lists.

function extractClojureFunctionName(node: TreeSitterNode): string | null {
  if (node.type !== 'list_lit') return null;
  // Find first symbol — skip delimiters and metadata
  let firstSym: TreeSitterNode | null = null;
  let secondSym: TreeSitterNode | null = null;
  let count = 0;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if ('()[]{}#'.includes(child.type) || child.type === 'meta_lit') continue;
    if (child.type === 'sym_lit' || child.type === 'kwd_lit') {
      count++;
      if (count === 1) firstSym = child;
      else if (count === 2) {
        secondSym = child;
        break;
      }
    }
  }
  if (!firstSym) return null;
  const keyword = firstSym.text;
  if (
    keyword !== 'defn' &&
    keyword !== 'defn-' &&
    keyword !== 'defmacro' &&
    keyword !== 'defmethod'
  )
    return null;
  return secondSym ? secondSym.text : null;
}

function getClojureParamListNode(funcNode: TreeSitterNode): TreeSitterNode | null {
  if (funcNode.type !== 'list_lit') return null;
  // Find the first vec_lit child (the parameter vector)
  for (let i = 0; i < funcNode.childCount; i++) {
    const child = funcNode.child(i);
    if (child?.type === 'vec_lit') return child;
  }
  return null;
}

function extractClojureParamName(node: TreeSitterNode): string[] | null {
  if (node.type === 'sym_lit') return [node.text];
  return null;
}

export const dataflowClojure: DataflowRulesConfig = makeDataflowRules({
  functionNodes: new Set(['list_lit']),
  nameField: 'name',
  nameExtractor: extractClojureFunctionName,

  getParamListNode: getClojureParamListNode,
  paramWrapperTypes: new Set(['sym_lit']),
  extractParamName: extractClojureParamName,

  returnNode: null, // Clojure: no explicit return; last expression is the result

  callNode: 'list_lit',
  // Clojure calls are also list_lit nodes — first sym is the function name.
  // The dataflow visitor will see these as calls (not function defs) since
  // nameExtractor returns null for non-def forms.
});
