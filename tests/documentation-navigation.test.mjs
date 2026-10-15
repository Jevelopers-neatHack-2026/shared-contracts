import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const withoutFences = text => text.replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, '');
const slug = text => text.toLowerCase().replace(/[`*_]/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/ /g, '-');
function anchors(text) {
  const counts = new Map();
  return new Set([...withoutFences(text).matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)].map(match => {
    const base = slug(match[1]);
    const index = counts.get(base) ?? 0;
    counts.set(base, index + 1);
    return index ? `${base}-${index}` : base;
  }));
}
function findings(text, file, read = path => readFileSync(path, 'utf8'), exists = existsSync) {
  const errors = [];
  for (const match of withoutFences(text).matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1];
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) continue;
    const hash = target.indexOf('#');
    const pathname = decodeURIComponent(hash < 0 ? target : target.slice(0, hash));
    const fragment = hash < 0 ? '' : decodeURIComponent(target.slice(hash + 1));
    const resolved = pathname ? resolve(dirname(file), pathname) : file;
    const local = relative(root, resolved);
    if (local.startsWith('..') || isAbsolute(local) || !exists(resolved)) {
      errors.push(`missing or outside repository: ${target}`);
    } else if (fragment && /\.md$/i.test(resolved) && !anchors(read(resolved)).has(fragment)) {
      errors.push(`missing heading: ${target}`);
    }
  }
  return errors;
}

test('README local Markdown paths and heading fragments resolve without network access', () => {
  const file = resolve(root, 'README.md');
  assert.deepEqual(findings(readFileSync(file, 'utf8'), file), []);
});

test('navigation regression catches a missing file and a removed catalog heading', () => {
  const file = resolve(root, 'README.md');
  const value = '[missing](missing.md) [old section](docs/contract-catalog.md#common-envelope)';
  const errors = findings(value, file, () => '# Contract Catalog\n', path => !path.endsWith('/missing.md'));
  assert.equal(errors.length, 2);
  assert.ok(errors.some(x => x.includes('missing heading')));
  assert.ok(errors.some(x => x.includes('missing or outside repository')));
});

test('heading matching retains duplicate suffixes and ignores fenced examples', () => {
  const value = "# What's here\n## Repeat\n## Repeat\n```md\n# Hidden example\n```\n";
  assert.deepEqual([...anchors(value)], ['whats-here', 'repeat', 'repeat-1']);
  assert.deepEqual(findings('```md\n[example](absent.md)\n```\n', resolve(root, 'README.md')), []);
});
