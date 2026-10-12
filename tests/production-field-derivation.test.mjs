import test from 'node:test';
import assert from 'node:assert/strict';
import { checkProductionDerivationBinding, compareProductionDerivationReplay } from '../tooling/production-field-boundaries.mjs';
import { productionFieldRecordHash } from '../tooling/production-field-boundaries-core.mjs';
import { clone, productionDerivationSeed } from './production-field-derivation-seeds.mjs';

const sourceCases = new Set();
function caseTest(id, title, body) {
  sourceCases.add(id);
  test(id + ' ' + title, body);
}
const code = result => result.errors[0]?.code;

caseTest('DERIVATION-EXACT', 'matches an exact standalone tuple with a current derived read observation', async () => {
  const seed = await productionDerivationSeed();
  const result = checkProductionDerivationBinding(seed.binding, seed.context);
  assert.equal(result.ok, true);
  assert.equal(result.value.renderer_authorized, false);
  assert.equal(result.value.export_authorized, false);
  assert.equal(result.value.approval_carried_forward, false);
});

caseTest('DERIVATION-MISSING', 'requires an independently current exact derived permission', async () => {
  const seed = await productionDerivationSeed();
  const missing = { scope: seed.scope, expected_binding: seed.binding, now: seed.vectors.clock.now };
  assert.equal(code(checkProductionDerivationBinding(seed.binding, missing)), 'NEEDS_EXTERNAL_REVIEW');
});

caseTest('DERIVATION-EXPIRED', 'refuses stale derived permission observations', async () => {
  const seed = await productionDerivationSeed();
  const context = clone(seed.context);
  context.current_read_binding.expires_at = '2026-10-12T11:59:59Z';
  context.current_read_binding.binding_hash = productionFieldRecordHash(context.current_read_binding, 'binding_hash');
  assert.equal(code(checkProductionDerivationBinding(seed.binding, context)), 'NEEDS_EXTERNAL_REVIEW');
});

caseTest('DERIVATION-MATERIAL', 'requires external review for material changes even with a current read observation', async () => {
  const seed = await productionDerivationSeed();
  const binding = clone(seed.binding);
  binding.change_classification = 'material';
  binding.binding_hash = productionFieldRecordHash(binding, 'binding_hash');
  assert.equal(code(checkProductionDerivationBinding(binding, { ...seed.context, expected_binding: binding })), 'NEEDS_EXTERNAL_REVIEW');
});

caseTest('DERIVATION-WRONG-LINEAGE', 'rejects equal input content under a different parent identity', async () => {
  const seed = await productionDerivationSeed();
  const unrelated = clone(seed.binding);
  unrelated.parent_ref.id = '123e4567-e89b-42d3-a456-000000000399';
  unrelated.binding_hash = productionFieldRecordHash(unrelated, 'binding_hash');
  assert.equal(unrelated.input_hash, seed.binding.input_hash);
  assert.equal(code(checkProductionDerivationBinding(unrelated, seed.context)), 'DERIVATION_MISMATCH');
});

caseTest('DERIVATION-NULL-PAIR', 'keeps standalone job and row associations explicitly null', async () => {
  const seed = await productionDerivationSeed();
  assert.deepEqual(seed.binding.association, { kind: 'standalone', job_ref: null, row_id: null, ordinal: null, input_hash: null });
  const partial = clone(seed.binding);
  partial.association = { kind: 'standalone', job_ref: null, row_id: null, ordinal: null, input_hash: seed.binding.input_hash };
  partial.binding_hash = productionFieldRecordHash(partial, 'binding_hash');
  assert.equal(code(checkProductionDerivationBinding(partial, { ...seed.context, expected_binding: partial })), 'INVALID_INPUT');
});

caseTest('DERIVATION-ROW-BOUND', 'retains a complete job and row tuple when one exists', async () => {
  const seed = await productionDerivationSeed();
  const binding = clone(seed.binding);
  const job = (await import('./production-seeds.mjs')).calibration.batch.job;
  binding.association = { kind: 'row', job_ref: clone(job), row_id: 'synthetic-row-001', ordinal: 0, input_hash: binding.input_hash };
  binding.binding_hash = productionFieldRecordHash(binding, 'binding_hash');
  const access = clone(seed.readBinding);
  access.association = clone(binding.association);
  access.derivation_hash = binding.binding_hash;
  access.binding_hash = productionFieldRecordHash(access, 'binding_hash');
  const expected = clone(access);
  for (const key of ['contract', 'schema_version', 'policy_version', 'state', 'binding_hash', 'observed_at', 'expires_at']) delete expected[key];
  expected.now = seed.vectors.clock.now;
  const context = { ...seed.context, expected_binding: binding, current_read_binding: access, expected_read_binding: expected };
  assert.equal(checkProductionDerivationBinding(binding, context).ok, true);
});

caseTest('DERIVATION-SAME-HASH-WRONG-JOB', 'does not join same input hashes across different jobs', async () => {
  const seed = await productionDerivationSeed();
  const first = clone(seed.binding);
  const second = clone(seed.binding);
  const jobRef = (await import('./production-seeds.mjs')).calibration.batch.job;
  second.association = { kind: 'row', job_ref: { ...clone(jobRef), job_ref: { ...clone(jobRef.job_ref), id: '123e4567-e89b-42d3-a456-000000000398' } }, row_id: 'synthetic-row-001', ordinal: 0, input_hash: second.input_hash };
  second.binding_hash = productionFieldRecordHash(second, 'binding_hash');
  assert.equal(first.input_hash, second.input_hash);
  assert.equal(code(compareProductionDerivationReplay(first, second, seed.context)), 'REPLAY_CONFLICT');
});

caseTest('REPLAY-NOOP', 'classifies exact replay without a new render, export or carried approval', async () => {
  const seed = await productionDerivationSeed();
  const result = compareProductionDerivationReplay(seed.binding, seed.binding, seed.context);
  assert.equal(result.ok, true);
  assert.equal(result.value.disposition, 'NO_OP');
  assert.equal(result.value.new_render_required, false);
  assert.equal(result.value.new_export_required, false);
  assert.equal(result.value.approval_carried_forward, false);
});

caseTest('REPLAY-TUPLE-CHANGED', 'rejects replay if any immutable derivation identity changes', async () => {
  const seed = await productionDerivationSeed();
  const changed = clone(seed.binding);
  changed.plan_hash = 'sha256:' + '9'.repeat(64);
  changed.binding_hash = productionFieldRecordHash(changed, 'binding_hash');
  assert.equal(code(compareProductionDerivationReplay(seed.binding, changed, seed.context)), 'REPLAY_CONFLICT');
});

caseTest('REPLAY-EXPIRED', 'requires fresh access for an unchanged replay', async () => {
  const seed = await productionDerivationSeed();
  const context = clone(seed.context);
  context.current_read_binding.expires_at = '2026-10-12T11:59:59Z';
  context.current_read_binding.binding_hash = productionFieldRecordHash(context.current_read_binding, 'binding_hash');
  assert.equal(code(compareProductionDerivationReplay(seed.binding, seed.binding, context)), 'NEEDS_EXTERNAL_REVIEW');
});

caseTest('DERIVATION-CASE-MAP', 'connects proposal criteria to executable derivation cases', async () => {
  const { readFile } = await import('node:fs/promises');
  const proposal = JSON.parse(await readFile(new URL('../compatibility/production-field-boundaries-proposal.json', import.meta.url), 'utf8'));
  const cases = proposal.criteria.flatMap(criterion => criterion.source_cases).filter(id => id.startsWith('DERIVATION-') || id.startsWith('REPLAY-'));
  assert.ok(cases.length > 0);
  for (const id of cases) assert.ok(sourceCases.has(id), 'missing source case ' + id);
});
