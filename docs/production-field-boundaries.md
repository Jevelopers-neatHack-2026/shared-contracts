# Production field boundaries proposal

Package 0.11.1 carries an opt-in, unaccepted proposal for the remaining SC-PROD-ROWS production field mappings. Its nine local criteria are in [the proposal record](../compatibility/production-field-boundaries-proposal.json). They are separate from the existing SC-PROD-ROWS criteria and do not change the original acceptance inventory.

## CSV input

`ProductionCsvInputPolicy/1.0.0`, `ProductionCsvInputReference/1.0.0`, `ProductionCsvCheckpoint/1.0.0`, and `ProductionCsvBatchRequest/1.0.0` form a new input namespace. The existing `PersonalizeBatchRequest/1.0.0`, `CsvCheckpoint/1.0.0`, `ProductionReference/1.0.0`, and `ArtifactFile/2.0.0` remain unchanged. The new request uses an exact opt-in reference set; it does not widen the old production reference union or the old batch callback type.

The input reference commits to host scope, immutable descriptor revision, exact byte hash, byte size, and `text/csv`. It carries no path, URL, file bytes, or access grant. The request check also requires a current `ProductionFieldReadBinding` with purpose `csv_input_read`, exact input reference and policy hash, and explicit expiry. The policy carries an explicit per-policy resource bound and the observed strict dialect: UTF-8, no BOM, comma delimiter, double-quote escaping, CRLF records, required header, no trimming, and formula text preserved as text. The sample bounds of 10,000 bytes, 100 rows, 3 columns, and 1,000 bytes per cell appear only in fictional fixture vectors. Schema ceilings are package resource guards, not defaults or accepted production limits; the host supplies its actual current policy and bound.

The checkpoint binds the full input reference, dialect, mapping, policy hash, byte offset, logical record, physical line, and `complete_record: true`. A resumed request must match an independently supplied stored checkpoint exactly. The helper compares that checkpoint; it does not parse CSV or decide record boundaries. The byte helper checks size, digest, BOM, and strict UTF-8, then discards the decoded string. The existing public CSV route remains disabled, and the new request check always returns `launch_authorized: false`. No filesystem lookup, parser callback, generation, formula execution, CSV launch, or input bundle inclusion occurs in this package.

## Restricted draft results and reads

`ProductionDraftRowResult/1.0.0` contains an unchanged `RowResult/1.0.0` plus a restricted draft view. It records render state, stored-byte integrity, handoff eligibility, and publication separately. The row helper runs the existing RowResult consistency checks; an ineligible row cannot be relabeled eligible. `ProductionDraftBatchResult/1.0.0` represents each count as known or unknown and requires the complete host-expected row sequence in ordinal order. It does not convert unknown counts to zero. A failed or incomplete atomic job cannot report a published row. Partial mode retains each row outcome, diagnostic, ordinal, and visibility state.

`ProductionFieldReadBinding/1.0.0` is a proposed host-observation DTO, not a grant or credential. A read check requires an independently supplied expected scope, actor, audience, purpose, opaque permission key, exact job/row/input/composition/file/bundle binding, current observation time, and explicit expiry. The reused `PersonalizeBatchRequest/1.0.0` binding contains references only; these fixtures do not add an `ApprovalReceipt` body or issuer record. The helper returns whether the supplied read observation matches its expectations. It does not authenticate the host, issue a permission, or enable a read service. Missing or unavailable authority requires external review; revoked, expired, stale, and wrong-scope observations refuse.

Stored output bytes are checked separately through the existing bundle integrity verifier. Integrity success remains independent of handoff eligibility, which stays blocked until the applicable host and owner evidence is supplied.

## Repair and replay

`ProductionDerivationBinding/1.0.0` commits to immutable parent and derived `Composition/1.0.0` references, input and plan hashes, policy and report references/hashes, resource commitments, runtime reference/hash, and the explicit association. Standalone repair uses a `standalone` association with job, row, ordinal, and row input hash all explicitly null. Row-bound repair carries the full job and row tuple.

Equal input or output hashes do not establish lineage. The consistency check requires an independently supplied exact expected binding and current derived-read observation. Mechanical classification alone does not authorize rendering or export. Material or unknown change requires external review and a new externally issued preview/approval; no parent approval carries forward. The replay comparator is pairwise only: exact tuple plus fresh read access yields a `NO_OP` classification with no new render, export, or approval carryforward. It is not a durable idempotency service.

## Provenance and status

The implementation used the producer's sanitized examples after an independent size/SHA check of 39 and 10 payload files, with zero mismatches. Their actual private IDs, revision hashes, and input commitment remain in the private worker result. The two captures have separate jobs and rows; no cross-capture join is proposed, and equal row hashes do not establish repair lineage. Public fixtures use only synthetic canonical UUIDs and fictional rows. No real attendee cells, private absolute paths, canonical parent/derived mapping, issuer identity, production grant, retention policy, consumer pin, or owner acceptance is claimed.

Catalog roles are intended only; every new version's current producer and consumer assignment arrays are empty. Public CSV launch, draft access service, repair execution, release acceptance, and consumer adoption remain owner decisions. The pure helpers expose no renderer, storage, parser, grant issuer, approval issuer, or UI.
