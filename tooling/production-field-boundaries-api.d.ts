import type {
  ArtifactRef_1_0_0,
  CsvDialect_1_0_0,
  CsvMapping_1_0_0,
  JobRef_1_0_0,
  PersonalizationSchema_1_0_0,
  ProductionBundleRef_1_0_0,
  ProductionCsvBatchRequest_1_0_0,
  ProductionCsvCheckpoint_1_0_0,
  ProductionCsvInputPolicy_1_0_0,
  ProductionCsvInputReference_1_0_0,
  ProductionDerivationBinding_1_0_0,
  ProductionDraftBatchResult_1_0_0,
  ProductionDraftRowResult_1_0_0,
  ProductionFieldReadBinding_1_0_0,
  ProjectId,
  RowResult_1_0_0,
  Sha256,
  TenantId,
  UtcTime
} from '../generated/index.js';

export type ProductionFieldErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_TRUST_CONTEXT'
  | 'RESOURCE_LIMIT'
  | 'HASH_MISMATCH'
  | 'INPUT_CHANGED'
  | 'BOM_FORBIDDEN'
  | 'INVALID_ENCODING'
  | 'NOT_FOUND'
  | 'MAPPING_MISMATCH'
  | 'BINDING_MISMATCH'
  | 'DIALECT_MISMATCH'
  | 'CHECKPOINT_INVALID'
  | 'INPUT_AS_OUTPUT'
  | 'PERMISSION_REVOKED'
  | 'PERMISSION_EXPIRED'
  | 'NEEDS_EXTERNAL_REVIEW'
  | 'INVALID_DRAFT_RESULT'
  | 'STORAGE_INTEGRITY_FAILURE'
  | 'ROW_RESULT_INVALID'
  | 'INVALID_PUBLICATION'
  | 'ROW_ORDER_MISMATCH'
  | 'COUNT_MISMATCH'
  | 'INVALID_COUNTS'
  | 'ATOMIC_NOT_COMMITTED'
  | 'DERIVATION_MISMATCH'
  | 'REPLAY_CONFLICT';

export type ProductionFieldCheck<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly { readonly code: ProductionFieldErrorCode; readonly path: string }[] };

export type ProductionFieldScope = Readonly<{ readonly tenant_id: TenantId; readonly project_id: ProjectId }>;
export type ProductionFieldVersionedReference<C extends string, V extends string> = Readonly<{
  readonly contract: C;
  readonly schema_version: V;
  readonly id: string;
  readonly revision: number;
  readonly content_hash: Sha256;
}>;

export type ProductionFieldReferenceValue =
  | ProductionCsvInputReference_1_0_0
  | ProductionFieldVersionedReference<'ProductionCsvInputReference', '1.0.0'>
  | ProductionFieldVersionedReference<'ProductionCsvInputPolicy', '1.0.0'>
  | ProductionFieldVersionedReference<'ProductionCsvCheckpoint', '1.0.0'>
  | ProductionFieldVersionedReference<'CsvDialect', '1.0.0'>
  | ProductionFieldVersionedReference<'CsvMapping', '1.0.0'>
  | ProductionFieldVersionedReference<'PersonalizationSchema', '1.0.0'>
  | ProductionFieldVersionedReference<'Composition', '1.0.0'>
  | ProductionFieldVersionedReference<'ProductionPolicy', '1.0.0'>
  | ProductionFieldVersionedReference<'PreflightReport', '1.0.0'>
  | ProductionFieldVersionedReference<'ProductionResource', '1.0.0'>
  | ProductionFieldVersionedReference<'ProductionRuntime', '1.0.0'>
  | ProductionFieldVersionedReference<'ArtifactFile', '2.0.0'>
  | ProductionFieldVersionedReference<'ProductionBundle', '2.0.0'>
  | ArtifactRef_1_0_0
  | ProductionBundleRef_1_0_0;

export type ProductionFieldReadExpectation = Omit<
  ProductionFieldReadBinding_1_0_0,
  'contract' | 'schema_version' | 'policy_version' | 'state' | 'binding_hash' | 'observed_at' | 'expires_at'
> & { readonly now: UtcTime };

export type ProductionCsvBytesExpectation = Readonly<{
  readonly scope: ProductionFieldScope;
  readonly input_ref: ProductionCsvInputReference_1_0_0;
  readonly policy: ProductionCsvInputPolicy_1_0_0;
}>;

export type ProductionCsvRequestContext = Readonly<{
  readonly scope: ProductionFieldScope;
  readonly input_ref: ProductionCsvInputReference_1_0_0;
  readonly input_policy: ProductionCsvInputPolicy_1_0_0;
  readonly dialect: CsvDialect_1_0_0;
  readonly mapping: CsvMapping_1_0_0;
  readonly row_policy: PersonalizationSchema_1_0_0;
  readonly observed_headers: readonly string[];
  readonly expected_binding: ProductionCsvBatchRequest_1_0_0['binding'];
  readonly expected_checkpoint: ProductionCsvCheckpoint_1_0_0 | null;
  readonly input_read_binding: ProductionFieldReadBinding_1_0_0;
  readonly expected_input_read_binding: ProductionFieldReadExpectation;
  readonly now: UtcTime;
}>;

export type ProductionFieldOriginalRow = Readonly<{
  readonly row_id: string;
  readonly fields: Readonly<Record<string, string>>;
}>;
export type ProductionFieldVerifiedRow = Readonly<{
  readonly artifact_ref: ArtifactRef_1_0_0;
  readonly bundle_ref: ProductionBundleRef_1_0_0;
  readonly preflight_status: 'passed';
  readonly input_hash: Sha256;
  readonly ordinal: number;
  readonly job: JobRef_1_0_0;
}>;
export type ProductionFieldExpectedBatchState = Readonly<{
  readonly job: JobRef_1_0_0;
  readonly acceptance_policy: ProductionDraftBatchResult_1_0_0['acceptance_policy'];
  readonly status: ProductionDraftBatchResult_1_0_0['status'];
  readonly publication_state: ProductionDraftBatchResult_1_0_0['publication_state'];
}>;

export type ProductionDraftRowContext = Readonly<{
  readonly scope: ProductionFieldScope;
  readonly job: JobRef_1_0_0;
  readonly original_rows: readonly ProductionFieldOriginalRow[];
  readonly verified_rows?: Readonly<Record<string, ProductionFieldVerifiedRow>>;
  readonly expected_draft_output: ProductionDraftRowResult_1_0_0['draft_output'];
  readonly read_binding: ProductionFieldReadBinding_1_0_0;
  readonly expected_read_binding: ProductionFieldReadExpectation;
  readonly expected_batch_state: ProductionFieldExpectedBatchState;
  readonly now: UtcTime;
}>;

export type ProductionDraftBatchContext = Readonly<{
  readonly scope: ProductionFieldScope;
  readonly job: JobRef_1_0_0;
  readonly original_rows: readonly ProductionFieldOriginalRow[];
  readonly verified_rows?: Readonly<Record<string, ProductionFieldVerifiedRow>>;
  readonly read_bindings: readonly ProductionFieldReadBinding_1_0_0[];
  readonly expected_read_bindings: readonly ProductionFieldReadExpectation[];
  readonly expected_draft_outputs: readonly ProductionDraftRowResult_1_0_0['draft_output'][];
  readonly expected_batch_state: ProductionFieldExpectedBatchState;
  readonly now: UtcTime;
}>;

export type ProductionObservedFile = Readonly<{ readonly filename: string; readonly bytes: Uint8Array }>;
export type ProductionDerivedContext = Readonly<{
  readonly scope: ProductionFieldScope;
  readonly expected_binding: ProductionDerivationBinding_1_0_0;
  readonly current_read_binding: ProductionFieldReadBinding_1_0_0;
  readonly expected_read_binding: ProductionFieldReadExpectation;
  readonly now: UtcTime;
}>;

export declare const productionFieldLimits: Readonly<{
  readonly maximum_json_bytes: 16777216;
  readonly maximum_csv_bytes: 67108864;
  readonly maximum_rows: 10000;
  readonly maximum_columns: 32;
  readonly maximum_cell_bytes: 65536;
  readonly maximum_files: 100;
}>;
export declare function productionFieldRecordHash(value: unknown, hashField?: string): Sha256;
export declare function checkProductionCsvInputPolicy(value: unknown, expectedScope: ProductionFieldScope): ProductionFieldCheck<ProductionCsvInputPolicy_1_0_0>;
export declare function checkProductionCsvInputReference(value: unknown, expected: ProductionCsvInputReference_1_0_0): ProductionFieldCheck<{ readonly input_ref: ProductionCsvInputReference_1_0_0; readonly access_authorized: false }>;
export declare function checkProductionCsvInputBytes(inputRef: unknown, bytes: Uint8Array, expected: ProductionCsvBytesExpectation): ProductionFieldCheck<{ readonly byte_hash: Sha256; readonly byte_size: number; readonly decoded_text_returned: false; readonly parser_invoked: false }>;
export declare function checkProductionCsvBatchRequest(value: unknown, context: ProductionCsvRequestContext): ProductionFieldCheck<{ readonly request: ProductionCsvBatchRequest_1_0_0; readonly parser_implemented: false; readonly launch_authorized: false; readonly input_bundle_included: false; readonly input_read_binding_matched: true }>;
export declare function checkProductionCsvOutputIsolation(inputRef: unknown, bundleRef: unknown, expected: Readonly<{ readonly scope: ProductionFieldScope; readonly input_ref: ProductionCsvInputReference_1_0_0; readonly bundle_ref: ProductionBundleRef_1_0_0 }>): ProductionFieldCheck<{ readonly input_included: false; readonly bundle_ref: ProductionBundleRef_1_0_0 }>;
export declare function checkProductionFieldReadBinding(value: unknown, expected: ProductionFieldReadExpectation): ProductionFieldCheck<{ readonly binding_hash: Sha256; readonly observation_current: true; readonly authority_issued: false }>;
export declare function checkProductionDraftRowResult(value: unknown, context: ProductionDraftRowContext): ProductionFieldCheck<{ readonly row_result: RowResult_1_0_0; readonly draft_output: ProductionDraftRowResult_1_0_0['draft_output']; readonly read_binding_matched: true; readonly authority_issued: false }>;
export declare function checkProductionDraftBatchResult(value: unknown, context: ProductionDraftBatchContext): ProductionFieldCheck<{ readonly batch: ProductionDraftBatchResult_1_0_0; readonly counts_preserved: true; readonly all_rows_bound: true; readonly publication_authorized: false }>;
export declare function verifyProductionDraftStoredFiles(files: readonly ProductionObservedFile[], trustedBundleRef: ProductionBundleRef_1_0_0, expected: Readonly<{ readonly scope: ProductionFieldScope; readonly bundle_ref: ProductionBundleRef_1_0_0 }>): ProductionFieldCheck<{ readonly integrity: 'verified'; readonly eligibility: 'blocked'; readonly evidence_mode: 'byte_verification_only'; readonly authority_issued: false }>;
export declare function checkProductionDerivationBinding(value: unknown, context: ProductionDerivedContext): ProductionFieldCheck<{ readonly binding_hash: Sha256; readonly relationship: 'exact_candidate_binding'; readonly renderer_authorized: false; readonly export_authorized: false; readonly approval_carried_forward: false; readonly authority_issued: false }>;
export declare function compareProductionDerivationReplay(priorValue: unknown, requestedValue: unknown, context: ProductionDerivedContext): ProductionFieldCheck<{ readonly relationship: 'same_derivation'; readonly disposition: 'NO_OP'; readonly new_render_required: false; readonly new_export_required: false; readonly approval_carried_forward: false; readonly current_access_rechecked: true; readonly authority_issued: false }>;
