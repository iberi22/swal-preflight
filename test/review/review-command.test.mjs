// test/review/review-command.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { reviewCommand } from '../../src/commands/review.js';
import { createTempRepo } from './_helpers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BIN_PATH = path.resolve(__dirname, '../../bin/swal-preflight.js');

test('reviewCommand integrated in-process and CLI', async (t) => {
  const repo = createTempRepo();
  t.after(() => repo.cleanup());

  fs.mkdirSync(path.join(repo.dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repo.dir, 'src/main.rs'), 'fn main() {}\n');
  repo.commitAll('clean base');

  // In-process clean run
  const cleanFindings = await reviewCommand({
    cwd: repo.dir,
    base: 'base-branch',
    json: true
  });
  assert.equal(cleanFindings.length, 0);

  // CLI clean run -> exit code 0
  const cliCleanOut = execSync(`node "${BIN_PATH}" review --cwd "${repo.dir}" --base base-branch --json`, {
    encoding: 'utf8'
  });
  const parsedClean = JSON.parse(cliCleanOut);
  assert.deepEqual(parsedClean, []);

  // Add a defect: /home/path leak in added code
  fs.writeFileSync(path.join(repo.dir, 'src/main.rs'), 'fn main() { let _ = "/home/secret/pass"; }\n');
  repo.commitAll('introduce leak');

  // In-process defective run
  const defectFindings = await reviewCommand({
    cwd: repo.dir,
    base: 'base-branch',
    json: true
  });
  assert.ok(defectFindings.length >= 1);
  assert.equal(defectFindings[0].check, 'leaks');
  assert.equal(defectFindings[0].severity, 'blocking');

  // CLI defective run -> exit code 1
  let cliExitCode = 0;
  let cliDefectOut = '';
  try {
    cliDefectOut = execSync(`node "${BIN_PATH}" review --cwd "${repo.dir}" --base base-branch --json`, {
      encoding: 'utf8'
    });
  } catch (err) {
    cliExitCode = err.status;
    cliDefectOut = err.stdout;
  }
  assert.equal(cliExitCode, 1, 'Review with findings must exit with code 1');
  const parsedDefects = JSON.parse(cliDefectOut);
  assert.ok(parsedDefects.length >= 1);
  assert.equal(parsedDefects[0].check, 'leaks');
});
