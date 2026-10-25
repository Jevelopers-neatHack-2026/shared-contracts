import test from 'node:test';
import assert from 'node:assert/strict';
import { productionByteView } from '../tooling/production-zip.mjs';
import { parseProductionCanonicalBytes, verifyProductionBundleFiles, verifyProductionZip, productionArchiveLimits } from '../tooling/production-operations.mjs';
import { observedFiles, byteContext, calibration } from './production-seeds.mjs';
import { checkProductionCsvInputBytes, verifyProductionDraftStoredFiles } from '../tooling/production-field-boundaries.mjs';
import { productionCsvSeed } from './production-field-csv-seeds.mjs';

const manifest = () => observedFiles().find(file => file.filename === 'manifest.json').bytes;
const archive = () => observedFiles().find(file => file.filename === 'archive.zip').bytes;
const expected = () => calibration.trusted_commitment.file_set.filter(file => !['archive', 'detached'].includes(file.role));
const csv = await productionCsvSeed();
const csvContext = { scope: csv.scope, input_ref: csv.inputRef, policy: csv.policy };
const draftContext = { scope: calibration.scope, bundle_ref: calibration.trusted_commitment };
const routes = {
  byteView: bytes => productionByteView(bytes),
  manifest: bytes => parseProductionCanonicalBytes('ProductionBundle', '2.0.0', bytes, productionArchiveLimits.manifest_bytes),
  zip: bytes => verifyProductionZip(bytes, expected()),
  bundle: bytes => {
    const files = observedFiles();
    files[0].bytes = bytes;
    return verifyProductionBundleFiles(files, byteContext());
  },
  draft: bytes => {
    const files = observedFiles();
    files[0].bytes = bytes;
    return verifyProductionDraftStoredFiles(files, calibration.trusted_commitment, draftContext);
  },
  csv: bytes => checkProductionCsvInputBytes(csv.inputRef, bytes, csvContext)
};
function rejectsBytes(route, value) {
  const result = routes[route](value);
  if (route === 'byteView') assert.equal(result, null);
  else {
    assert.equal(result.ok, false);
    assert.equal(result.errors[0].code, route === 'bundle' ? 'INTEGRITY_FAILURE' : route === 'draft' ? 'INVALID_INPUT' : 'RESOURCE_LIMIT');
    if (route === 'draft') assert.equal(result.errors[0].path, '/0');
  }
}

for (const route of Object.keys(routes)) {
  test(`${route} rejects a revoked byte-array proxy with a typed result`, () => {
    const { proxy, revoke } = Proxy.revocable(new Uint8Array(1), {});
    revoke();
    rejectsBytes(route, proxy);
  });

  test(`${route} rejects a byte-array proxy without invoking its prototype trap`, () => {
    let calls = 0;
    const proxy = new Proxy(new Uint8Array(1), {
      getPrototypeOf() {
        calls++;
        throw new Error('caller-controlled prototype trap');
      }
    });
    rejectsBytes(route, proxy);
    assert.equal(calls, 0);
  });

  for (const [kind, value] of [
    ['DataView', () => new DataView(new ArrayBuffer(1))],
    ['Uint16Array', () => new Uint16Array(1)],
    ['Uint8ClampedArray', () => new Uint8ClampedArray(1)],
    ['ArrayBuffer', () => new ArrayBuffer(1)]
  ]) test(`${route} rejects ${kind} as non-byte input`, () => rejectsBytes(route, value()));
}

for (const kind of ['Buffer', 'Uint8Array']) {
  const asBytes = source => {
    if (kind === 'Buffer') return Buffer.from(source);
    const padded = new Uint8Array(source.length + 4);
    padded.set(source, 2);
    return padded.subarray(2, source.length + 2);
  };
  test(`${kind} byte views preserve their exact content and offset`, () => {
    const source = manifest(), bytes = asBytes(source), view = productionByteView(bytes);
    assert.ok(Buffer.isBuffer(view));
    assert.deepEqual(view, source);
    assert.equal(parseProductionCanonicalBytes('ProductionBundle', '2.0.0', bytes, productionArchiveLimits.manifest_bytes).ok, true);
    assert.equal(verifyProductionZip(asBytes(archive()), expected()).ok, true);
    const files = observedFiles().map(file => ({ ...file, bytes: asBytes(file.bytes) }));
    const result = verifyProductionBundleFiles(files, byteContext());
    assert.equal(result.ok, true);
    assert.equal(result.value.integrity, 'passed');
    assert.equal(result.value.eligibility, 'blocked');
    const draft = verifyProductionDraftStoredFiles(files, calibration.trusted_commitment, draftContext);
    assert.equal(draft.ok, true);
    assert.equal(draft.value.integrity, 'verified');
    assert.equal(draft.value.eligibility, 'blocked');
    const input = checkProductionCsvInputBytes(csv.inputRef, asBytes(csv.bytes), csvContext);
    assert.equal(input.ok, true);
    assert.equal(input.value.parser_invoked, false);
    assert.equal(input.value.decoded_text_returned, false);
  });
}
