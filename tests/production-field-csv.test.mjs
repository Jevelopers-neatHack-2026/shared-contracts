import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hashBytes } from '../tooling/runtime.mjs';
import { productionContentHash } from '../tooling/production-values.mjs';
import { productionFieldRecordHash } from '../tooling/production-field-boundaries-core.mjs';
import { checkProductionCsvBatchRequest, checkProductionCsvInputBytes, checkProductionCsvInputPolicy, checkProductionCsvInputReference, checkProductionCsvOutputIsolation } from '../tooling/production-field-boundaries.mjs';
import { checkCsvInput } from '../tooling/production-csv.mjs';
import { clone, productionCsvSeed, vectors } from './production-field-csv-seeds.mjs';

const sourceCases = new Set();
function caseTest(id, title, body) {
  sourceCases.add(id);
  test(id + ' ' + title, body);
}
const code = result => result.errors[0]?.code;

caseTest('CSV-REF-EXACT', 'matches the immutable host input descriptor', async () => {
  const { inputRef } = await productionCsvSeed();
  const result = checkProductionCsvInputReference(inputRef, inputRef);
  assert.equal(result.ok, true);
  assert.equal(result.value.access_authorized, false);
});

caseTest('CSV-REF-MISMATCH', 'refuses a changed input commitment', async () => {
  const { inputRef } = await productionCsvSeed();
  const changed = { ...inputRef, byte_hash: 'sha256:' + 'a'.repeat(64), content_hash: '' };
  changed.content_hash = productionFieldRecordHash(changed);
  assert.equal(code(checkProductionCsvInputReference(changed, inputRef)), 'INPUT_CHANGED');
});

caseTest('CSV-BYTES-STRICT', 'checks exact bytes without parsing or exposing cells', async () => {
  const { bytes, inputRef, scope, policy } = await productionCsvSeed();
  const result = checkProductionCsvInputBytes(inputRef, bytes, { scope, input_ref: inputRef, policy });
  assert.equal(result.ok, true);
  assert.equal(result.value.byte_size, vectors.csv.byte_size);
  assert.equal(result.value.parser_invoked, false);
  assert.equal(result.value.decoded_text_returned, false);
});

caseTest('CSV-BYTES-TAMPER', 'rejects bytes whose digest differs from the immutable reference', async () => {
  const { bytes, inputRef, scope, policy } = await productionCsvSeed();
  const tampered = Buffer.from(bytes);
  tampered[5] = tampered[5] ^ 1;
  assert.equal(code(checkProductionCsvInputBytes(inputRef, tampered, { scope, input_ref: inputRef, policy })), 'INPUT_CHANGED');
});

caseTest('CSV-BOM', 'refuses a UTF-8 byte-order mark', async () => {
  const { inputRef, scope, policy } = await productionCsvSeed();
  const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(vectors.csv.text, 'utf8')]);
  const withBom = { ...inputRef, byte_hash: hashBytes(bytes), byte_size: bytes.byteLength, content_hash: '' };
  withBom.content_hash = productionFieldRecordHash(withBom);
  assert.equal(code(checkProductionCsvInputBytes(withBom, bytes, { scope, input_ref: withBom, policy })), 'BOM_FORBIDDEN');
});

caseTest('CSV-INVALID-UTF8', 'rejects invalid UTF-8 without interpreting CSV cells', async () => {
  const { inputRef, scope, policy } = await productionCsvSeed();
  const bytes = Buffer.from([0xff]);
  const invalid = { ...inputRef, byte_hash: hashBytes(bytes), byte_size: 1, content_hash: '' };
  invalid.content_hash = productionFieldRecordHash(invalid);
  assert.equal(code(checkProductionCsvInputBytes(invalid, bytes, { scope, input_ref: invalid, policy })), 'INVALID_ENCODING');
});

caseTest('CSV-RESOURCE', 'uses the supplied policy bound rather than the fixture sample default', async () => {
  const { bytes, inputRef, scope, policy } = await productionCsvSeed();
  const smallPolicy = { ...policy, maximum_bytes: 10, content_hash: '' };
  smallPolicy.content_hash = productionFieldRecordHash(smallPolicy);
  assert.equal(code(checkProductionCsvInputBytes(inputRef, bytes, { scope, input_ref: inputRef, policy: smallPolicy })), 'RESOURCE_LIMIT');
});

caseTest('CSV-BYTES-SYMBOL', 'rejects non-JSON metadata attached to byte buffers', async () => {
  const { bytes, inputRef, scope, policy } = await productionCsvSeed();
  const annotated = Buffer.from(bytes);
  annotated[Symbol('hidden')] = true;
  assert.equal(code(checkProductionCsvInputBytes(inputRef, annotated, { scope, input_ref: inputRef, policy })), 'INVALID_INPUT');
});

caseTest('CSV-REQUEST-EXACT', 'checks exact host scope, mapping, dialect, policy and complete-record checkpoint', async () => {
  const seed = await productionCsvSeed();
  const result = checkProductionCsvBatchRequest(seed.request, seed.context);
  assert.equal(result.ok, true);
  assert.equal(result.value.parser_implemented, false);
  assert.equal(result.value.launch_authorized, false);
  assert.equal(result.value.input_read_binding_matched, true);
  assert.equal(result.value.request.input.checkpoint.byte_offset, vectors.csv.complete_record_offsets[0]);
});

caseTest('CSV-REQUEST-READ-MISSING', 'blocks when the host supplies no current input read observation', async () => {
  const seed = await productionCsvSeed();
  const context = clone(seed.context);
  delete context.input_read_binding;
  assert.equal(code(checkProductionCsvBatchRequest(seed.request, context)), 'NEEDS_EXTERNAL_REVIEW');
});

caseTest('CSV-REQUEST-READ-EXPIRED', 'refuses an expired current input read observation', async () => {
  const seed = await productionCsvSeed();
  const context = clone(seed.context);
  context.input_read_binding.expires_at = '2026-10-12T11:59:59Z';
  context.input_read_binding.binding_hash = productionFieldRecordHash(context.input_read_binding, 'binding_hash');
  assert.equal(code(checkProductionCsvBatchRequest(seed.request, context)), 'PERMISSION_EXPIRED');
});

caseTest('CSV-REQUEST-READ-MISMATCH', 'refuses an input read observation bound to a different policy hash', async () => {
  const seed = await productionCsvSeed();
  const context = clone(seed.context);
  context.input_read_binding.input_policy_hash = 'sha256:' + '9'.repeat(64);
  context.input_read_binding.binding_hash = productionFieldRecordHash(context.input_read_binding, 'binding_hash');
  assert.equal(code(checkProductionCsvBatchRequest(seed.request, context)), 'BINDING_MISMATCH');
});

caseTest('CSV-MAPPING', 'rejects headers that differ from the canonical field map', async () => {
  const seed = await productionCsvSeed();
  const context = clone(seed.context);
  context.observed_headers[1] = 'guest';
  assert.equal(code(checkProductionCsvBatchRequest(seed.request, context)), 'MAPPING_MISMATCH');
});

caseTest('CSV-CHECKPOINT', 'rejects a checkpoint offset changed from the host stored boundary', async () => {
  const seed = await productionCsvSeed();
  const request = clone(seed.request);
  request.input.checkpoint.byte_offset = 49;
  request.input.checkpoint.content_hash = '';
  request.input.checkpoint.content_hash = productionFieldRecordHash(request.input.checkpoint);
  assert.equal(code(checkProductionCsvBatchRequest(request, seed.context)), 'CHECKPOINT_INVALID');
});

caseTest('CSV-OUTPUT-ISOLATION', 'rejects including the exact input bytes in a bundle output inventory', async () => {
  const { inputRef, scope } = await productionCsvSeed();
  const fixture = JSON.parse(await readFile(new URL('../fixtures/ProductionBundleRef.json', import.meta.url), 'utf8'));
  const bundleRef = clone(fixture.valid);
  assert.equal(checkProductionCsvOutputIsolation(inputRef, bundleRef, { scope, input_ref: inputRef, bundle_ref: bundleRef }).ok, true);
  const leaked = clone(bundleRef);
  leaked.file_set[0].byte_hash = inputRef.byte_hash;
  assert.equal(code(checkProductionCsvOutputIsolation(inputRef, leaked, { scope, input_ref: inputRef, bundle_ref: leaked })), 'INPUT_AS_OUTPUT');
});

caseTest('CSV-OLD-DISABLED', 'keeps the existing CSV route disabled before its reference callbacks', () => {
  let calls = 0;
  const context = { enabled: false, get enabling_ref() { calls++; return {}; } };
  assert.equal(code(checkCsvInput({}, context)), 'CAPABILITY_DISABLED');
  assert.equal(calls, 0);
});

caseTest('PREFLIGHT-CSV-GETTER', 'rejects accessor context without running its getter', async () => {
  const seed = await productionCsvSeed();
  let calls = 0;
  const context = clone(seed.context);
  Object.defineProperty(context, 'scope', { enumerable: true, get() { calls++; return seed.scope; } });
  assert.equal(code(checkProductionCsvBatchRequest(seed.request, context)), 'INVALID_TRUST_CONTEXT');
  assert.equal(calls, 0);
});

caseTest('PREFLIGHT-CSV-ERROR', 'propagates unrelated proxy failures', async () => {
  const { inputRef } = await productionCsvSeed();
  const error = new Error('unrelated proxy failure');
  const expected = new Proxy(inputRef, { ownKeys() { throw error; } });
  assert.throws(() => checkProductionCsvInputReference(inputRef, expected), actual => actual === error);
});

caseTest('PROVENANCE-SYNTHETIC-CALIBRATION', 'labels public producer-derived vectors synthetic and excludes raw source input', async () => {
  const raw = await readFile(new URL('../fixtures/ProductionFieldBoundaryVectors.json', import.meta.url), 'utf8');
  const value = JSON.parse(raw);
  assert.equal(value.status, 'synthetic_calibration_only');
  assert.equal(value.real_attendee_cells_included, false);
  assert.equal(value.private_producer_ids_included, false);
  assert.equal(value.csv.limits_are_fixture_values_only, true);
  assert.equal(raw.includes('/.execution/'), false);
});

caseTest('PFB-SOURCE-CASE-MAP', 'connects proposal criteria to executable source cases', async () => {
  const proposal = JSON.parse(await readFile(new URL('../compatibility/production-field-boundaries-proposal.json', import.meta.url), 'utf8'));
  const required = proposal.criteria.flatMap(criterion => criterion.source_cases).filter(id => id.startsWith('CSV-') || id.startsWith('PREFLIGHT-CSV-') || id.startsWith('PROVENANCE-'));
  assert.ok(required.length > 0);
  for (const id of required) assert.ok(sourceCases.has(id), 'missing source case ' + id);
});
