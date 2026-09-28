// test/review/env-parity.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkEnvParity } from '../../src/commands/review/env-parity.js';
import { createTempRepo } from './_helpers.mjs';

test('env-parity check: positive and negative cases', async (t) => {
  const repo = createTempRepo();
  t.after(() => repo.cleanup());

  fs.mkdirSync(path.join(repo.dir, 'src'), { recursive: true });

  // Negative case: ALL_GOOD is documented and read; no undocumented reads
  fs.writeFileSync(path.join(repo.dir, '.env.example'), 'ALL_GOOD=value\n');
  fs.writeFileSync(path.join(repo.dir, 'src/lib.rs'), 'let _ = std::env::var("ALL_GOOD");\n');
  repo.commitAll('base env and code');

  const negFindings = await checkEnvParity({
    cwd: repo.dir,
    base: 'base-branch'
  });
  assert.equal(negFindings.length, 0, 'Clean env parity should pass without findings');

  // Positive case 1: documented-but-unused env var -> warning
  fs.writeFileSync(path.join(repo.dir, '.env.example'), 'ALL_GOOD=value\nUNUSED_VAR=test\n');
  repo.commitAll('add unused env var');

  const warnFindings = await checkEnvParity({
    cwd: repo.dir,
    base: 'base-branch'
  });
  const unusedFinding = warnFindings.find(f => f.message.includes('UNUSED_VAR'));
  assert.ok(unusedFinding, 'Unused env var must produce finding');
  assert.equal(unusedFinding.severity, 'warning');
  assert.equal(unusedFinding.file, '.env.example');

  // Positive case 2: undocumented env read in changed Rust file -> blocking
  fs.writeFileSync(
    path.join(repo.dir, 'src/lib.rs'),
    'let _ = std::env::var("ALL_GOOD");\nlet _ = std::env::var("SECRET_UNDOCUMENTED");\n'
  );
  repo.commitAll('add undocumented env read');

  const blockFindings = await checkEnvParity({
    cwd: repo.dir,
    base: 'base-branch'
  });
  const undocFinding = blockFindings.find(f => f.message.includes('SECRET_UNDOCUMENTED'));
  assert.ok(undocFinding, 'Undocumented env read must produce finding');
  assert.equal(undocFinding.severity, 'blocking');
  assert.equal(undocFinding.file, 'src/lib.rs');
});
