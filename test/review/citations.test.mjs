// test/review/citations.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkCitations } from '../../src/commands/review/citations.js';
import { createTempRepo } from './_helpers.mjs';

test('citations check: positive and negative cases', async (t) => {
  const repo = createTempRepo();
  t.after(() => repo.cleanup());

  fs.mkdirSync(path.join(repo.dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(repo.dir, 'docs'), { recursive: true });

  // Create a 5-line target file
  fs.writeFileSync(
    path.join(repo.dir, 'src/target.rs'),
    '// line 1\n// line 2\n// line 3\n// line 4\n// line 5\n'
  );

  // Negative case: in-range citation and ignored paths ($HOME, missing file)
  fs.writeFileSync(
    path.join(repo.dir, 'docs/guide.md'),
    'Valid: `src/target.rs:2-4` and `src/target.rs:5`\nIgnored: `$HOME/.hermes/config:100` and `missing.rs:999`\n'
  );
  repo.commitAll('add target and valid guide');

  const negFindings = await checkCitations({
    cwd: repo.dir,
    base: 'base-branch'
  });
  assert.equal(negFindings.length, 0, 'In-range citations and external/missing paths must pass');

  // Positive case: citation line exceeds target file length
  fs.writeFileSync(
    path.join(repo.dir, 'docs/guide.md'),
    'Out of range: `src/target.rs:20`\n'
  );
  repo.commitAll('modify guide with out of range citation');

  const posFindings = await checkCitations({
    cwd: repo.dir,
    base: 'base-branch'
  });
  assert.equal(posFindings.length, 1, 'Out-of-range citation must be flagged');
  assert.equal(posFindings[0].check, 'citations');
  assert.equal(posFindings[0].severity, 'blocking');
  assert.equal(posFindings[0].file, 'docs/guide.md');
  assert.match(posFindings[0].message, /out of range/i);
});
