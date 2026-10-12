import { canonicalJson, ContractError, hashManifest, validateContractVersion, validatePrimitive } from './runtime.mjs';

export const productionFieldLimits = Object.freeze({
  maximum_json_bytes: 16777216,
  maximum_csv_bytes: 67108864,
  maximum_rows: 10000,
  maximum_columns: 32,
  maximum_cell_bytes: 65536,
  maximum_files: 100
});

export const fieldIssue = (code, path = '') => ({ ok: false, errors: [{ code, path }] });
export const fieldOk = value => ({ ok: true, value });
export const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function preflightJson(value, invalidCode = 'INVALID_INPUT') {
  try {
    const json = canonicalJson(value);
    if (Buffer.byteLength(json, 'utf8') > productionFieldLimits.maximum_json_bytes) return fieldIssue('RESOURCE_LIMIT');
    return fieldOk(json);
  } catch (error) {
    if (error instanceof ContractError) return fieldIssue(error.code === 'RESOURCE_LIMIT' ? 'RESOURCE_LIMIT' : invalidCode, error.path);
    throw error;
  }
}

export function parseFieldContract(contract, value) {
  const preflight = preflightJson(value);
  if (!preflight.ok) return preflight;
  const normalized = JSON.parse(preflight.value);
  const parsed = validateContractVersion(contract, '1.0.0', normalized);
  return parsed.ok ? parsed : fieldIssue('INVALID_INPUT', parsed.errors[0]?.path ?? '');
}

export function preflightContext(context, missingCode = 'INVALID_TRUST_CONTEXT') {
  const preflight = preflightJson(context, missingCode);
  if (!preflight.ok) return preflight;
  const normalized = JSON.parse(preflight.value);
  if (!isRecord(normalized)) return fieldIssue(missingCode);
  return fieldOk(normalized);
}

export function validScope(scope) {
  if (!isRecord(scope) || Object.keys(scope).length !== 2 || !Object.hasOwn(scope, 'tenant_id') || !Object.hasOwn(scope, 'project_id')) return false;
  return validatePrimitive('TenantId', scope.tenant_id).ok && validatePrimitive('ProjectId', scope.project_id).ok;
}

export function scopeMatches(value, scope) {
  return validScope(scope) && isRecord(value) && value.tenant_id === scope.tenant_id && value.project_id === scope.project_id;
}

export function sameCanonical(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

export function productionFieldRecordHash(value, hashField = 'content_hash') {
  const preflight = preflightJson(value);
  if (!preflight.ok) throw new ContractError(preflight.errors[0].code, preflight.errors[0].path);
  const normalized = JSON.parse(preflight.value);
  if (!isRecord(normalized) || typeof normalized.contract !== 'string' || normalized.schema_version !== '1.0.0') throw new ContractError('INVALID_FIELD_RECORD');
  const record = Object.fromEntries(Object.keys(normalized).filter(key => key !== hashField).map(key => [key, normalized[key]]));
  return hashManifest({ domain: 'jevelopers.production-field-boundaries/1.0.0', contract: normalized.contract, record });
}

export function fieldReference(value) {
  return { contract: value.contract, schema_version: value.schema_version, id: value.id ?? value.schema_id, revision: value.revision, content_hash: value.content_hash };
}

export function mapContractFailure(result, fallback = 'INVALID_INPUT') {
  return result.ok ? fieldOk(result.value) : fieldIssue(fallback, result.errors[0]?.path ?? '');
}

export function validTimestamp(value) {
  return typeof value === 'string' && validatePrimitive('UtcTime', value).ok;
}
