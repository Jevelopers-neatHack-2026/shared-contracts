import test from 'node:test';
import assert from 'node:assert/strict';
import { dependencyErrors, deliverableGraph, graphErrors } from '../scripts/dependency-map.mjs';

// Synthetic metadata only: these records are not live issue or owner acceptance evidence.
function seed() {
  const authority = { issues: [
    { issue: 3, body_sha256: 'gate', blocked_by_source: 'Every required leaf below\n- [ ] #4\n- [ ] #5\n- [ ] #9' },
    { issue: 4, body_sha256: 'inventory', blocked_by_source: '#5' },
    { issue: 5, body_sha256: 'toolchain', blocked_by_source: 'None' },
    { issue: 9, body_sha256: 'errors', blocked_by_source: '#4 and #5' }
  ] };
  const requirements = { issues: [
    { issue: 3, body_sha256: 'gate', dependencies: [4, 5, 9], artifact_dependencies: [], closure_dependencies: [4, 5, 9] },
    { issue: 4, body_sha256: 'inventory', dependencies: [5], artifact_dependencies: [5], closure_dependencies: [] },
    { issue: 5, body_sha256: 'toolchain', dependencies: [], artifact_dependencies: [], closure_dependencies: [] },
    { issue: 9, body_sha256: 'errors', dependencies: [4, 5], artifact_dependencies: [4, 5], closure_dependencies: [] }
  ] };
  return { requirements, authority };
}
function rejects(requirements, authority, issue, code = 'AUTHORITATIVE_DEPENDENCY_MISMATCH') {
  assert.ok(dependencyErrors(requirements, authority).some(error => error.code === code && error.issue === issue));
}

test('complete authoritative coverage preserves dependency and deliverable checks without mutation', () => {
  const input = seed(), before = structuredClone(input);
  assert.deepEqual(dependencyErrors(input.requirements, input.authority), []);
  assert.deepEqual(graphErrors(deliverableGraph(input.requirements)), []);
  assert.deepEqual(input, before);
});

test('NEW-2 cannot hide removed issue dependencies by dropping the authority row', () => {
  const { requirements, authority } = seed();
  authority.issues = authority.issues.filter(row => row.issue !== 9);
  const row = requirements.issues.find(row => row.issue === 9);
  row.dependencies = []; row.artifact_dependencies = [];
  // The graph is still acyclic; structural graph validation alone does not prove coverage.
  assert.deepEqual(graphErrors(deliverableGraph(requirements)), []);
  rejects(requirements, authority, 9);
});

for (const issue of [3, 4, 5, 9]) test('missing authority row fails even with unchanged edges: ' + issue, () => {
  const { requirements, authority } = seed();
  authority.issues = authority.issues.filter(row => row.issue !== issue);
  rejects(requirements, authority, issue);
});

test('empty authority fails closed for every required issue', () => {
  const { requirements, authority } = seed(); authority.issues = [];
  assert.deepEqual(dependencyErrors(requirements, authority).map(error => error.issue), [3, 4, 5, 9]);
});

test('authority issue absent from requirements still rejects', () => {
  const { requirements, authority } = seed();
  requirements.issues = requirements.issues.filter(row => row.issue !== 9);
  rejects(requirements, authority, 9);
});

for (const collection of ['requirements', 'authority']) {
  for (const placement of ['first', 'last']) test('duplicate ' + collection + ' issue rejects at ' + placement, () => {
    const input = seed(), rows = input[collection].issues;
    const duplicate = structuredClone(rows.find(row => row.issue === 9));
    if (placement === 'first') rows.unshift(duplicate); else rows.push(duplicate);
    rejects(input.requirements, input.authority, 9);
  });
}

test('conflicting requirement duplicate cannot hide behind the first matching row', () => {
  const { requirements, authority } = seed();
  requirements.issues.push({ ...structuredClone(requirements.issues.at(-1)), body_sha256: 'changed', dependencies: [], artifact_dependencies: [] });
  rejects(requirements, authority, 9);
});

test('row and dependency ordering do not change complete coverage', () => {
  const { requirements, authority } = seed();
  requirements.issues.reverse(); authority.issues.reverse();
  for (const row of requirements.issues) {
    row.dependencies.reverse(); row.artifact_dependencies.reverse(); row.closure_dependencies.reverse();
  }
  const before = structuredClone({ requirements, authority });
  assert.deepEqual(dependencyErrors(requirements, authority), []);
  assert.deepEqual({ requirements, authority }, before);
});

for (const [field, code] of [
  ['body_sha256', 'AUTHORITATIVE_DEPENDENCY_MISMATCH'],
  ['dependencies', 'AUTHORITATIVE_DEPENDENCY_MISMATCH'],
  ['artifact_dependencies', 'ARTIFACT_DEPENDENCY_MISMATCH'],
  ['closure_dependencies', 'CLOSURE_DEPENDENCY_MISMATCH']
]) test('complete issue coverage still rejects changed ' + field, () => {
  const { requirements, authority } = seed();
  const issue = field === 'closure_dependencies' ? 3 : 9;
  const row = requirements.issues.find(row => row.issue === issue);
  row[field] = field === 'body_sha256' ? 'changed' : [];
  rejects(requirements, authority, issue, code);
});

test('explicit paired issue additions are not rejected by a hard-coded issue count', () => {
  const { requirements, authority } = seed();
  authority.issues.push({ issue: 10, body_sha256: 'jobs', blocked_by_source: '#9' });
  requirements.issues.push({ issue: 10, body_sha256: 'jobs', dependencies: [9], artifact_dependencies: [9], closure_dependencies: [] });
  assert.deepEqual(dependencyErrors(requirements, authority), []);
  assert.deepEqual(graphErrors(deliverableGraph(requirements)), []);
});

test('separately tracked followups retain their existing scope', () => {
  const { requirements, authority } = seed();
  requirements.followups = [{ issue: 32, artifact_dependencies: [5] }];
  assert.deepEqual(dependencyErrors(requirements, authority), []);
  assert.deepEqual(graphErrors(deliverableGraph(requirements)), []);
});
