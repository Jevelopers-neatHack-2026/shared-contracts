import test from 'node:test';
import assert from 'node:assert/strict';
import { checkProductionDerivationBinding, compareProductionDerivationReplay, checkProductionDraftRowResult, checkProductionDraftBatchResult, checkProductionCsvBatchRequest, checkProductionCsvInputBytes, verifyProductionDraftStoredFiles } from '../tooling/production-field-boundaries.mjs';
import { productionFieldRecordHash } from '../tooling/production-field-boundaries-core.mjs';
import { productionDerivationSeed } from './production-field-derivation-seeds.mjs';
import { productionDraftSeed, readExpectation, clone } from './production-field-results-seeds.mjs';
import { productionCsvSeed } from './production-field-csv-seeds.mjs';
import { partialBatch } from './production-seeds.mjs';
const fieldReference = v => ({contract:v.contract,schema_version:v.schema_version,id:v.id ?? v.schema_id,revision:v.revision,content_hash:v.content_hash});
const foreign = '123e4567-e89b-42d3-a456-000000000099';
const rehash = v => { v.binding_hash = productionFieldRecordHash(v, 'binding_hash'); };
const reject = (result, code) => { assert.equal(result.ok, false); if (code) assert.equal(result.errors[0].code, code); };
function rowContext(s, c = s.batchContext()) { return { ...c, expected_draft_output:c.expected_draft_outputs[0], read_binding:c.read_bindings[0], expected_read_binding:c.expected_read_bindings[0] }; }
function qualify(s) {
  const r=s.batch.rows[0].row_result, eligible=partialBatch().batch.rows[0];
  r.artifact_ref=clone(eligible.artifact_ref);r.bundle_ref=clone(eligible.bundle_ref);r.eligibility=clone(eligible.eligibility);
  r.bundle_ref.row_scope={job_ref:clone(r.job),row_id:r.row_id,ordinal:r.ordinal,input_hash:r.input_hash};
  return {[r.row_id]:{artifact_ref:clone(r.artifact_ref),bundle_ref:clone(r.bundle_ref),job:clone(r.job),input_hash:r.input_hash,ordinal:r.ordinal,preflight_status:'passed'}};
}
for(const route of ['derivation','replay'])for(const field of ['scope','parent_ref','derived_ref','association']) test('001 '+route+' joins operation '+field,async()=>{
 const s=await productionDerivationSeed();assert.equal(checkProductionDerivationBinding(s.binding,s.context).ok,true);assert.equal(compareProductionDerivationReplay(s.binding,s.binding,s.context).ok,true);
 const c=clone(s.context), read=c.current_read_binding;
 if(field==='scope')read.scope.tenant_id=foreign;
 if(field==='parent_ref')read.parent_ref.id=foreign;
 if(field==='derived_ref'){read.derived_ref.id=foreign;read.composition_ref=clone(read.derived_ref);}
 if(field==='association')read.association={kind:'row',job_ref:partialBatch().batch.job,row_id:'foreign-row',ordinal:0,input_hash:s.binding.input_hash};
 rehash(read);c.expected_read_binding=readExpectation(read,c.now);
 reject(route==='derivation'?checkProductionDerivationBinding(s.binding,c):compareProductionDerivationReplay(s.binding,s.binding,c),'NEEDS_EXTERNAL_REVIEW');
});
test('002 draft read scope must match operation scope',async()=>{
 const s=await productionDraftSeed(),c=s.batchContext();assert.equal(checkProductionDraftRowResult(s.batch.rows[0],rowContext(s,c)).ok,true);
 c.read_bindings[0].scope.tenant_id=foreign;rehash(c.read_bindings[0]);c.expected_read_bindings[0]=readExpectation(c.read_bindings[0],c.now);
 reject(checkProductionDraftRowResult(s.batch.rows[0],rowContext(s,c)),'BINDING_MISMATCH');reject(checkProductionDraftBatchResult(s.batch,c),'BINDING_MISMATCH');
});
test('003 atomic failed draft cannot hide eligible RowResult refs under unpublished output',async()=>{
 const s=await productionDraftSeed();assert.equal(checkProductionDraftBatchResult(s.batch,s.batchContext()).ok,true);const verified=qualify(s),c=s.batchContext();c.verified_rows=verified;
 reject(checkProductionDraftRowResult(s.batch.rows[0],rowContext(s,c)),'ATOMIC_NOT_COMMITTED');reject(checkProductionDraftBatchResult(s.batch,c),'ATOMIC_NOT_COMMITTED');
});
test('004 published RowResult and draft/read refs must agree',async()=>{
 const s=await productionDraftSeed(),verified=qualify(s),r=s.batch.rows[0],out=r.draft_output;
 Object.assign(out,{composition_ref:clone(r.row_result.artifact_ref.composition_ref),artifact_ref:clone(r.row_result.artifact_ref),bundle_ref:clone(r.row_result.bundle_ref),file_commitments:clone(r.row_result.bundle_ref.file_set),render_hash:r.row_result.artifact_ref.render_hash,storage_state:'stored',integrity_state:'verified',handoff_eligibility:'eligible',publication_state:'published'});
 const c=s.batchContext();c.verified_rows=verified;c.expected_batch_state={...c.expected_batch_state,acceptance_policy:'allow_partial',status:'partially_succeeded',publication_state:'published'};
 function bind(){Object.assign(c.read_bindings[0],{composition_ref:clone(out.composition_ref),artifact_ref:clone(out.artifact_ref),bundle_ref:clone(out.bundle_ref),file_commitments:clone(out.file_commitments)});rehash(c.read_bindings[0]);c.expected_read_bindings[0]=readExpectation(c.read_bindings[0],c.now);c.expected_draft_outputs[0]=clone(out);}
 bind();assert.equal(checkProductionDraftRowResult(r,rowContext(s,c)).ok,true);
 out.artifact_ref.artifact_ref.id=foreign;out.bundle_ref.bundle_ref.id=foreign;bind();
 reject(checkProductionDraftRowResult(r,rowContext(s,c)),'BINDING_MISMATCH');
});
for(const kind of ['returning','throwing'])for(const route of ['csv','stored'])test('005 '+route+' bytes ignore TypedArray '+kind+' byteLength getter',async()=>{
 let calls=0;const shadow=bytes=>Object.defineProperty(bytes,'byteLength',{get(){calls++;if(kind==='throwing')throw Error('caller getter');return 1;}});
 if(route==='csv'){
 const s=await productionCsvSeed();shadow(s.bytes);
 assert.equal(checkProductionCsvInputBytes(s.inputRef,s.bytes,{scope:s.scope,input_ref:s.inputRef,policy:s.policy}).ok,true);
 }else{
 const d=await productionDraftSeed(),trusted=d.calibration.trusted_commitment;shadow(d.observedFiles[0].bytes);
 assert.equal(verifyProductionDraftStoredFiles(d.observedFiles,trusted,{scope:d.calibration.scope,bundle_ref:trusted}).ok,true);
 }
 assert.equal(calls,0);
});
test('005 real CSV bytes cannot be relabeled as one byte',async()=>{
 const s=await productionCsvSeed();s.inputRef.byte_size=1;s.inputRef.content_hash=productionFieldRecordHash(s.inputRef);
 s.policy.maximum_bytes=1;s.policy.content_hash=productionFieldRecordHash(s.policy);Object.defineProperty(s.bytes,'byteLength',{value:1});
 reject(checkProductionCsvInputBytes(s.inputRef,s.bytes,{scope:s.scope,input_ref:s.inputRef,policy:s.policy}),'RESOURCE_LIMIT');
});
test('006 CSV descriptor exceeding policy rejects before byte access',async()=>{
 const s=await productionCsvSeed();assert.equal(checkProductionCsvBatchRequest(s.request,s.context).ok,true);
 const p=s.context.input_policy;p.maximum_bytes=s.inputRef.byte_size-1;p.content_hash=productionFieldRecordHash(p);
 s.request.input.input_policy_hash=p.content_hash;s.request.input.input_policy_ref=fieldReference(p);
 s.request.input.checkpoint=null;s.context.expected_checkpoint=null;
 Object.assign(s.context.input_read_binding,{input_policy_hash:p.content_hash});rehash(s.context.input_read_binding);s.context.expected_input_read_binding=readExpectation(s.context.input_read_binding,s.context.now);
 reject(checkProductionCsvBatchRequest(s.request,s.context),'RESOURCE_LIMIT');
});
for(const key of ['tenant_id','project_id'])test('007 CSV checkpoint joins request '+key,async()=>{
 const s=await productionCsvSeed();assert.equal(checkProductionCsvBatchRequest(s.request,s.context).ok,true);
 s.request.input.checkpoint[key]=foreign;s.request.input.checkpoint.content_hash=productionFieldRecordHash(s.request.input.checkpoint);s.context.expected_checkpoint=clone(s.request.input.checkpoint);
 reject(checkProductionCsvBatchRequest(s.request,s.context),'CHECKPOINT_INVALID');
});
test('008 duplicate original row IDs reject even with matching expectations',async()=>{
 const s=await productionDraftSeed(),c=s.batchContext();assert.equal(checkProductionDraftBatchResult(s.batch,c).ok,true);
 c.original_rows[1].row_id=c.original_rows[0].row_id;s.batch.rows[1].row_result.row_id=c.original_rows[0].row_id;
 const {hashManifest}=await import('../tooling/runtime.mjs');s.batch.rows[1].row_result.input_hash=hashManifest(c.original_rows[1]);
 for(const e of s.batch.rows[1].row_result.errors)e.row_id=c.original_rows[0].row_id;
 Object.assign(c.read_bindings[1].association,{row_id:c.original_rows[0].row_id,input_hash:s.batch.rows[1].row_result.input_hash});rehash(c.read_bindings[1]);c.expected_read_bindings[1]=readExpectation(c.read_bindings[1],c.now);
 reject(checkProductionDraftBatchResult(s.batch,c),'ROW_DUPLICATE');
});
