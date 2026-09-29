// test/review/scope-formatter.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { formatterOnlyFiles } from '../../src/commands/review/scope.js';
import { createTempRepo } from './_helpers.mjs';

const UNFORMATTED = 'fn  main( ) {let x=1;println!("{}",x);}\n';

test('scope: a rustfmt-only change is exempt, a formatted+edited one is not', (t) => {
  const repo = createTempRepo();
  t.after(() => repo.cleanup());
  fs.mkdirSync(path.join(repo.dir, 'src'));
  fs.writeFileSync(path.join(repo.dir, 'src/a.rs'), UNFORMATTED);
  fs.writeFileSync(path.join(repo.dir, 'src/b.rs'), UNFORMATTED);
  repo.commitAll('base');
  const base = execSync('git rev-parse HEAD', { cwd: repo.dir, encoding: 'utf8' }).trim();

  const formatted = execSync('rustfmt --emit stdout --edition 2021', { input: UNFORMATTED, encoding: 'utf8' });
  fs.writeFileSync(path.join(repo.dir, 'src/a.rs'), formatted);
  fs.writeFileSync(path.join(repo.dir, 'src/b.rs'), formatted.replace('let x = 1;', 'let x = 2;'));

  const exempt = formatterOnlyFiles(repo.dir, base, ['src/a.rs', 'src/b.rs']);
  assert.ok(exempt.has('src/a.rs'));
  assert.ok(!exempt.has('src/b.rs'));
});
