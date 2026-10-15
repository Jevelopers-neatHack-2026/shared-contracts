import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkProductionDraftBatchResult, checkProductionFieldReadBinding, productionFieldLimits } from '../tooling/production-field-boundaries.mjs';
import { clone, productionDraftSeed } from './production-field-results-seeds.mjs';

const sourceCases = new Set();
function caseTest(id, title, body) {
  sourceCases.add(id);
  test(id + ' ' + title, body);
}
const code = result => result.errors[0]?.code;

caseTest('PREFLIGHT-GETTER', 'rejects accessors before invoking user code', async () => {
  const seed = await productionDraftSeed();
  let calls = 0;
  const expected = clone(seed.expectedReadBindings[0]);
  Object.defineProperty(expected, 'actor_id', { enumerable: true, get() { calls++; return 'synthetic_actor'; } });
  assert.equal(code(checkProductionFieldReadBinding(seed.readBindings[0], expected)), 'INVALID_TRUST_CONTEXT');
  assert.equal(calls, 0);
});

caseTest('PREFLIGHT-HIDDEN', 'rejects hidden expected-context properties', async () => {
  const seed = await productionDraftSeed();
  const expected = clone(seed.expectedReadBindings[0]);
  Object.defineProperty(expected, 'hidden', { value: true, enumerable: false });
  assert.equal(code(checkProductionFieldReadBinding(seed.readBindings[0], expected)), 'INVALID_TRUST_CONTEXT');
});

caseTest('PREFLIGHT-SYMBOL', 'rejects symbol properties in references and expectations', async () => {
  const seed = await productionDraftSeed();
  const expected = clone(seed.expectedReadBindings[0]);
  expected[Symbol('unserialized')] = true;
  assert.equal(code(checkProductionFieldReadBinding(seed.readBindings[0], expected)), 'INVALID_TRUST_CONTEXT');
  const binding = clone(seed.readBindings[0]);
  binding[Symbol('unserialized')] = true;
  assert.equal(code(checkProductionFieldReadBinding(binding, seed.expectedReadBindings[0])), 'INVALID_INPUT');
});

caseTest('PREFLIGHT-CYCLE', 'rejects cyclic host expectations', async () => {
  const seed = await productionDraftSeed();
  const expected = clone(seed.expectedReadBindings[0]);
  expected.self = expected;
  assert.equal(code(checkProductionFieldReadBinding(seed.readBindings[0], expected)), 'INVALID_TRUST_CONTEXT');
});

caseTest('PREFLIGHT-ERROR-PROPAGATES', 'does not hide unrelated proxy errors', async () => {
  const seed = await productionDraftSeed();
  const error = new Error('unrelated preflight failure');
  const value = new Proxy(seed.readBindings[0], { ownKeys() { throw error; } });
  assert.throws(() => checkProductionFieldReadBinding(value, seed.expectedReadBindings[0]), actual => actual === error);
});

caseTest('RESOURCE-JSON', 'bounds canonical JSON before hashing commitments', async () => {
  const seed = await productionDraftSeed();
  const expected = { ...clone(seed.expectedReadBindings[0]), oversized: 'x'.repeat(productionFieldLimits.maximum_json_bytes + 10) };
  assert.equal(code(checkProductionFieldReadBinding(seed.readBindings[0], expected)), 'RESOURCE_LIMIT');
});

caseTest('RESOURCE-COLLECTION', 'bounds complete row collections before processing results', async () => {
  const seed = await productionDraftSeed();
  const batch = clone(seed.batch);
  batch.rows = [];
  const context = seed.batchContext();
  context.original_rows = Array.from({ length: productionFieldLimits.maximum_rows + 1 }, (_, index) => ({ row_id: 'synthetic-row-' + index, fields: {} }));
  context.read_bindings = [];
  context.expected_read_bindings = [];
  context.expected_draft_outputs = [];
  assert.equal(code(checkProductionDraftBatchResult(batch, context)), 'RESOURCE_LIMIT');
});

caseTest('PREFLIGHT-CASE-MAP', 'connects proposal criteria to executable canonical-preflight cases', async () => {
  const proposal = JSON.parse(await readFile(new URL('../compatibility/production-field-boundaries-proposal.json', import.meta.url), 'utf8'));
  const required = proposal.criteria.flatMap(criterion => criterion.source_cases).filter(id => (id.startsWith('PREFLIGHT-') && !id.startsWith('PREFLIGHT-CSV-')) || id.startsWith('RESOURCE-'));
  assert.ok(required.length > 0);
  for (const id of required) assert.ok(sourceCases.has(id), 'missing source case ' + id);
});
