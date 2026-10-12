import { fieldIssue, fieldOk, parseFieldContract, preflightContext, productionFieldRecordHash, sameCanonical, scopeMatches, validScope, validTimestamp } from './production-field-boundaries-core.mjs';
import { checkProductionFieldReadBinding } from './production-field-boundaries-results.mjs';

function checkedDerivation(value) {
  const parsed = parseFieldContract('ProductionDerivationBinding', value);
  if (!parsed.ok) return parsed;
  if (productionFieldRecordHash(parsed.value, 'binding_hash') !== parsed.value.binding_hash) return fieldIssue('HASH_MISMATCH', '/binding_hash');
  if (sameCanonical(parsed.value.parent_ref, parsed.value.derived_ref)) return fieldIssue('DERIVATION_MISMATCH', '/derived_ref');
  return parsed;
}

function currentDerivedRead(binding, expected, now) {
  if (!binding || !expected) return fieldIssue('NEEDS_EXTERNAL_REVIEW');
  const checked = checkProductionFieldReadBinding(binding, { ...expected, now });
  if (!checked.ok) return checked.errors.some(error => error.code === 'PERMISSION_REVOKED') ? checked : fieldIssue('NEEDS_EXTERNAL_REVIEW', checked.errors[0]?.path ?? '');
  if (expected.purpose !== 'derived_output_read' || !sameCanonical(expected.parent_ref, binding.parent_ref) ||
      !sameCanonical(expected.derived_ref, binding.derived_ref) || expected.derivation_hash !== binding.derivation_hash) return fieldIssue('NEEDS_EXTERNAL_REVIEW');
  return checked;
}

export function checkProductionDerivationBinding(value, context) {
  const inputPreflight = preflightContext(value, 'INVALID_INPUT');
  const contextPreflight = preflightContext(context, 'NEEDS_EXTERNAL_REVIEW');
  if (!inputPreflight.ok) return inputPreflight;
  if (!contextPreflight.ok) return contextPreflight;
  const trusted = contextPreflight.value;
  if (!validScope(trusted.scope) || !validTimestamp(trusted.now)) return fieldIssue('INVALID_TRUST_CONTEXT');
  if (trusted.expected_binding === undefined || trusted.current_read_binding === undefined || trusted.expected_read_binding === undefined) return fieldIssue('NEEDS_EXTERNAL_REVIEW');
  const binding = checkedDerivation(inputPreflight.value);
  const expected = checkedDerivation(trusted.expected_binding);
  if (!binding.ok || !expected.ok) return fieldIssue('INVALID_INPUT');
  if (!scopeMatches(binding.value, trusted.scope) || !sameCanonical(binding.value, expected.value)) return fieldIssue('DERIVATION_MISMATCH');
  if (binding.value.change_classification !== 'mechanical_only') return fieldIssue('NEEDS_EXTERNAL_REVIEW');
  const permission = currentDerivedRead(trusted.current_read_binding, trusted.expected_read_binding, trusted.now);
  if (!permission.ok) return permission;
  if (trusted.expected_read_binding.derivation_hash !== binding.value.binding_hash) return fieldIssue('NEEDS_EXTERNAL_REVIEW');
  return fieldOk({ binding_hash: binding.value.binding_hash, relationship: 'exact_candidate_binding', renderer_authorized: false, export_authorized: false, approval_carried_forward: false, authority_issued: false });
}

export function compareProductionDerivationReplay(priorValue, requestedValue, context) {
  const priorPreflight = preflightContext(priorValue, 'INVALID_INPUT');
  const requestedPreflight = preflightContext(requestedValue, 'INVALID_INPUT');
  const contextPreflight = preflightContext(context, 'NEEDS_EXTERNAL_REVIEW');
  if (!priorPreflight.ok) return priorPreflight;
  if (!requestedPreflight.ok) return requestedPreflight;
  if (!contextPreflight.ok) return contextPreflight;
  const trusted = contextPreflight.value;
  if (!validScope(trusted.scope) || !validTimestamp(trusted.now)) return fieldIssue('INVALID_TRUST_CONTEXT');
  if (trusted.expected_binding === undefined || trusted.current_read_binding === undefined || trusted.expected_read_binding === undefined) return fieldIssue('NEEDS_EXTERNAL_REVIEW');
  const prior = checkedDerivation(priorPreflight.value);
  const requested = checkedDerivation(requestedPreflight.value);
  const expected = checkedDerivation(trusted.expected_binding);
  if (!prior.ok || !requested.ok || !expected.ok) return fieldIssue('INVALID_INPUT');
  if (!sameCanonical(prior.value, requested.value)) return fieldIssue('REPLAY_CONFLICT');
  if (!scopeMatches(requested.value, trusted.scope) || !sameCanonical(requested.value, expected.value)) return fieldIssue('DERIVATION_MISMATCH');
  const permission = currentDerivedRead(trusted.current_read_binding, trusted.expected_read_binding, trusted.now);
  if (!permission.ok || trusted.expected_read_binding.derivation_hash !== requested.value.binding_hash) return fieldIssue('NEEDS_EXTERNAL_REVIEW');
  return fieldOk({ relationship: 'same_derivation', disposition: 'NO_OP', new_render_required: false, new_export_required: false, approval_carried_forward: false, current_access_rechecked: true, authority_issued: false });
}
