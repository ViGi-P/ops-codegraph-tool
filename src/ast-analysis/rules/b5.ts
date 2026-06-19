import type { DataflowRulesConfig } from '../../types.js';
import { makeDataflowRules } from '../shared.js';

// ─── Zig ──────────────────────────────────────────────────────────────────────
//
// Zig function_declaration: name via `childForFieldName('name')` (confirmed in extractor line 68).
// Parameters: `childForFieldName('parameters')` (confirmed in extractor extractZigParams line 84).
// Each parameter is a `parameter` node; identifier child is the name (extractor line 89-90).
// return_statement: Zig has explicit return (confirmed in extractor + language spec).
// variable_declaration: name is first `identifier` child (extractor handleZigVariable line 99).
// call_expression: `childForFieldName('function')` (confirmed in extractor handleZigCallExpression line 209).
// field_expression/field_access: `childForFieldName('field')` or `childForFieldName('member')` (extractor line 215).
// member object: `childForFieldName('value')` or `funcNode.child(0)` (extractor line 216).

export const dataflowZig: DataflowRulesConfig = makeDataflowRules({
  functionNodes: new Set(['function_declaration']),
  nameField: 'name',

  paramListField: 'parameters',
  paramWrapperTypes: new Set(['parameter']),
  // Zig parameter: identifier child for the name (extractZigParams uses findChild(param, 'identifier'))
  paramIdentifier: 'identifier',

  returnNode: 'return_statement',

  varDeclaratorNode: 'variable_declaration',
  varNameField: 'name',

  callNode: 'call_expression',
  callFunctionField: 'function',
  callArgsField: 'arguments',

  memberNode: 'field_expression',
  memberObjectField: 'value',
  memberPropertyField: 'field',
});

// ─── Solidity ─────────────────────────────────────────────────────────────────
//
// Solidity function_definition: name via `childForFieldName('name')` (confirmed in extractor line 232).
// Parameters: `childForFieldName('parameters')` or findChild('parameter_list') (extractor line 355-357).
// Each parameter is a `parameter` node (extractor uses extractSimpleParameters with paramTypes: ['parameter']).
// return_statement: Solidity has explicit return.
// call_expression / function_call: both confirmed in extractor walkSolidityNode line 71-72.
// call_expression handler: `childForFieldName('function')` or `childForFieldName('callee')` (extractor line 336).
// member_expression: `childForFieldName('property')` (extractor line 342), `childForFieldName('object')` (line 343).

export const dataflowSolidity: DataflowRulesConfig = makeDataflowRules({
  functionNodes: new Set(['function_definition', 'modifier_definition']),
  nameField: 'name',

  paramListField: 'parameters',
  paramWrapperTypes: new Set(['parameter']),
  paramIdentifier: 'identifier',

  returnNode: 'return_statement',

  callNodes: new Set(['call_expression', 'function_call']),
  callFunctionField: 'function',
  callArgsField: 'arguments',

  memberNode: 'member_expression',
  memberObjectField: 'object',
  memberPropertyField: 'property',
});
