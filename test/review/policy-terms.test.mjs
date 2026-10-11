// test/review/policy-terms.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkPolicyTerms } from '../../src/commands/review/policy-terms.js';
import { createTempRepo } from './_helpers.mjs';

test('policy-terms check: positive and negative cases', async (t) => {
  const repo = createTempRepo();
  t.after(() => repo.cleanup());

  // Negative case: qualified owner acceptance
  fs.mkdirSync(path.join(repo.dir, 'docs'), { recursive: true });
  fs.writeFileSync(
    path.join(repo.dir, 'docs/spec.md'),
    'The owner approves final product acceptance according to protocol.\n'
  );
  repo.commitAll('add spec');

  const negFindings = await checkPolicyTerms({
    cwd: repo.dir,
    base: 'base-branch'
  });
  assert.equal(negFindings.length, 0, 'Qualified owner approval should pass');

  // Positive case 1: unqualified owner approval
  fs.writeFileSync(
    path.join(repo.dir, 'docs/spec.md'),
    'The owner approval is strictly mandatory before continuing.\n'
  );
  repo.commitAll('modify spec with unqualified approval');

  const posFindings = await checkPolicyTerms({
    cwd: repo.dir,
    base: 'base-branch'
  });
  assert.ok(posFindings.length >= 1, 'Unqualified owner approval must be flagged');
  const finding = posFindings.find(f => f.check === 'policy-terms');
  assert.ok(finding);
  assert.equal(finding.severity, 'blocking');
  assert.equal(finding.file, 'docs/spec.md');

  // Positive case 2: forbidden model name "kimi"
  fs.writeFileSync(
    path.join(repo.dir, 'docs/spec.md'),
    'We should delegate this task to kimi for analysis.\n'
  );
  repo.commitAll('add kimi term');

  const kimiFindings = await checkPolicyTerms({
    cwd: repo.dir,
    base: 'base-branch'
  });
  const kimiFinding = kimiFindings.find(f => f.message.includes('kimi'));
  assert.ok(kimiFinding, 'Forbidden term kimi must be flagged');
  assert.equal(kimiFinding.severity, 'blocking');
});
