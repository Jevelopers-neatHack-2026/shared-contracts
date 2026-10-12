import { validateContract } from './runtime.mjs';
import { checkRowResult } from './production-rows.mjs';
import { productionArchiveLimits, verifyProductionBundleFiles } from './production-bundle.mjs';
import { fieldIssue, fieldOk, isRecord, parseFieldContract, preflightContext, productionFieldLimits, productionFieldRecordHash, sameCanonical, scopeMatches, validScope, validTimestamp } from './production-field-boundaries-core.mjs';

const bindingFields = ['scope', 'actor_id', 'audience', 'purpose', 'permission_key', 'association', 'parent_ref', 'derived_ref', 'csv_input_ref', 'input_policy_hash', 'composition_ref', 'artifact_ref', 'bundle_ref', 'file_commitments', 'derivation_hash'];

export function checkProductionFieldReadBinding(value, expected) {
  if (expected === undefined || expected === null) return fieldIssue('NEEDS_EXTERNAL_REVIEW');
  const inputPreflight = preflightContext(value, 'INVALID_INPUT');
  const expectedPreflight = preflightContext(expected);
  if (!inputPreflight.ok) return inputPreflight;
  if (!expectedPreflight.ok) return expectedPreflight;
  const trusted = expectedPreflight.value;
  if (!validScope(trusted.scope) || !validTimestamp(trusted.now)) return fieldIssue('INVALID_TRUST_CONTEXT');
  if (bindingFields.some(key => !Object.hasOwn(trusted, key))) return fieldIssue('NEEDS_EXTERNAL_REVIEW');
  const binding = parseFieldContract('ProductionFieldReadBinding', inputPreflight.value);
  if (!binding.ok) return binding;
  if (binding.value.state === 'revoked') return fieldIssue('PERMISSION_REVOKED');
  if (binding.value.state !== 'current') return fieldIssue('NEEDS_EXTERNAL_REVIEW');
  if (binding.value.observed_at !== trusted.now || Date.parse(binding.value.expires_at) <= Date.parse(trusted.now)) return fieldIssue('PERMISSION_EXPIRED');
  if (!scopeMatches(binding.value.scope, trusted.scope) || bindingFields.some(key => !sameCanonical(binding.value[key], trusted[key]))) return fieldIssue('BINDING_MISMATCH');
  if (binding.value.binding_hash !== productionFieldRecordHash(binding.value, 'binding_hash')) return fieldIssue('HASH_MISMATCH', '/binding_hash');
  const semanticBinding = bindingResourceConsistency(binding.value);
  if (!semanticBinding.ok) return semanticBinding;
  return fieldOk({ binding_hash: binding.value.binding_hash, observation_current: true, authority_issued: false });
}

function bindingResourceConsistency(binding) {
  if (binding.purpose === 'csv_input_read') {
    if (!scopeMatches(binding.csv_input_ref, binding.scope) || binding.input_policy_hash === null || binding.parent_ref !== null || binding.derived_ref !== null ||
        binding.derivation_hash !== null || binding.composition_ref !== null || binding.artifact_ref !== null || binding.bundle_ref !== null || binding.file_commitments.length > 0) return fieldIssue('BINDING_MISMATCH');
    return fieldOk(binding);
  }
  if (binding.purpose === 'draft_row_read') {
    if (binding.association.kind !== 'row' || binding.csv_input_ref !== null || binding.input_policy_hash !== null || binding.parent_ref !== null || binding.derived_ref !== null || binding.derivation_hash !== null) return fieldIssue('BINDING_MISMATCH');
    if (binding.composition_ref === null && (binding.artifact_ref !== null || binding.bundle_ref !== null || binding.file_commitments.length > 0)) return fieldIssue('BINDING_MISMATCH');
    if (binding.composition_ref !== null && binding.artifact_ref !== null && !sameCanonical(binding.artifact_ref.composition_ref, binding.composition_ref)) return fieldIssue('BINDING_MISMATCH');
    if (binding.composition_ref !== null && binding.bundle_ref !== null && (!sameCanonical(binding.bundle_ref.composition_ref, binding.composition_ref) || !sameCanonical(binding.bundle_ref.file_set, binding.file_commitments))) return fieldIssue('BINDING_MISMATCH');
    if (binding.bundle_ref === null && binding.file_commitments.length > 0) return fieldIssue('BINDING_MISMATCH');
    return fieldOk(binding);
  }
  if (binding.purpose === 'derived_output_read') {
    if (!sameCanonical(binding.composition_ref, binding.derived_ref) || binding.csv_input_ref !== null || binding.input_policy_hash !== null) return fieldIssue('BINDING_MISMATCH');
    if (binding.artifact_ref !== null && !sameCanonical(binding.artifact_ref.composition_ref, binding.composition_ref)) return fieldIssue('BINDING_MISMATCH');
    if (binding.bundle_ref !== null && (!sameCanonical(binding.bundle_ref.composition_ref, binding.composition_ref) || !sameCanonical(binding.bundle_ref.file_set, binding.file_commitments))) return fieldIssue('BINDING_MISMATCH');
    if (binding.bundle_ref === null && binding.file_commitments.length > 0) return fieldIssue('BINDING_MISMATCH');
    return fieldOk(binding);
  }
  return fieldIssue('INVALID_INPUT', '/purpose');
}

function checkDraftStorageShape(output) {
  if (output.render_state === 'succeeded' && output.render_hash === null) return fieldIssue('INVALID_DRAFT_RESULT', '/draft_output/render_hash');
  if (output.storage_state !== 'stored' && (output.artifact_ref !== null || output.bundle_ref !== null || output.file_commitments.length > 0)) return fieldIssue('INVALID_DRAFT_RESULT', '/draft_output/storage_state');
  if (output.integrity_state === 'verified') {
    if (output.storage_state !== 'stored' || output.artifact_ref === null || output.bundle_ref === null || output.file_commitments.length === 0) return fieldIssue('STORAGE_INTEGRITY_FAILURE');
    if (!sameCanonical(output.artifact_ref.composition_ref, output.composition_ref) ||
        !sameCanonical(output.bundle_ref.composition_ref, output.composition_ref) ||
        !sameCanonical(output.bundle_ref.file_set, output.file_commitments)) return fieldIssue('BINDING_MISMATCH', '/draft_output/file_commitments');
  }
  if (output.artifact_ref !== null && output.render_hash !== null && output.artifact_ref.render_hash !== output.render_hash) return fieldIssue('BINDING_MISMATCH', '/draft_output/render_hash');
  return fieldOk(output);
}

export function checkProductionDraftRowResult(value, context) {
  const inputPreflight = preflightContext(value, 'INVALID_INPUT');
  const contextPreflight = preflightContext(context);
  if (!inputPreflight.ok) return inputPreflight;
  if (!contextPreflight.ok) return contextPreflight;
  const trusted = contextPreflight.value;
  if (!validScope(trusted.scope)) return fieldIssue('INVALID_TRUST_CONTEXT');
  const parsed = parseFieldContract('ProductionDraftRowResult', inputPreflight.value);
  if (!parsed.ok) return parsed;
  const { row_result: rowResult, draft_output: draftOutput } = parsed.value;
  const expectedValues = ['job', 'original_rows', 'expected_draft_output', 'read_binding', 'expected_read_binding', 'expected_batch_state', 'now'];
  if (expectedValues.some(key => trusted[key] === undefined) || trusted.expected_draft_output === null || trusted.read_binding === null || trusted.expected_batch_state === null) return fieldIssue('NEEDS_EXTERNAL_REVIEW');
  if (!isRecord(trusted.expected_batch_state) || !['atomic', 'allow_partial'].includes(trusted.expected_batch_state.acceptance_policy) ||
      ['job', 'acceptance_policy', 'status', 'publication_state'].some(key => !Object.hasOwn(trusted.expected_batch_state, key)) ||
      !['queued', 'running', 'succeeded', 'failed', 'cancelled', 'partially_succeeded', 'unknown'].includes(trusted.expected_batch_state.status) ||
      !['published', 'unpublished', 'unknown'].includes(trusted.expected_batch_state.publication_state)) return fieldIssue('INVALID_TRUST_CONTEXT');
  if (!sameCanonical(trusted.expected_batch_state.job, rowResult.job)) return fieldIssue('BINDING_MISMATCH');
  if (trusted.expected_batch_state.acceptance_policy === 'atomic' && trusted.expected_batch_state.status !== 'succeeded' && draftOutput.publication_state === 'published') return fieldIssue('ATOMIC_NOT_COMMITTED');
  if (!sameCanonical(draftOutput, trusted.expected_draft_output)) return fieldIssue('BINDING_MISMATCH', '/draft_output');
  if (!scopeMatches(rowResult, trusted.scope) || !sameCanonical(rowResult.job, trusted.job)) return fieldIssue('NOT_FOUND');
  const resultCheck = checkRowResult(rowResult, { scope: trusted.scope, job: trusted.job, original_rows: trusted.original_rows, verified_rows: trusted.verified_rows ?? {} });
  if (!resultCheck.ok) return fieldIssue(resultCheck.errors.some(error => error.code === 'ROW_BINDING_MISMATCH' || error.code === 'NOT_FOUND') ? 'BINDING_MISMATCH' : 'ROW_RESULT_INVALID', resultCheck.errors[0]?.path ?? '');
  const storageCheck = checkDraftStorageShape(draftOutput);
  if (!storageCheck.ok) return storageCheck;
  if (draftOutput.handoff_eligibility === 'eligible' && (rowResult.eligibility.state !== 'eligible' || draftOutput.integrity_state !== 'verified')) return fieldIssue('INVALID_PUBLICATION', '/draft_output/handoff_eligibility');
  if (draftOutput.publication_state === 'published' && (draftOutput.handoff_eligibility !== 'eligible' || rowResult.status !== 'succeeded' || rowResult.artifact_ref === null || rowResult.bundle_ref === null)) return fieldIssue('INVALID_PUBLICATION', '/draft_output/publication_state');
  const access = checkProductionFieldReadBinding(trusted.read_binding, { ...trusted.expected_read_binding, now: trusted.now });
  if (!access.ok) return access;
  if (trusted.expected_read_binding.purpose !== 'draft_row_read' || !sameCanonical(trusted.expected_read_binding.association, { kind: 'row', job_ref: rowResult.job, row_id: rowResult.row_id, ordinal: rowResult.ordinal, input_hash: rowResult.input_hash }) ||
      !sameCanonical(trusted.expected_read_binding.composition_ref, draftOutput.composition_ref) || !sameCanonical(trusted.expected_read_binding.artifact_ref, draftOutput.artifact_ref) ||
      !sameCanonical(trusted.expected_read_binding.bundle_ref, draftOutput.bundle_ref) || !sameCanonical(trusted.expected_read_binding.file_commitments, draftOutput.file_commitments)) return fieldIssue('BINDING_MISMATCH', '/read_binding');
  return fieldOk({ row_result: rowResult, draft_output: draftOutput, read_binding_matched: true, authority_issued: false });
}

function countValue(count, actual, path) {
  return count.state === 'unknown' || count.value === actual ? null : fieldIssue('COUNT_MISMATCH', path);
}

export function checkProductionDraftBatchResult(value, context) {
  const inputPreflight = preflightContext(value, 'INVALID_INPUT');
  const contextPreflight = preflightContext(context);
  if (!inputPreflight.ok) return inputPreflight;
  if (!contextPreflight.ok) return contextPreflight;
  const trusted = contextPreflight.value;
  if (!validScope(trusted.scope)) return fieldIssue('INVALID_TRUST_CONTEXT');
  const parsed = parseFieldContract('ProductionDraftBatchResult', inputPreflight.value);
  if (!parsed.ok) return parsed;
  const batch = parsed.value;
  const { original_rows: originals, read_bindings: readBindings, expected_read_bindings: expectedReads, expected_draft_outputs: expectedOutputs } = trusted;
  if (trusted.expected_batch_state === undefined || trusted.expected_batch_state === null) return fieldIssue('NEEDS_EXTERNAL_REVIEW');
  if (!Array.isArray(originals) || !Array.isArray(readBindings) || !Array.isArray(expectedReads) || !Array.isArray(expectedOutputs) || !isRecord(trusted.expected_batch_state)) return fieldIssue('INVALID_TRUST_CONTEXT');
  if (originals.length > productionFieldLimits.maximum_rows) return fieldIssue('RESOURCE_LIMIT');
  if (originals.length !== batch.rows.length ||
      readBindings.length !== originals.length || expectedReads.length !== originals.length || expectedOutputs.length !== originals.length) return fieldIssue('ROW_ORDER_MISMATCH');
  if (!scopeMatches(batch, trusted.scope) || !sameCanonical(batch.job, trusted.job)) return fieldIssue('NOT_FOUND');
  if (trusted.expected_batch_state.acceptance_policy !== batch.acceptance_policy || trusted.expected_batch_state.status !== batch.status ||
      trusted.expected_batch_state.publication_state !== batch.publication_state || !sameCanonical(trusted.expected_batch_state.job, batch.job)) return fieldIssue('BINDING_MISMATCH');
  const actual = { submitted: batch.rows.length, succeeded: 0, failed: 0, cancelled: 0, skipped: 0, pending: 0, published: 0 };
  for (const [index, row] of batch.rows.entries()) {
    if (row.row_result.ordinal !== index || originals[index]?.row_id !== row.row_result.row_id) return fieldIssue('ROW_ORDER_MISMATCH', '/rows/' + index);
    const checked = checkProductionDraftRowResult(row, {
      scope: trusted.scope,
      job: trusted.job,
      original_rows: originals,
      verified_rows: trusted.verified_rows ?? {},
      expected_draft_output: expectedOutputs[index],
      read_binding: readBindings[index],
      expected_read_binding: expectedReads[index],
      expected_batch_state: trusted.expected_batch_state,
      now: trusted.now
    });
    if (!checked.ok) return checked;
    const status = row.row_result.status;
    actual[['queued', 'running'].includes(status) ? 'pending' : status]++;
    if (row.draft_output.publication_state === 'published') actual.published++;
  }
  for (const key of Object.keys(actual)) {
    const result = countValue(batch.counts[key], actual[key], '/counts/' + key);
    if (result) return result;
  }
  let state = 'unpublished';
  if (actual.published > 0) state = 'published';
  else if ((batch.rows.length === 0 && batch.counts.published.state === 'unknown') || batch.rows.some(row => row.draft_output.publication_state === 'unknown')) state = 'unknown';
  if (batch.publication_state !== state) return fieldIssue('COUNT_MISMATCH', '/publication_state');
  if (batch.status === 'succeeded' && batch.rows.some(row => row.row_result.status !== 'succeeded')) return fieldIssue('INVALID_COUNTS', '/status');
  if (batch.status === 'partially_succeeded' && (batch.acceptance_policy !== 'allow_partial' || actual.succeeded === 0 || actual.succeeded === batch.rows.length)) return fieldIssue('INVALID_COUNTS', '/status');
  if (batch.acceptance_policy === 'atomic' && batch.status !== 'succeeded' && (actual.published !== 0 || batch.publication_state === 'published')) return fieldIssue('ATOMIC_NOT_COMMITTED', '/publication_state');
  return fieldOk({ batch, counts_preserved: true, all_rows_bound: true, publication_authorized: false });
}

function observedFileArray(files) {
  if (!Array.isArray(files) || Object.getPrototypeOf(files) !== Array.prototype) return fieldIssue('INVALID_INPUT');
  const length = files.length;
  if (!Number.isSafeInteger(length) || length > productionFieldLimits.maximum_files) return fieldIssue('RESOURCE_LIMIT');
  if (Object.getOwnPropertySymbols(files).length) return fieldIssue('INVALID_INPUT');
  const descriptors = Object.getOwnPropertyDescriptors(files);
  const expectedKeys = ['length'];
  for (let index = 0; index < length; index++) expectedKeys.push(String(index));
  if (Object.keys(descriptors).sort().join('|') !== expectedKeys.sort().join('|')) return fieldIssue('INVALID_INPUT');
  for (let index = 0; index < length; index++) if (!descriptors[String(index)].enumerable || !Object.hasOwn(descriptors[String(index)], 'value')) return fieldIssue('INVALID_INPUT');
  const observed = [];
  let totalBytes = 0;
  for (let index = 0; index < length; index++) {
    const item = descriptors[String(index)].value;
    if (!isRecord(item) || (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) || Object.getOwnPropertySymbols(item).length) return fieldIssue('INVALID_INPUT', '/' + index);
    const itemDescriptors = Object.getOwnPropertyDescriptors(item);
    if (Object.keys(itemDescriptors).sort().join('|') !== 'bytes|filename' || ['bytes', 'filename'].some(key => !itemDescriptors[key].enumerable || !Object.hasOwn(itemDescriptors[key], 'value'))) return fieldIssue('INVALID_INPUT', '/' + index);
    const filename = itemDescriptors.filename.value;
    const bytes = itemDescriptors.bytes.value;
    if (typeof filename !== 'string' || !(bytes instanceof Uint8Array)) return fieldIssue('INVALID_INPUT', '/' + index);
    if (Object.getOwnPropertySymbols(bytes).length) return fieldIssue('INVALID_INPUT', '/' + index);
    totalBytes += bytes.byteLength;
    if (bytes.byteLength > productionArchiveLimits.entry_bytes || totalBytes > productionArchiveLimits.payload_bytes) return fieldIssue('RESOURCE_LIMIT', '/' + index);
    observed.push({ filename, bytes });
  }
  return fieldOk(observed);
}

export function verifyProductionDraftStoredFiles(files, trustedBundleRef, expected) {
  const expectedPreflight = preflightContext(expected, 'NEEDS_EXTERNAL_REVIEW');
  const bundlePreflight = preflightContext(trustedBundleRef, 'INVALID_INPUT');
  if (!expectedPreflight.ok) return expectedPreflight;
  if (!bundlePreflight.ok) return bundlePreflight;
  const trusted = expectedPreflight.value;
  if (trusted.bundle_ref === undefined) return fieldIssue('NEEDS_EXTERNAL_REVIEW');
  if (!validScope(trusted.scope)) return fieldIssue('INVALID_TRUST_CONTEXT');
  const bundle = validateContract('ProductionBundleRef', bundlePreflight.value);
  if (!bundle.ok || !sameCanonical(bundle.value, trusted.bundle_ref)) return fieldIssue('BINDING_MISMATCH');
  const normalized = observedFileArray(files);
  if (!normalized.ok) return normalized;
  const result = verifyProductionBundleFiles(normalized.value, { scope: trusted.scope, trusted_commitment: bundle.value });
  if (!result.ok) return fieldIssue('STORAGE_INTEGRITY_FAILURE', result.errors[0]?.path ?? '');
  return fieldOk({ integrity: 'verified', eligibility: 'blocked', evidence_mode: 'byte_verification_only', authority_issued: false });
}
