import type { Brand } from "./brands.js";
export interface ProductionCsvInputPolicy {
    readonly contract: "ProductionCsvInputPolicy";
    readonly schema_version: "1.0.0";
    readonly policy_version: "1.0.0";
    readonly tenant_id: Brand<string, "TenantId">;
    readonly project_id: Brand<string, "ProjectId">;
    readonly id: string;
    readonly revision: number;
    readonly content_hash: Brand<string, "Sha256">;
    readonly encoding: "utf-8";
    readonly bom: "forbidden";
    readonly delimiter: ",";
    readonly quote: '"';
    readonly escape: "double_quote";
    readonly newline: "crlf";
    readonly header: "required";
    readonly trim: false;
    readonly formula_policy: "preserve_text";
    readonly maximum_bytes: number;
    readonly maximum_rows: number;
    readonly maximum_columns: number;
    readonly maximum_cell_bytes: number;
}
