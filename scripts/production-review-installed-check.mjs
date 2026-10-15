import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './generate.mjs';

export async function productionReviewInstalledChecks(directory, run) {
  const tests = join(directory, 'review-tests');
  await mkdir(tests);
  await cp(join(directory, 'node_modules/@jevelopers/shared-contracts/fixtures'), join(directory, 'fixtures'), {recursive:true});
  for (const name of ['production-field-review.test.mjs', 'production-byte-view.test.mjs', 'production-field-derivation-seeds.mjs', 'production-field-results-seeds.mjs', 'production-field-csv-seeds.mjs', 'production-seeds.mjs']) {
    const source = (await readFile(root+'tests/'+name, 'utf8'))
      .replaceAll('../tooling/production-field-boundaries-core.mjs', '@jevelopers/shared-contracts/production-field-boundaries')
      .replaceAll('../tooling/production-field-boundaries.mjs', '@jevelopers/shared-contracts/production-field-boundaries')
      .replaceAll('../tooling/production-operations.mjs', '@jevelopers/shared-contracts/production-operations')
      .replaceAll('../tooling/runtime.mjs', '@jevelopers/shared-contracts')
      .replaceAll('../tooling/production-values.mjs', '@jevelopers/shared-contracts/production-operations');
    await writeFile(join(tests, name), source);
  }
  console.log(run(process.execPath, ['--test', 'review-tests/production-field-review.test.mjs', 'review-tests/production-byte-view.test.mjs'], directory).trim());
}
