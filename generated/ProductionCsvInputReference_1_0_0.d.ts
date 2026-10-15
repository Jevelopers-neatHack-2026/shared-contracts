import type { Brand } from "./brands.js";
export interface ProductionCsvInputReference {
    readonly contract: "ProductionCsvInputReference";
    readonly schema_version: "1.0.0";
    readonly policy_version: "1.0.0";
    readonly tenant_id: Brand<string, "TenantId">;
    readonly project_id: Brand<string, "ProjectId">;
    readonly id: string;
    readonly revision: number;
    readonly content_hash: Brand<string, "Sha256">;
    readonly byte_hash: Brand<string, "Sha256">;
    readonly byte_size: number;
    readonly media_type: "text/csv";
}
