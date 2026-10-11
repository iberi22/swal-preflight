// test/review/numeric-consistency.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkNumericConsistency } from '../../src/commands/review/numeric-consistency.js';
import { createTempRepo } from './_helpers.mjs';

test('numeric-consistency check: positive and negative cases', async (t) => {
  const repo = createTempRepo();
  t.after(() => repo.cleanup());

  fs.mkdirSync(path.join(repo.dir, 'docs'), { recursive: true });

  // Negative case: consistent metrics (timeout 5 min everywhere, different metrics allowed)
  fs.writeFileSync(
    path.join(repo.dir, 'docs/arch.md'),
    'The process timeout 5 min is standard.\nAlso retention 30 min is configured.\n'
  );
  fs.writeFileSync(
    path.join(repo.dir, 'docs/guide.md'),
    'Expected timeout 5 min under normal conditions.\n'
  );
  repo.commitAll('add consistent docs');

  const negFindings = await checkNumericConsistency({
    cwd: repo.dir,
    base: 'base-branch'
  });
  assert.equal(negFindings.length, 0, 'Consistent metrics should have zero findings');

  // Positive case: inconsistent metrics (timeout 5 min vs timeout 15 min)
  fs.writeFileSync(
    path.join(repo.dir, 'docs/guide.md'),
    'Expected timeout 15 min under heavy load.\n'
  );
  repo.commitAll('change guide to inconsistent timeout');

  const posFindings = await checkNumericConsistency({
    cwd: repo.dir,
    base: 'base-branch'
  });
  assert.ok(posFindings.length >= 2, 'Inconsistent metric occurrences must be flagged');
  for (const f of posFindings) {
    assert.equal(f.check, 'numeric-consistency');
    assert.equal(f.severity, 'warning');
    assert.match(f.message, /timeout/i);
  }
});
