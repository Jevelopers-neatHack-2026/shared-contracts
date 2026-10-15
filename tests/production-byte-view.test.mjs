import test from 'node:test';
import assert from 'node:assert/strict';
import { observedFiles, byteContext, calibration } from './production-seeds.mjs';
import { parseProductionCanonicalBytes, verifyProductionBundleFiles, verifyProductionZip, productionArchiveLimits } from '../tooling/production-operations.mjs';

for (const kind of ['data', 'returning', 'throwing']) {
  const shadow = bytes => {
    let calls = 0;
    for (const key of ['byteLength', 'buffer', 'byteOffset']) {
      Object.defineProperty(bytes, key, kind === 'data' ? { value: key === 'buffer' ? new ArrayBuffer(1) : 1 } : {
        get() { calls++; if (kind === 'throwing') throw new Error('caller getter'); return key === 'buffer' ? new ArrayBuffer(1) : 1; }
      });
    }
    return () => assert.equal(calls, 0);
  };
  test(`canonical manifest bounds use real bytes with ${kind} shadow properties`, () => {
    const bytes = observedFiles().find(file => file.filename === 'manifest.json').bytes;
    const untouched = shadow(bytes);
    assert.equal(parseProductionCanonicalBytes('ProductionBundle', '2.0.0', bytes, 1).errors[0].code, 'RESOURCE_LIMIT');
    assert.equal(parseProductionCanonicalBytes('ProductionBundle', '2.0.0', bytes, productionArchiveLimits.manifest_bytes).ok, true);
    assert.equal(parseProductionCanonicalBytes('ProductionBundle', '9.0.0', bytes, 1).errors[0].code, 'UNSUPPORTED_VERSION');
    untouched();
  });
  test(`outer files and ZIP use branded offset views with ${kind} shadow properties`, () => {
    const files = observedFiles().map(file => {
      const padded = Buffer.concat([Buffer.from('prefix'), file.bytes, Buffer.from('suffix')]);
      return { filename: file.filename, bytes: new Uint8Array(padded.buffer, padded.byteOffset + 6, file.bytes.length) };
    });
    const untouched = files.map(file => shadow(file.bytes));
    const result = verifyProductionBundleFiles(files, byteContext());
    assert.equal(result.ok, true);
    assert.equal(result.value.eligibility, 'blocked');
    const expected = calibration.trusted_commitment.file_set.filter(file => !['archive', 'detached'].includes(file.role));
    assert.equal(verifyProductionZip(files.find(file => file.filename === 'archive.zip').bytes, expected).ok, true);
    files.find(file => file.filename === 'output.svg').bytes[0] ^= 1;
    assert.equal(verifyProductionBundleFiles(files, byteContext()).ok, false);
    untouched.forEach(check => check());
  });
}
test('forged and detached byte views fail with typed results', () => {
  const forged = Object.create(Uint8Array.prototype);
  const detached = new Uint8Array(32);
  structuredClone(detached.buffer, { transfer: [detached.buffer] });
  for (const bytes of [forged, detached]) {
    assert.equal(parseProductionCanonicalBytes('ProductionBundle', '2.0.0', bytes, 1).ok, false);
    assert.equal(verifyProductionZip(bytes, [{}]).ok, false);
  }
});
