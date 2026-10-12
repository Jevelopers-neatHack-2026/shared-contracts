import { productionContentHash } from './production-values.mjs';
import { checkProductionFieldReadBinding } from './production-field-boundaries-results.mjs';
import { hashBytes, validateContract } from './runtime.mjs';
import { fieldIssue, fieldOk, fieldReference, parseFieldContract, preflightContext, productionFieldLimits, productionFieldRecordHash, sameCanonical, scopeMatches, validScope } from './production-field-boundaries-core.mjs';

function checkedFieldRecord(contract, value) {
  const parsed = parseFieldContract(contract, value);
  if (!parsed.ok) return parsed;
  if (productionFieldRecordHash(parsed.value) !== parsed.value.content_hash) return fieldIssue('HASH_MISMATCH', '/content_hash');
  return parsed;
}

export function checkProductionCsvInputPolicy(value, expectedScope) {
  const context = preflightContext(expectedScope);
  if (!context.ok) return context;
  if (!validScope(context.value)) return fieldIssue('INVALID_TRUST_CONTEXT');
  const policy = checkedFieldRecord('ProductionCsvInputPolicy', value);
  if (!policy.ok) return policy;
  if (!scopeMatches(policy.value, context.value)) return fieldIssue('NOT_FOUND');
  const bounds = policy.value;
  if (bounds.maximum_bytes > productionFieldLimits.maximum_csv_bytes || bounds.maximum_rows > productionFieldLimits.maximum_rows ||
      bounds.maximum_columns > productionFieldLimits.maximum_columns || bounds.maximum_cell_bytes > productionFieldLimits.maximum_cell_bytes) return fieldIssue('RESOURCE_LIMIT');
  return policy;
}

export function checkProductionCsvInputReference(value, expected) {
  const expectedContext = preflightContext(expected, 'NEEDS_EXTERNAL_REVIEW');
  if (!expectedContext.ok) return expectedContext;
  const input = checkedFieldRecord('ProductionCsvInputReference', value);
  const hostInput = checkedFieldRecord('ProductionCsvInputReference', expectedContext.value);
  if (!input.ok || !hostInput.ok) return fieldIssue('INVALID_INPUT');
  if (!sameCanonical(input.value, hostInput.value)) return fieldIssue('INPUT_CHANGED');
  return fieldOk({ input_ref: input.value, access_authorized: false });
}

export function checkProductionCsvInputBytes(inputRef, bytes, expected) {
  const inputContext = preflightContext(inputRef, 'INVALID_INPUT');
  const expectedContext = preflightContext(expected);
  if (!inputContext.ok) return inputContext;
  if (!expectedContext.ok) return expectedContext;
  const trusted = expectedContext.value;
  if (trusted.input_ref === undefined) return fieldIssue('NEEDS_EXTERNAL_REVIEW');
  if (!validScope(trusted.scope)) return fieldIssue('INVALID_TRUST_CONTEXT');
  const reference = checkedFieldRecord('ProductionCsvInputReference', inputContext.value);
  if (!reference.ok) return reference;
  const trustedReference = checkedFieldRecord('ProductionCsvInputReference', trusted.input_ref);
  if (!trustedReference.ok || !sameCanonical(reference.value, trustedReference.value)) return fieldIssue('INPUT_CHANGED');
  const policy = checkProductionCsvInputPolicy(trusted.policy, trusted.scope);
  if (!policy.ok) return policy;
  if (!scopeMatches(reference.value, trusted.scope)) return fieldIssue('NOT_FOUND');
  if (reference.value.byte_size > policy.value.maximum_bytes) return fieldIssue('RESOURCE_LIMIT', '/byte_size');
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > productionFieldLimits.maximum_csv_bytes || bytes.byteLength > policy.value.maximum_bytes) return fieldIssue('RESOURCE_LIMIT');
  if (Object.getOwnPropertySymbols(bytes).length) return fieldIssue('INVALID_INPUT');
  if (bytes.byteLength !== reference.value.byte_size) return fieldIssue('INPUT_CHANGED', '/byte_size');
  const byteHash = hashBytes(bytes);
  if (byteHash !== reference.value.byte_hash) return fieldIssue('INPUT_CHANGED', '/byte_hash');
  if (bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return fieldIssue('BOM_FORBIDDEN');
  try {
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (error) {
    if (error instanceof TypeError) return fieldIssue('INVALID_ENCODING');
    throw error;
  }
  return fieldOk({ byte_hash: byteHash, byte_size: bytes.byteLength, decoded_text_returned: false, parser_invoked: false });
}

function exactCsvReference(reference, object) {
  return reference && object && sameCanonical(reference, fieldReference(object));
}

function checkMapping(mapping, rowPolicy, observedHeaders, policy) {
  if (productionContentHash(mapping) !== mapping.content_hash || productionContentHash(rowPolicy) !== rowPolicy.content_hash) return fieldIssue('HASH_MISMATCH');
  if (mapping.tenant_id !== rowPolicy.tenant_id || mapping.project_id !== rowPolicy.project_id ||
      mapping.row_schema_ref.id !== rowPolicy.schema_id || mapping.row_schema_ref.revision !== rowPolicy.revision ||
      mapping.row_schema_ref.content_hash !== rowPolicy.content_hash) return fieldIssue('MAPPING_MISMATCH');
  if (mapping.headers.length > policy.maximum_columns || new Set(mapping.headers).size !== mapping.headers.length ||
      !mapping.headers.includes(mapping.row_id_header) || !Array.isArray(observedHeaders) || !sameCanonical(mapping.headers, observedHeaders)) return fieldIssue('MAPPING_MISMATCH');
  const mappedHeaders = Object.keys(mapping.field_mapping);
  const mappedFields = Object.values(mapping.field_mapping);
  const rowFields = rowPolicy.fields.filter(field => field.source_policy === 'row_display');
  if (mappedHeaders.some(header => !mapping.headers.includes(header)) || new Set(mappedFields).size !== mappedFields.length ||
      mappedFields.some(id => !rowFields.some(field => field.field_id === id)) ||
      rowFields.some(field => field.required && !mappedFields.includes(field.field_id))) return fieldIssue('MAPPING_MISMATCH');
  return fieldOk({ mapping, row_policy: rowPolicy });
}

export function checkProductionCsvBatchRequest(value, context) {
  const preflight = preflightContext(context);
  const inputPreflight = preflightContext(value, 'INVALID_INPUT');
  if (!preflight.ok) return preflight;
  if (!inputPreflight.ok) return inputPreflight;
  const trusted = preflight.value;
  if (!validScope(trusted.scope)) return fieldIssue('INVALID_TRUST_CONTEXT');
  const request = parseFieldContract('ProductionCsvBatchRequest', inputPreflight.value);
  if (!request.ok) return request;
  const { scope, input_ref, input_policy, dialect, mapping, row_policy, observed_headers, expected_binding, expected_checkpoint } = trusted;
  const expectedValues = [input_ref, input_policy, dialect, mapping, row_policy, expected_binding, expected_checkpoint, trusted.input_read_binding, trusted.expected_input_read_binding, trusted.now];
  if (expectedValues.some(item => item === undefined)) return fieldIssue('NEEDS_EXTERNAL_REVIEW');
  const policy = checkProductionCsvInputPolicy(input_policy, scope);
  if (!policy.ok) return policy;
  const reference = checkedFieldRecord('ProductionCsvInputReference', input_ref);
  if (!reference.ok) return reference;
  const dialectResult = validateContract('CsvDialect', dialect);
  const mappingResult = validateContract('CsvMapping', mapping);
  const rowPolicyResult = validateContract('PersonalizationSchema', row_policy);
  if (!dialectResult.ok || !mappingResult.ok || !rowPolicyResult.ok) return fieldIssue('INVALID_INPUT');
  if (!scopeMatches(request.value, scope) || !scopeMatches(reference.value, scope) || !scopeMatches(dialectResult.value, scope) ||
      !scopeMatches(mappingResult.value, scope) || !scopeMatches(rowPolicyResult.value, scope)) return fieldIssue('NOT_FOUND');
  if (!sameCanonical(request.value.binding, expected_binding) || !sameCanonical(request.value.input.input_ref, reference.value) ||
      !exactCsvReference(request.value.input.dialect_ref, dialectResult.value) || !exactCsvReference(request.value.input.mapping_ref, mappingResult.value) ||
      !exactCsvReference(request.value.input.row_schema_ref, rowPolicyResult.value) ||
      !exactCsvReference(request.value.input.input_policy_ref, policy.value) || request.value.input.input_policy_hash !== policy.value.content_hash) return fieldIssue('BINDING_MISMATCH');
  if (productionContentHash(dialectResult.value) !== dialectResult.value.content_hash ||
      dialectResult.value.encoding !== policy.value.encoding || dialectResult.value.bom !== policy.value.bom ||
      dialectResult.value.delimiter !== policy.value.delimiter || dialectResult.value.quote !== policy.value.quote ||
      dialectResult.value.newline !== policy.value.newline || dialectResult.value.header !== policy.value.header ||
      policy.value.escape !== 'double_quote' || policy.value.trim !== false || policy.value.formula_policy !== 'preserve_text') return fieldIssue('DIALECT_MISMATCH');
  const mappingCheck = checkMapping(mappingResult.value, rowPolicyResult.value, observed_headers, policy.value);
  if (!mappingCheck.ok) return mappingCheck;
  const checkpoint = request.value.input.checkpoint;
  if ((checkpoint === null) !== (expected_checkpoint === null)) return fieldIssue('CHECKPOINT_INVALID');
  if (checkpoint !== null) {
    const checkedCheckpoint = checkedFieldRecord('ProductionCsvCheckpoint', checkpoint);
    const expectedCheckpoint = checkedFieldRecord('ProductionCsvCheckpoint', expected_checkpoint);
    if (!checkedCheckpoint.ok || !expectedCheckpoint.ok || !sameCanonical(checkedCheckpoint.value, expectedCheckpoint.value)) return fieldIssue('CHECKPOINT_INVALID');
    const c = checkedCheckpoint.value;
    if (!sameCanonical(c.input_ref, reference.value) || !exactCsvReference(c.dialect_ref, dialectResult.value) ||
        !exactCsvReference(c.mapping_ref, mappingResult.value) || !exactCsvReference(c.input_policy_ref, policy.value) ||
        c.input_policy_hash !== policy.value.content_hash || c.byte_offset > reference.value.byte_size || c.complete_record !== true) return fieldIssue('CHECKPOINT_INVALID');
  }
  const inputAccess = checkProductionFieldReadBinding(trusted.input_read_binding, { ...trusted.expected_input_read_binding, now: trusted.now });
  if (!inputAccess.ok) return inputAccess;
  if (trusted.expected_input_read_binding.purpose !== 'csv_input_read' || trusted.expected_input_read_binding.association.kind !== 'standalone' ||
      !sameCanonical(trusted.expected_input_read_binding.csv_input_ref, reference.value) || trusted.expected_input_read_binding.input_policy_hash !== policy.value.content_hash) return fieldIssue('BINDING_MISMATCH', '/input_read_binding');
  return fieldOk({ request: request.value, parser_implemented: false, launch_authorized: false, input_bundle_included: false, input_read_binding_matched: true });
}

export function checkProductionCsvOutputIsolation(inputRef, bundleRef, expected) {
  const context = preflightContext(expected, 'NEEDS_EXTERNAL_REVIEW');
  if (!context.ok) return context;
  const trusted = context.value;
  if (trusted.input_ref === undefined || trusted.bundle_ref === undefined) return fieldIssue('NEEDS_EXTERNAL_REVIEW');
  if (!validScope(trusted.scope)) return fieldIssue('INVALID_TRUST_CONTEXT');
  const input = checkedFieldRecord('ProductionCsvInputReference', inputRef);
  const bundleContext = preflightContext(bundleRef, 'INVALID_INPUT');
  if (!bundleContext.ok) return bundleContext;
  const bundle = validateContract('ProductionBundleRef', bundleContext.value);
  if (!input.ok || !bundle.ok) return fieldIssue('INVALID_INPUT');
  if (!scopeMatches(input.value, trusted.scope)) return fieldIssue('NOT_FOUND');
  if (!sameCanonical(input.value, trusted.input_ref) || !sameCanonical(bundle.value, trusted.bundle_ref)) return fieldIssue('BINDING_MISMATCH');
  if (bundle.value.file_set.some(file => file.byte_hash === input.value.byte_hash)) return fieldIssue('INPUT_AS_OUTPUT');
  return fieldOk({ input_included: false, bundle_ref: bundle.value });
}
