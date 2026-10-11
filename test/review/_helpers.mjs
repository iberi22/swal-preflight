// test/review/helpers.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

export function createTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swal-preflight-test-'));
  execSync('git init -b main', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.email "test@swal.dev"', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.name "SWAL Test"', { cwd: dir, stdio: 'ignore' });
  fs.writeFileSync(path.join(dir, '.gitkeep'), '');
  execSync('git add . && git commit -m "initial"', { cwd: dir, stdio: 'ignore' });
  execSync('git branch base-branch', { cwd: dir, stdio: 'ignore' });

  return {
    dir,
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    },
    commitAll: (msg = 'update') => {
      execSync(`git add -A && git commit -m "${msg}"`, { cwd: dir, stdio: 'ignore' });
    }
  };
}
