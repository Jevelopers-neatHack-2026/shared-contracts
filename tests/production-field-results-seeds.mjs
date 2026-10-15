import { readFile } from 'node:fs/promises';
import { hashBytes, hashManifest } from '../tooling/runtime.mjs';
import { productionFieldRecordHash } from '../tooling/production-field-boundaries-core.mjs';
import { calibration as productionCalibration, observedFiles as productionObservedFiles, clone as cloneProduction } from './production-seeds.mjs';

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
export const clone = value => structuredClone(value);

export async function productionDraftSeed() {
  const [vectors, rowFixture, errorFixture, jobFixture, readFixture] = await Promise.all([
    readJson('../fixtures/ProductionFieldBoundaryVectors.json'),
    readJson('../fixtures/RowResult.json'),
    readJson('../fixtures/ProductionError.json'),
    readJson('../fixtures/JobRef.json'),
    readJson('../fixtures/ProductionFieldReadBinding.json')
  ]);
  const scope = { tenant_id: '123e4567-e89b-42d3-a456-000000000001', project_id: '123e4567-e89b-42d3-a456-000000000002' };
  const job = clone(jobFixture.valid);
  const csvHash = hashBytes(Buffer.from(vectors.csv.text, 'utf8'));
  const originalRows = [
    { row_id: 'synthetic-row-001', fields: { name: 'Synthetic Person A', detail: '0008' } },
    { row_id: 'synthetic-row-002', fields: { name: 'Persona 2', detail: '0007' } }
  ];
  const rowResults = originalRows.map((row, ordinal) => {
    const failed = ordinal === 1;
    const errors = failed ? [{ ...clone(errorFixture.valid), row_id: row.row_id }] : [];
    return {
      ...clone(rowFixture.valid),
      tenant_id: scope.tenant_id,
      project_id: scope.project_id,
      job: clone(job),
      row_id: row.row_id,
      ordinal,
      input_hash: hashManifest(row),
      status: failed ? 'failed' : 'succeeded',
      errors,
      source_position: { file_hash: csvHash, logical_record: ordinal + 1, physical_line: ordinal + 2, source_paths: { name: 'headers.attendee', detail: 'headers.seat' } }
    };
  });
  const draftOutputs = rowResults.map((row, ordinal) => ({
    visibility: 'restricted_draft',
    composition_ref: null,
    artifact_ref: null,
    bundle_ref: null,
    file_commitments: [],
    render_state: ordinal === 0 ? 'succeeded' : 'failed',
    render_hash: ordinal === 0 ? 'sha256:' + 'a'.repeat(64) : null,
    storage_state: 'unknown',
    integrity_state: 'unknown',
    handoff_eligibility: 'blocked',
    publication_state: 'unpublished'
  }));
  const rowResultsBound = rowResults.map((row, index) => ({ contract: 'ProductionDraftRowResult', schema_version: '1.0.0', policy_version: '1.0.0', row_result: row, draft_output: draftOutputs[index] }));
  const readBindings = rowResults.map((row, index) => {
    const binding = clone(readFixture.valid);
    binding.permission_key = 'synthetic-read-observation-' + String(index + 1).padStart(3, '0');
    binding.association = { kind: 'row', job_ref: clone(job), row_id: row.row_id, ordinal: row.ordinal, input_hash: row.input_hash };
    binding.binding_hash = '';
    binding.binding_hash = productionFieldRecordHash(binding, 'binding_hash');
    return binding;
  });
  const expectedReadBindings = readBindings.map(binding => {
    const expected = clone(binding);
    for (const key of ['contract', 'schema_version', 'policy_version', 'state', 'binding_hash', 'observed_at', 'expires_at']) delete expected[key];
    expected.now = vectors.clock.now;
    return expected;
  });
  const batch = {
    contract: 'ProductionDraftBatchResult',
    schema_version: '1.0.0',
    policy_version: '1.0.0',
    ...scope,
    job: clone(job),
    acceptance_policy: 'atomic',
    status: 'failed',
    counts: {
      submitted: { state: 'known', value: 2 },
      succeeded: { state: 'known', value: 1 },
      failed: { state: 'known', value: 1 },
      cancelled: { state: 'known', value: 0 },
      skipped: { state: 'known', value: 0 },
      pending: { state: 'known', value: 0 },
      published: { state: 'known', value: 0 }
    },
    publication_state: 'unpublished',
    visibility: 'restricted_draft',
    rows: clone(rowResultsBound)
  };
  const expectedBatchState = { job: clone(job), acceptance_policy: batch.acceptance_policy, status: batch.status, publication_state: batch.publication_state };
  const batchContext = () => ({
    scope: clone(scope),
    job: clone(job),
    original_rows: clone(originalRows),
    read_bindings: clone(readBindings),
    expected_read_bindings: clone(expectedReadBindings),
    expected_draft_outputs: clone(draftOutputs),
    expected_batch_state: clone(expectedBatchState),
    now: vectors.clock.now
  });
  const calibration = cloneProduction(productionCalibration);
  const observedFiles = productionObservedFiles();
  return { vectors, scope, job, originalRows, rowResults, draftOutputs, rowResultsBound, readBindings, expectedReadBindings, batch, expectedBatchState, batchContext, calibration, observedFiles };
}

export function readExpectation(binding, now) {
  const expected = clone(binding);
  for (const key of ['contract', 'schema_version', 'policy_version', 'state', 'binding_hash', 'observed_at', 'expires_at']) delete expected[key];
  expected.now = now;
  return expected;
}
