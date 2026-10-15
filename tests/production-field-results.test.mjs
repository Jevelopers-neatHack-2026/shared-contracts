import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkProductionDraftBatchResult, checkProductionDraftRowResult, checkProductionFieldReadBinding, verifyProductionDraftStoredFiles } from '../tooling/production-field-boundaries.mjs';
import { clone, productionDraftSeed } from './production-field-results-seeds.mjs';

const sourceCases = new Set();
function caseTest(id, title, body) {
  sourceCases.add(id);
  test(id + ' ' + title, body);
}
const code = result => result.errors[0]?.code;

caseTest('READ-CURRENT', 'binds one row to the current host observation and explicit expiry', async () => {
  const seed = await productionDraftSeed();
  const binding = seed.readBindings[0];
  const result = checkProductionFieldReadBinding(binding, seed.expectedReadBindings[0]);
  assert.equal(result.ok, true);
  assert.equal(result.value.authority_issued, false);
});

caseTest('READ-SCOPE', 'refuses a read binding for a different host scope', async () => {
  const seed = await productionDraftSeed();
  const changed = clone(seed.readBindings[0]);
  changed.scope.tenant_id = '123e4567-e89b-42d3-a456-000000000099';
  changed.binding_hash = '';
  const { productionFieldRecordHash } = await import('../tooling/production-field-boundaries-core.mjs');
  changed.binding_hash = productionFieldRecordHash(changed, 'binding_hash');
  assert.equal(code(checkProductionFieldReadBinding(changed, seed.expectedReadBindings[0])), 'BINDING_MISMATCH');
});

caseTest('READ-EXPIRED', 'refuses a stale or expired current observation', async () => {
  const seed = await productionDraftSeed();
  const expired = clone(seed.readBindings[0]);
  expired.expires_at = '2026-10-12T11:59:59Z';
  const { productionFieldRecordHash } = await import('../tooling/production-field-boundaries-core.mjs');
  expired.binding_hash = productionFieldRecordHash(expired, 'binding_hash');
  assert.equal(code(checkProductionFieldReadBinding(expired, seed.expectedReadBindings[0])), 'PERMISSION_EXPIRED');
});

caseTest('READ-REVOKED', 'refuses revoked access observations', async () => {
  const seed = await productionDraftSeed();
  const revoked = clone(seed.readBindings[0]);
  revoked.state = 'revoked';
  const { productionFieldRecordHash } = await import('../tooling/production-field-boundaries-core.mjs');
  revoked.binding_hash = productionFieldRecordHash(revoked, 'binding_hash');
  assert.equal(code(checkProductionFieldReadBinding(revoked, seed.expectedReadBindings[0])), 'PERMISSION_REVOKED');
});

caseTest('READ-UNAVAILABLE', 'requires an independently supplied host expectation', async () => {
  const seed = await productionDraftSeed();
  assert.equal(code(checkProductionFieldReadBinding(seed.readBindings[0], undefined)), 'NEEDS_EXTERNAL_REVIEW');
  const unavailable = clone(seed.readBindings[0]);
  unavailable.state = 'unavailable';
  const { productionFieldRecordHash } = await import('../tooling/production-field-boundaries-core.mjs');
  unavailable.binding_hash = productionFieldRecordHash(unavailable, 'binding_hash');
  assert.equal(code(checkProductionFieldReadBinding(unavailable, seed.expectedReadBindings[0])), 'NEEDS_EXTERNAL_REVIEW');
});

caseTest('DRAFT-ROW-POSITIVE', 'keeps execution, render, storage and handoff facts separate', async () => {
  const seed = await productionDraftSeed();
  const context = seed.batchContext();
  const result = checkProductionDraftRowResult(seed.rowResultsBound[0], {
    scope: context.scope,
    job: context.job,
    original_rows: context.original_rows,
    expected_draft_output: context.expected_draft_outputs[0],
    read_binding: context.read_bindings[0],
    expected_read_binding: context.expected_read_bindings[0],
    expected_batch_state: context.expected_batch_state,
    now: context.now
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.row_result.status, 'succeeded');
  assert.equal(result.value.draft_output.render_state, 'succeeded');
  assert.equal(result.value.draft_output.storage_state, 'unknown');
  assert.equal(result.value.draft_output.handoff_eligibility, 'blocked');
});

caseTest('DRAFT-ROW-INELIGIBLE', 'does not relabel a blocked RowResult as eligible handoff', async () => {
  const seed = await productionDraftSeed();
  const value = clone(seed.rowResultsBound[0]);
  value.draft_output.handoff_eligibility = 'eligible';
  const context = seed.batchContext();
  context.expected_draft_outputs[0] = clone(value.draft_output);
  assert.equal(code(checkProductionDraftRowResult(value, {
    scope: context.scope,
    job: context.job,
    original_rows: context.original_rows,
    expected_draft_output: context.expected_draft_outputs[0],
    read_binding: context.read_bindings[0],
    expected_read_binding: context.expected_read_bindings[0],
    expected_batch_state: context.expected_batch_state,
    now: context.now
  })), 'INVALID_PUBLICATION');
});

caseTest('DRAFT-BATCH-ATOMIC', 'retains every row while a failed atomic job remains unpublished', async () => {
  const seed = await productionDraftSeed();
  const result = checkProductionDraftBatchResult(seed.batch, seed.batchContext());
  assert.equal(result.ok, true);
  assert.equal(result.value.batch.rows.length, 2);
  assert.equal(result.value.batch.publication_state, 'unpublished');
});

caseTest('DRAFT-BATCH-ATOMIC-LEAK', 'refuses any committed row output for a failed atomic job', async () => {
  const seed = await productionDraftSeed();
  const leaked = clone(seed.batch);
  leaked.rows[0].draft_output.publication_state = 'published';
  assert.equal(code(checkProductionDraftBatchResult(leaked, seed.batchContext())), 'ATOMIC_NOT_COMMITTED');
});

caseTest('DRAFT-BATCH-UNKNOWN', 'preserves unknown counts without converting them to zero', async () => {
  const seed = await productionDraftSeed();
  const batch = clone(seed.batch);
  batch.status = 'unknown';
  for (const key of Object.keys(batch.counts)) batch.counts[key] = { state: 'unknown' };
  const context = seed.batchContext();
  context.expected_batch_state.status = 'unknown';
  const result = checkProductionDraftBatchResult(batch, context);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.batch.counts.submitted, { state: 'unknown' });
  assert.deepEqual(result.value.batch.counts.published, { state: 'unknown' });
});

caseTest('DRAFT-BATCH-EMPTY-UNKNOWN', 'does not infer publication from an empty result with unknown counts', async () => {
  const seed = await productionDraftSeed();
  const batch = clone(seed.batch);
  batch.rows = [];
  batch.status = 'unknown';
  batch.publication_state = 'unknown';
  for (const key of Object.keys(batch.counts)) batch.counts[key] = { state: 'unknown' };
  const context = seed.batchContext();
  context.original_rows = [];
  context.read_bindings = [];
  context.expected_read_bindings = [];
  context.expected_draft_outputs = [];
  context.expected_batch_state.status = 'unknown';
  context.expected_batch_state.publication_state = 'unknown';
  assert.equal(checkProductionDraftBatchResult(batch, context).ok, true);
});

caseTest('DRAFT-BATCH-PARTIAL', 'keeps every partial outcome and row diagnostic in source order', async () => {
  const seed = await productionDraftSeed();
  const batch = clone(seed.batch);
  batch.acceptance_policy = 'allow_partial';
  batch.status = 'partially_succeeded';
  const context = seed.batchContext();
  context.expected_batch_state.acceptance_policy = 'allow_partial';
  context.expected_batch_state.status = 'partially_succeeded';
  const result = checkProductionDraftBatchResult(batch, context);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.batch.rows.map(row => row.row_result.row_id), ['synthetic-row-001', 'synthetic-row-002']);
  assert.equal(result.value.batch.rows[1].row_result.errors.length, 1);
});

caseTest('DRAFT-BATCH-OMIT', 'rejects an omitted row rather than inferring a smaller count', async () => {
  const seed = await productionDraftSeed();
  const batch = clone(seed.batch);
  batch.rows.pop();
  assert.equal(code(checkProductionDraftBatchResult(batch, seed.batchContext())), 'ROW_ORDER_MISMATCH');
});

caseTest('DRAFT-BATCH-ORDER', 'rejects reordered row results', async () => {
  const seed = await productionDraftSeed();
  const batch = clone(seed.batch);
  batch.rows.reverse();
  assert.equal(code(checkProductionDraftBatchResult(batch, seed.batchContext())), 'ROW_ORDER_MISMATCH');
});

caseTest('DRAFT-STORED-BYTES', 'verifies bytes separately and keeps eligibility blocked', async () => {
  const seed = await productionDraftSeed();
  const trusted = seed.calibration.trusted_commitment;
  const result = verifyProductionDraftStoredFiles(seed.observedFiles, trusted, { scope: seed.calibration.scope, bundle_ref: trusted });
  assert.equal(result.ok, true);
  assert.equal(result.value.integrity, 'verified');
  assert.equal(result.value.eligibility, 'blocked');
});

caseTest('DRAFT-STORAGE-HIDDEN', 'rejects hidden metadata on observed stored-file descriptors', async () => {
  const seed = await productionDraftSeed();
  const files = clone(seed.observedFiles);
  Object.defineProperty(files[0], 'hidden', { value: true, enumerable: false });
  const trusted = seed.calibration.trusted_commitment;
  assert.equal(code(verifyProductionDraftStoredFiles(files, trusted, { scope: seed.calibration.scope, bundle_ref: trusted })), 'INVALID_INPUT');
});

caseTest('PFB-RESULT-CASE-MAP', 'connects proposal criteria to executable result cases', async () => {
  const proposal = JSON.parse(await readFile(new URL('../compatibility/production-field-boundaries-proposal.json', import.meta.url), 'utf8'));
  const required = proposal.criteria.flatMap(criterion => criterion.source_cases).filter(id => id.startsWith('READ-') || id.startsWith('DRAFT-'));
  for (const id of required) assert.ok(sourceCases.has(id), 'missing source case ' + id);
});
