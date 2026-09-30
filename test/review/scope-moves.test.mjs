// test/review/scope-moves.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { checkScope } from '../../src/commands/review/scope.js';
import { createTempRepo } from './_helpers.mjs';

const fn = i => `pub fn helper_${i}(x: u32) -> u32 {\n    let y = x + ${i};\n    y * 2\n}\n`;
const block = n => Array.from({ length: n }, (_, i) => fn(i)).join('\n');

function setup(t, files) {
  const repo = createTempRepo();
  t.after(() => repo.cleanup());
  fs.mkdirSync(path.join(repo.dir, 'src'), { recursive: true });
  for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(repo.dir, f), c);
  repo.commitAll('base');
  const base = execSync('git rev-parse HEAD', { cwd: repo.dir, encoding: 'utf8' }).trim();
  return { repo, base };
}

test('scope: code moved verbatim to another file does not count', async (t) => {
  const { repo, base } = setup(t, { 'src/old.rs': block(60), 'src/new.rs': '' });
  // 60 functions x 5 lines = ~300 lines moved: 600 changed lines without move detection
  fs.writeFileSync(path.join(repo.dir, 'src/old.rs'), '');
  fs.writeFileSync(path.join(repo.dir, 'src/new.rs'), block(60).replace(/^/gm, '    '));
  const findings = await checkScope({ cwd: repo.dir, base });
  assert.equal(findings.length, 0);
});

test('scope: new code next to a move still counts', async (t) => {
  const { repo, base } = setup(t, { 'src/old.rs': block(60), 'src/new.rs': '' });
  fs.writeFileSync(path.join(repo.dir, 'src/old.rs'), '');
  const fresh = Array.from({ length: 450 }, (_, i) => `let v${i} = compute(${i});`).join('\n');
  fs.writeFileSync(path.join(repo.dir, 'src/new.rs'), block(60) + '\n' + fresh + '\n');
  const findings = await checkScope({ cwd: repo.dir, base });
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /non-test 45\d\/400/);
  assert.match(findings[0].message, /moved verbatim, not counted/);
});

test('scope: isolated trivial lines never cancel out as a move', async (t) => {
  const lines = n => Array.from({ length: n }, (_, i) => `x${i} = ${i};\n}`).join('\n') + '\n';
  const { repo, base } = setup(t, { 'src/a.rs': lines(250) });
  // same braces, different statements: nothing is a verbatim window of 3 lines
  fs.writeFileSync(path.join(repo.dir, 'src/a.rs'), Array.from({ length: 250 }, (_, i) => `y${i} = ${i};\n}`).join('\n') + '\n');
  const findings = await checkScope({ cwd: repo.dir, base });
  assert.equal(findings.length, 1);
});

test('scope: SWAL_COUNT_MOVES=1 counts moves again', async (t) => {
  const { repo, base } = setup(t, { 'src/old.rs': block(60), 'src/new.rs': '' });
  fs.writeFileSync(path.join(repo.dir, 'src/old.rs'), '');
  fs.writeFileSync(path.join(repo.dir, 'src/new.rs'), block(60));
  process.env.SWAL_COUNT_MOVES = '1';
  t.after(() => { delete process.env.SWAL_COUNT_MOVES; });
  const findings = await checkScope({ cwd: repo.dir, base });
  assert.equal(findings.length, 1);
});
