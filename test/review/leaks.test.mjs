// test/review/leaks.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkLeaks } from '../../src/commands/review/leaks.js';
import { createTempRepo } from './_helpers.mjs';

test('leaks check: positive and negative cases', async (t) => {
  const repo = createTempRepo();
  t.after(() => repo.cleanup());

  fs.mkdirSync(path.join(repo.dir, 'src'), { recursive: true });

  // Negative case: clean code without leaks
  fs.writeFileSync(path.join(repo.dir, 'src/clean.rs'), 'fn hello() -> &str { "world" }\n');
  repo.commitAll('add clean file');

  const negFindings = await checkLeaks({
    cwd: repo.dir,
    base: 'base-branch'
  });
  assert.equal(negFindings.length, 0, 'Clean code should have zero leak findings');

  // Positive case 1: personal absolute path (/home/user)
  fs.writeFileSync(
    path.join(repo.dir, 'src/clean.rs'),
    'fn hello() -> &str { "/home/developer/secret.txt" }\n'
  );
  repo.commitAll('add personal path');

  const pathFindings = await checkLeaks({
    cwd: repo.dir,
    base: 'base-branch'
  });
  const pathFinding = pathFindings.find(f => f.file === 'src/clean.rs');
  assert.ok(pathFinding, 'Personal path must be flagged');
  assert.equal(pathFinding.severity, 'blocking');
  assert.equal(pathFinding.message, 'Personal absolute path detected');
  // NEVER print the value in the message
  assert.equal(pathFinding.message.includes('/home/developer'), false);

  // Positive case 2: file:/// URL
  fs.writeFileSync(
    path.join(repo.dir, 'src/clean.rs'),
    'const URL: &str = "file:///tmp/test.log";\n'
  );
  repo.commitAll('add file url');

  const urlFindings = await checkLeaks({
    cwd: repo.dir,
    base: 'base-branch'
  });
  const urlFinding = urlFindings.find(f => f.file === 'src/clean.rs');
  assert.ok(urlFinding, 'file:/// URL must be flagged');
  assert.equal(urlFinding.severity, 'blocking');
  assert.equal(urlFinding.message, 'file:/// URL detected');

  // Positive case 3: secret pattern (e.g. ghp_ token)
  const fakeToken = 'ghp_' + 'A'.repeat(25);
  fs.writeFileSync(
    path.join(repo.dir, 'src/clean.rs'),
    `const TOKEN: &str = "${fakeToken}";\n`
  );
  repo.commitAll('add secret token');

  const secretFindings = await checkLeaks({
    cwd: repo.dir,
    base: 'base-branch'
  });
  const secretFinding = secretFindings.find(f => f.file === 'src/clean.rs');
  assert.ok(secretFinding, 'Secret pattern must be flagged');
  assert.equal(secretFinding.severity, 'blocking');
  assert.equal(secretFinding.message, 'Potential secret pattern detected');
  assert.equal(secretFinding.message.includes(fakeToken), false, 'Secret value must never appear in message');
});
