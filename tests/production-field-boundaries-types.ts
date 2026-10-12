import { checkProductionCsvInputReference } from '@jevelopers/shared-contracts/production-field-boundaries';
import type {
  ProductionCsvBatchRequest_1_0_0,
  ProductionCsvInputReference_1_0_0
} from '@jevelopers/shared-contracts';
import type {
  ProductionFieldCheck,
  ProductionFieldReferenceValue
} from '@jevelopers/shared-contracts/production-field-boundaries';
import type { ProductionReferenceValue, ProductionRequestMap } from '@jevelopers/shared-contracts/production-operations';

type Assert<T extends true> = T;
type IsAssignable<Source, Target> = [Source] extends [Target] ? true : false;
type InputReferenceIsInOptInUnion = Assert<IsAssignable<ProductionCsvInputReference_1_0_0, ProductionFieldReferenceValue>>;
type InputReferenceIsNotInLegacyUnion = Assert<IsAssignable<ProductionCsvInputReference_1_0_0, ProductionReferenceValue> extends false ? true : false>;
type CsvRequestStaysOutOfOldCallback = Assert<IsAssignable<ProductionCsvBatchRequest_1_0_0, ProductionRequestMap['personalizeArtifactBatch']> extends false ? true : false>;

declare const inputReference: ProductionCsvInputReference_1_0_0;
declare const check: ProductionFieldCheck<ProductionCsvInputReference_1_0_0>;
const exactReference: ProductionFieldReferenceValue = inputReference;
const checked = checkProductionCsvInputReference(inputReference, inputReference);
if (checked.ok) {
  const noAuthority: false = checked.value.access_authorized;
  const sameVersion: '1.0.0' = checked.value.input_ref.schema_version;
}
if (check.ok) {
  const exactVersion: '1.0.0' = check.value.schema_version;
}
export type ProductionFieldTypeProof = readonly [InputReferenceIsInOptInUnion, InputReferenceIsNotInLegacyUnion, CsvRequestStaysOutOfOldCallback, typeof exactReference];
