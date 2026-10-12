import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hashBytes, hashManifest } from '@jevelopers/shared-contracts';
import { productionContentHash } from '@jevelopers/shared-contracts/production-operations';
import {
  checkProductionCsvBatchRequest,
  checkProductionCsvInputBytes,
  checkProductionDraftBatchResult,
  checkProductionDraftRowResult,
  checkProductionDerivationBinding,
  checkProductionFieldReadBinding,
  compareProductionDerivationReplay,
  productionFieldRecordHash,
  verifyProductionDraftStoredFiles
} from '@jevelopers/shared-contracts/production-field-boundaries';

const read = async name => JSON.parse(await readFile(new URL('../fixtures/' + name + '.json', import.meta.url), 'utf8'));
const clone = value => structuredClone(value);
const caseIds = [];
function pass(id, result) {
  assert.equal(result.ok, true, id + ' failed: ' + JSON.stringify(result.errors ?? []));
  caseIds.push(id);
  return result.value;
}
function refuse(id, result, expectedCode) {
  assert.equal(result.ok, false, id + ' unexpectedly passed');
  assert.equal(result.errors[0]?.code, expectedCode, id + ' returned ' + JSON.stringify(result.errors));
  caseIds.push(id);
}
function readExpectation(binding, now) {
  const expected = clone(binding);
  for (const key of ['contract', 'schema_version', 'policy_version', 'state', 'binding_hash', 'observed_at', 'expires_at']) delete expected[key];
  expected.now = now;
  return expected;
}
function sealRecord(value, field = 'content_hash') {
  value[field] = '';
  value[field] = productionFieldRecordHash(value, field);
  return value;
}

const vectors = await read('ProductionFieldBoundaryVectors');
const scope = { tenant_id: vectors.canonical_ids.tenant, project_id: vectors.canonical_ids.project };
const bytes = Buffer.from(vectors.csv.text, 'utf8');
const inputPolicy = sealRecord(clone((await read('ProductionCsvInputPolicy')).valid));
const inputRef = sealRecord({ ...clone((await read('ProductionCsvInputReference')).valid), byte_hash: hashBytes(bytes), byte_size: bytes.byteLength });
const dialect = clone((await read('CsvDialect')).valid);
dialect.id = '123e4567-e89b-42d3-a456-000000000204'; dialect.bom = 'forbidden'; dialect.newline = 'crlf'; dialect.maximum_record_bytes = 1000; dialect.content_hash = ''; dialect.content_hash = productionContentHash(dialect);
const rowPolicy = (await read('PersonalizationSchema')).valid;
const mapping = clone((await read('CsvMapping')).valid);
mapping.id = '123e4567-e89b-42d3-a456-000000000205'; mapping.headers = [...vectors.csv.headers]; mapping.field_mapping = { attendee: 'name', seat: 'detail' }; mapping.row_id_header = 'id'; mapping.content_hash = productionContentHash(mapping);
const ref = value => ({ contract: value.contract, schema_version: value.schema_version, id: value.id ?? value.schema_id, revision: value.revision, content_hash: value.content_hash });
const checkpoint = sealRecord({
  contract: 'ProductionCsvCheckpoint', schema_version: '1.0.0', policy_version: '1.0.0', ...scope,
  id: vectors.canonical_ids.checkpoint, revision: 1, content_hash: '', input_ref: clone(inputRef),
  dialect_ref: ref(dialect), mapping_ref: ref(mapping), input_policy_ref: ref(inputPolicy), input_policy_hash: inputPolicy.content_hash,
  byte_offset: vectors.csv.complete_record_offsets[0], logical_record: vectors.csv.logical_records[0], physical_line: vectors.csv.physical_lines[0], complete_record: true
});
const request = clone((await read('ProductionCsvBatchRequest')).valid);
request.input = { kind: 'csv', input_ref: clone(inputRef), dialect_ref: ref(dialect), mapping_ref: ref(mapping), row_schema_ref: clone(mapping.row_schema_ref), input_policy_ref: ref(inputPolicy), input_policy_hash: inputPolicy.content_hash, checkpoint: clone(checkpoint) };
const inputReadBinding = clone((await read('ProductionFieldReadBinding')).valid);
inputReadBinding.permission_key = 'synthetic-csv-input-read-001';
inputReadBinding.purpose = 'csv_input_read';
inputReadBinding.association = { kind: 'standalone', job_ref: null, row_id: null, ordinal: null, input_hash: null };
inputReadBinding.csv_input_ref = clone(inputRef);
inputReadBinding.input_policy_hash = inputPolicy.content_hash;
sealRecord(inputReadBinding, 'binding_hash');
const expectedInputReadBinding = readExpectation(inputReadBinding, vectors.clock.now);
const csvContext = { scope, input_ref: inputRef, input_policy: inputPolicy, dialect, mapping, row_policy: rowPolicy, observed_headers: [...vectors.csv.headers], expected_binding: clone(request.binding), expected_checkpoint: clone(checkpoint), input_read_binding: inputReadBinding, expected_input_read_binding: expectedInputReadBinding, now: vectors.clock.now };
pass('INST-CSV-EXACT', checkProductionCsvBatchRequest(request, csvContext));
pass('INST-CSV-EXACT-BYTES', checkProductionCsvInputBytes(inputRef, bytes, { scope, input_ref: inputRef, policy: inputPolicy }));
pass('INST-CSV-READ', checkProductionFieldReadBinding(inputReadBinding, expectedInputReadBinding));
const expiredCsvRead = clone(inputReadBinding); expiredCsvRead.expires_at = '2026-10-12T11:59:59Z'; sealRecord(expiredCsvRead, 'binding_hash');
refuse('INST-CSV-READ-EXPIRED', checkProductionCsvBatchRequest(request, { ...csvContext, input_read_binding: expiredCsvRead }), 'PERMISSION_EXPIRED');
const foreignCsvRead = clone(inputReadBinding); foreignCsvRead.input_policy_hash = 'sha256:' + '9'.repeat(64); sealRecord(foreignCsvRead, 'binding_hash');
refuse('INST-CSV-READ-MISMATCH', checkProductionCsvBatchRequest(request, { ...csvContext, input_read_binding: foreignCsvRead }), 'BINDING_MISMATCH');
const tampered = Buffer.from(bytes); tampered[5] ^= 1;
refuse('INST-CSV-TAMPER', checkProductionCsvInputBytes(inputRef, tampered, { scope, input_ref: inputRef, policy: inputPolicy }), 'INPUT_CHANGED');
const oversizedPolicy = sealRecord({ ...inputPolicy, maximum_bytes: 10 });
refuse('INST-CSV-RESOURCE', checkProductionCsvInputBytes(inputRef, bytes, { scope, input_ref: inputRef, policy: oversizedPolicy }), 'RESOURCE_LIMIT');

const readBinding = clone((await read('ProductionFieldReadBinding')).valid);
sealRecord(readBinding, 'binding_hash');
const now = vectors.clock.now;
const readExpected = readExpectation(readBinding, now);
pass('INST-READ-CURRENT', checkProductionFieldReadBinding(readBinding, readExpected));
const foreignRead = clone(readBinding); foreignRead.scope.tenant_id = '123e4567-e89b-42d3-a456-000000000099'; sealRecord(foreignRead, 'binding_hash');
refuse('INST-READ-SCOPE', checkProductionFieldReadBinding(foreignRead, readExpected), 'BINDING_MISMATCH');
const staleRead = clone(readBinding); staleRead.expires_at = '2026-10-12T11:59:59Z'; sealRecord(staleRead, 'binding_hash');
refuse('INST-READ-EXPIRED', checkProductionFieldReadBinding(staleRead, readExpected), 'PERMISSION_EXPIRED');

const originalRows = clone((await read('PersonalizeBatchRequest')).valid.input.rows);
const draftRow = clone((await read('ProductionDraftRowResult')).valid);
const rowResult = draftRow.row_result;
const job = clone(rowResult.job);
const expectedDraftOutput = clone(draftRow.draft_output);
const rowRead = clone(readBinding);
rowRead.association = { kind: 'row', job_ref: clone(job), row_id: rowResult.row_id, ordinal: rowResult.ordinal, input_hash: rowResult.input_hash };
sealRecord(rowRead, 'binding_hash');
const rowReadExpected = readExpectation(rowRead, now);
const batchState = { job, acceptance_policy: 'atomic', status: 'failed', publication_state: 'unpublished' };
const rowContext = { scope, job, original_rows: [originalRows[0]], expected_draft_output: expectedDraftOutput, read_binding: rowRead, expected_read_binding: rowReadExpected, expected_batch_state: batchState, now };
pass('INST-DRAFT-ROW', checkProductionDraftRowResult(draftRow, rowContext));
const draftBatch = clone((await read('ProductionDraftBatchResult')).valid);
draftBatch.job = clone(job); draftBatch.status = 'unknown'; draftBatch.rows = [clone(draftRow)];
const batchContext = { scope, job, original_rows: [originalRows[0]], read_bindings: [rowRead], expected_read_bindings: [rowReadExpected], expected_draft_outputs: [expectedDraftOutput], expected_batch_state: { job, acceptance_policy: 'atomic', status: 'unknown', publication_state: 'unknown' }, now };
const unknown = pass('INST-DRAFT-UNKNOWN', checkProductionDraftBatchResult(draftBatch, batchContext));
assert.deepEqual(unknown.batch.counts.succeeded, { state: 'unknown' });
const atomic = clone(draftBatch); atomic.status = 'failed'; atomic.publication_state = 'unpublished';
atomic.rows[0].draft_output.publication_state = 'unpublished';
for (const [key, value] of Object.entries({ submitted: 1, succeeded: 1, failed: 0, cancelled: 0, skipped: 0, pending: 0, published: 0 })) atomic.counts[key] = { state: 'known', value };
const atomicContext = { ...batchContext, expected_draft_outputs: [clone(atomic.rows[0].draft_output)], expected_batch_state: { job, acceptance_policy: 'atomic', status: 'failed', publication_state: 'unpublished' } };
pass('INST-DRAFT-ATOMIC', checkProductionDraftBatchResult(atomic, atomicContext));
const atomicLeak = clone(atomic); atomicLeak.rows[0].draft_output.publication_state = 'published'; atomicLeak.publication_state = 'published';
refuse('INST-DRAFT-ATOMIC-LEAK', checkProductionDraftBatchResult(atomicLeak, { ...atomicContext, expected_batch_state: { ...atomicContext.expected_batch_state, publication_state: 'published' } }), 'ATOMIC_NOT_COMMITTED');

const calibration = JSON.parse(await readFile(new URL('../fixtures/ProductionCalibration.json', import.meta.url), 'utf8'));
const observedFiles = Object.entries(calibration.byte_files).map(([filename, encoded]) => ({ filename, bytes: Buffer.from(encoded, 'base64') }));
pass('INST-STORAGE-BYTES', verifyProductionDraftStoredFiles(observedFiles, calibration.trusted_commitment, { scope: calibration.scope, bundle_ref: calibration.trusted_commitment }));

const derivation = clone((await read('ProductionDerivationBinding')).valid);
sealRecord(derivation, 'binding_hash');
const derivedRead = clone(readBinding);
derivedRead.purpose = 'derived_output_read'; derivedRead.parent_ref = clone(derivation.parent_ref); derivedRead.derived_ref = clone(derivation.derived_ref); derivedRead.composition_ref = clone(derivation.derived_ref); derivedRead.derivation_hash = derivation.binding_hash;
sealRecord(derivedRead, 'binding_hash');
const derivedReadExpected = readExpectation(derivedRead, now);
const derivationContext = { scope, expected_binding: derivation, current_read_binding: derivedRead, expected_read_binding: derivedReadExpected, now };
pass('INST-DERIVATION-EXACT', checkProductionDerivationBinding(derivation, derivationContext));
refuse('INST-DERIVATION-REVIEW', checkProductionDerivationBinding(derivation, { scope, expected_binding: derivation, now }), 'NEEDS_EXTERNAL_REVIEW');
const unrelated = clone(derivation); unrelated.parent_ref.id = '123e4567-e89b-42d3-a456-000000000399'; sealRecord(unrelated, 'binding_hash');
refuse('INST-DERIVATION-LINEAGE', checkProductionDerivationBinding(unrelated, derivationContext), 'DERIVATION_MISMATCH');
const replay = pass('INST-REPLAY-NOOP', compareProductionDerivationReplay(derivation, derivation, derivationContext));
assert.equal(replay.new_render_required, false);
const changedReplay = clone(derivation); changedReplay.plan_hash = 'sha256:' + '9'.repeat(64); sealRecord(changedReplay, 'binding_hash');
refuse('INST-REPLAY-CHANGED', compareProductionDerivationReplay(derivation, changedReplay, derivationContext), 'REPLAY_CONFLICT');

const publicFixture = await read('ProductionFieldBoundaryVectors');
assert.equal(publicFixture.status, 'synthetic_calibration_only');
assert.equal(publicFixture.real_attendee_cells_included, false);
assert.equal(publicFixture.private_producer_ids_included, false);
caseIds.push('INST-SYNTHETIC-FIXTURE');

let getterCalls = 0;
const badExpected = { ...rowReadExpected };
Object.defineProperty(badExpected, 'scope', { enumerable: true, get() { getterCalls++; return scope; } });
refuse('INST-PREFLIGHT', checkProductionFieldReadBinding(rowRead, badExpected), 'INVALID_TRUST_CONTEXT');
assert.equal(getterCalls, 0);
console.log(JSON.stringify({ status: 'passed', case_ids: caseIds, count: caseIds.length, authority_issued: false }));
