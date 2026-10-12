import { readFile } from 'node:fs/promises';
import { productionFieldRecordHash } from '../tooling/production-field-boundaries-core.mjs';
import { readExpectation, clone } from './production-field-results-seeds.mjs';
export { clone };

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

export async function productionDerivationSeed() {
  const [bindingFixture, readFixture, vectors] = await Promise.all([
    readJson('../fixtures/ProductionDerivationBinding.json'),
    readJson('../fixtures/ProductionFieldReadBinding.json'),
    readJson('../fixtures/ProductionFieldBoundaryVectors.json')
  ]);
  const scope = { tenant_id: '123e4567-e89b-42d3-a456-000000000001', project_id: '123e4567-e89b-42d3-a456-000000000002' };
  const binding = clone(bindingFixture.valid);
  binding.binding_hash = '';
  binding.binding_hash = productionFieldRecordHash(binding, 'binding_hash');
  const readBinding = clone(readFixture.valid);
  readBinding.permission_key = 'synthetic-derived-read-observation-001';
  readBinding.purpose = 'derived_output_read';
  readBinding.association = clone(binding.association);
  readBinding.parent_ref = clone(binding.parent_ref);
  readBinding.derived_ref = clone(binding.derived_ref);
  readBinding.composition_ref = clone(binding.derived_ref);
  readBinding.derivation_hash = binding.binding_hash;
  readBinding.binding_hash = '';
  readBinding.binding_hash = productionFieldRecordHash(readBinding, 'binding_hash');
  const expectedReadBinding = readExpectation(readBinding, vectors.clock.now);
  const context = {
    scope: clone(scope),
    expected_binding: clone(binding),
    current_read_binding: clone(readBinding),
    expected_read_binding: clone(expectedReadBinding),
    now: vectors.clock.now
  };
  return { scope, binding, readBinding, expectedReadBinding, context, vectors };
}
