// test/review/scope.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkScope } from '../../src/commands/review/scope.js';
import { createTempRepo } from './_helpers.mjs';

test('scope check: positive and negative cases', async (t) => {
  const repo = createTempRepo();
  t.after(() => repo.cleanup());

  fs.mkdirSync(path.join(repo.dir, 'src'), { recursive: true });

  // Negative case: within line limit and in issueFiles
  fs.writeFileSync(path.join(repo.dir, 'src/allowed.js'), '// line 1\n// line 2\n');
  repo.commitAll('add allowed.js');

  const negFindings = await checkScope({
    cwd: repo.dir,
    base: 'base-branch',
    issueFiles: 'src/allowed.js,README.md',
    maxLines: 10
  });
  assert.equal(negFindings.length, 0, 'Scoped changes within limit must pass');

  // Positive case 1: file not in issueFiles
  fs.writeFileSync(path.join(repo.dir, 'src/unallowed.js'), '// unexpected\n');
  repo.commitAll('add unallowed.js');

  const outOfScopeFindings = await checkScope({
    cwd: repo.dir,
    base: 'base-branch',
    issueFiles: 'src/allowed.js',
    maxLines: 400
  });
  const unallowedFinding = outOfScopeFindings.find(f => f.file === 'src/unallowed.js');
  assert.ok(unallowedFinding, 'File not in issue-files must be flagged');
  assert.equal(unallowedFinding.severity, 'blocking');

  // Positive case 2: maxLines exceeded
  const bigContent = Array.from({ length: 30 }, (_, i) => `// line ${i}`).join('\n') + '\n';
  fs.writeFileSync(path.join(repo.dir, 'src/allowed.js'), bigContent);
  repo.commitAll('exceed line count');

  const lineLimitFindings = await checkScope({
    cwd: repo.dir,
    base: 'base-branch',
    maxLines: 15
  });
  const limitFinding = lineLimitFindings.find(f => f.file === 'git-diff');
  assert.ok(limitFinding, 'Exceeded max-lines must be flagged');
  assert.equal(limitFinding.severity, 'blocking');
});
