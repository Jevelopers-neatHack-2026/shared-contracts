import { readFile } from 'node:fs/promises';
import { hashBytes } from '../tooling/runtime.mjs';
import { productionContentHash } from '../tooling/production-values.mjs';
import { productionFieldRecordHash } from '../tooling/production-field-boundaries-core.mjs';

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
export const clone = value => structuredClone(value);
export const vectors = await readJson('../fixtures/ProductionFieldBoundaryVectors.json');

export async function productionCsvSeed() {
  const [inputFixture, policyFixture, requestFixture, dialectFixture, mappingFixture, rowPolicyFixture, readBindingFixture] = await Promise.all([
    readJson('../fixtures/ProductionCsvInputReference.json'),
    readJson('../fixtures/ProductionCsvInputPolicy.json'),
    readJson('../fixtures/ProductionCsvBatchRequest.json'),
    readJson('../fixtures/CsvDialect.json'),
    readJson('../fixtures/CsvMapping.json'),
    readJson('../fixtures/PersonalizationSchema.json'),
    readJson('../fixtures/ProductionFieldReadBinding.json')
  ]);
  const scope = { tenant_id: inputFixture.valid.tenant_id, project_id: inputFixture.valid.project_id };
  const bytes = Buffer.from(vectors.csv.text, 'utf8');
  const policy = { ...policyFixture.valid, content_hash: '' };
  policy.content_hash = productionFieldRecordHash(policy);
  const inputRef = {
    ...inputFixture.valid,
    byte_hash: hashBytes(bytes),
    byte_size: bytes.byteLength,
    content_hash: ''
  };
  inputRef.content_hash = productionFieldRecordHash(inputRef);
  const dialect = {
    ...dialectFixture.valid,
    id: '123e4567-e89b-42d3-a456-000000000204',
    bom: 'forbidden',
    newline: 'crlf',
    maximum_record_bytes: 1000,
    content_hash: ''
  };
  dialect.content_hash = productionContentHash(dialect);
  const rowPolicy = rowPolicyFixture.valid;
  const mapping = {
    ...mappingFixture.valid,
    id: '123e4567-e89b-42d3-a456-000000000205',
    headers: [...vectors.csv.headers],
    field_mapping: { attendee: 'name', seat: 'detail' },
    row_id_header: 'id',
    content_hash: ''
  };
  mapping.content_hash = productionContentHash(mapping);
  const checkpoint = {
    contract: 'ProductionCsvCheckpoint',
    schema_version: '1.0.0',
    policy_version: '1.0.0',
    tenant_id: scope.tenant_id,
    project_id: scope.project_id,
    id: vectors.canonical_ids.checkpoint,
    revision: 1,
    content_hash: '',
    input_ref: clone(inputRef),
    dialect_ref: { contract: 'CsvDialect', schema_version: '1.0.0', id: dialect.id, revision: dialect.revision, content_hash: dialect.content_hash },
    mapping_ref: { contract: 'CsvMapping', schema_version: '1.0.0', id: mapping.id, revision: mapping.revision, content_hash: mapping.content_hash },
    input_policy_ref: { contract: 'ProductionCsvInputPolicy', schema_version: '1.0.0', id: policy.id, revision: policy.revision, content_hash: policy.content_hash },
    input_policy_hash: policy.content_hash,
    byte_offset: vectors.csv.complete_record_offsets[0],
    logical_record: vectors.csv.logical_records[0],
    physical_line: vectors.csv.physical_lines[0],
    complete_record: true
  };
  checkpoint.content_hash = productionFieldRecordHash(checkpoint);
  const inputReadBinding = clone(readBindingFixture.valid);
  inputReadBinding.permission_key = 'synthetic-csv-input-read-001';
  inputReadBinding.purpose = 'csv_input_read';
  inputReadBinding.association = { kind: 'standalone', job_ref: null, row_id: null, ordinal: null, input_hash: null };
  inputReadBinding.csv_input_ref = clone(inputRef);
  inputReadBinding.input_policy_hash = policy.content_hash;
  inputReadBinding.binding_hash = '';
  inputReadBinding.binding_hash = productionFieldRecordHash(inputReadBinding, 'binding_hash');
  const expectedInputReadBinding = clone(inputReadBinding);
  for (const key of ['contract', 'schema_version', 'policy_version', 'state', 'binding_hash', 'observed_at', 'expires_at']) delete expectedInputReadBinding[key];
  expectedInputReadBinding.now = vectors.clock.now;
  const request = clone(requestFixture.valid);
  request.input = {
    kind: 'csv',
    input_ref: clone(inputRef),
    dialect_ref: { contract: 'CsvDialect', schema_version: '1.0.0', id: dialect.id, revision: dialect.revision, content_hash: dialect.content_hash },
    mapping_ref: { contract: 'CsvMapping', schema_version: '1.0.0', id: mapping.id, revision: mapping.revision, content_hash: mapping.content_hash },
    row_schema_ref: clone(mapping.row_schema_ref),
    input_policy_ref: { contract: 'ProductionCsvInputPolicy', schema_version: '1.0.0', id: policy.id, revision: policy.revision, content_hash: policy.content_hash },
    input_policy_hash: policy.content_hash,
    checkpoint: clone(checkpoint)
  };
  const context = {
    scope,
    input_ref: clone(inputRef),
    input_policy: clone(policy),
    dialect: clone(dialect),
    mapping: clone(mapping),
    row_policy: clone(rowPolicy),
    observed_headers: [...vectors.csv.headers],
    expected_binding: clone(request.binding),
    expected_checkpoint: clone(checkpoint),
    input_read_binding: clone(inputReadBinding),
    expected_input_read_binding: clone(expectedInputReadBinding),
    now: vectors.clock.now
  };
  return { scope, bytes, inputRef, policy, dialect, mapping, rowPolicy, checkpoint, inputReadBinding, expectedInputReadBinding, request, context };
}
