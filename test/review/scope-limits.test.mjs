// test/review/scope-limits.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { checkScope } from '../../src/commands/review/scope.js';
import { createTempRepo } from './_helpers.mjs';

const COUNTS_RE = /non-test \d+\/\d+, test \d+\/\d+, fixture \d+\/\d+/;

const RUST_BASE = `pub fn add(a: i32, b: i32) -> i32 { a + b }

#[cfg(test)]
mod tests {
    #[test]
    fn t1() { assert!(true); }
    #[test]
    fn t2() { assert!(true); }
}
`;

function write(repo, file, content) {
  fs.mkdirSync(path.dirname(path.join(repo.dir, file)), { recursive: true });
  fs.writeFileSync(path.join(repo.dir, file), content);
}

// Baseline files are committed, then base-branch points at them so the diff
// only contains the change under test.
function baseline(repo) {
  repo.commitAll('baseline');
  execSync('git branch -f base-branch', { cwd: repo.dir, stdio: 'ignore' });
}

function limitFinding(findings, limit) {
  return findings.find(f => f.file === 'git-diff' && f.limit === limit);
}

test('scope limits: trailing #[cfg(test)] module in a .rs file is split', async (t) => {
  const repo = createTempRepo();
  t.after(() => repo.cleanup());

  write(repo, 'src/lib.rs', RUST_BASE);
  baseline(repo);

  // 4 non-test lines before the module (3 added + 1 rewritten) and 6 test lines inside it
  write(repo, 'src/lib.rs', `pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

#[cfg(test)]
mod tests {
    #[test]
    fn t1() { assert!(true); }
    #[test]
    fn t2() { assert!(true); }
    #[test]
    fn t3() { assert!(true); }
    #[test]
    fn t4() { assert!(true); }
    #[test]
    fn t5() { assert!(true); }
}
`);
  repo.commitAll('split non-test and test lines');

  const findings = await checkScope({
    cwd: repo.dir,
    base: 'base-branch',
    maxLines: 2,
    maxTestLines: 10,
    maxFixtureLines: 10
  });

  const hit = limitFinding(findings, 'maxLines');
  assert.ok(hit, 'only the non-test limit is exceeded');
  assert.equal(limitFinding(findings, 'maxTestLines'), undefined);
  assert.equal(limitFinding(findings, 'maxFixtureLines'), undefined);
  assert.equal(hit.severity, 'blocking');
  assert.equal(hit.message, 'Changed lines: non-test 4/2, test 6/10, fixture 0/10');
});

test('scope limits: removed lines use the old file cfg(test) boundary', async (t) => {
  const repo = createTempRepo();
  t.after(() => repo.cleanup());

  write(repo, 'src/lib.rs', RUST_BASE);
  baseline(repo);

  // Drop t2 from the trailing test module — the removed line is test code
  write(repo, 'src/lib.rs', RUST_BASE.replace('    #[test]\n    fn t2() { assert!(true); }\n', ''));
  repo.commitAll('remove one test');

  const findings = await checkScope({
    cwd: repo.dir,
    base: 'base-branch',
    maxLines: 0,
    maxTestLines: 0
  });

  const hit = limitFinding(findings, 'maxTestLines');
  assert.ok(hit, 'removed test line counts as test');
  assert.equal(limitFinding(findings, 'maxLines'), undefined);
  assert.equal(hit.message, 'Changed lines: non-test 0/0, test 2/0, fixture 0/50');
});

test('scope limits: files under tests/ benches/ and *_test.rs are test lines', async (t) => {
  const repo = createTempRepo();
  t.after(() => repo.cleanup());

  write(repo, 'src/lib.rs', RUST_BASE);
  baseline(repo);

  write(repo, 'crates/x/tests/it.rs', '// a\n// b\n// c\n');
  write(repo, 'benches/bench.rs', '// d\n');
  write(repo, 'src/parser_test.rs', '// e\n');
  write(repo, 'web/foo.test.js', '// f\n');
  repo.commitAll('add test files');

  const findings = await checkScope({
    cwd: repo.dir,
    base: 'base-branch',
    maxLines: 0,
    maxTestLines: 5
  });

  const hit = limitFinding(findings, 'maxTestLines');
  assert.ok(hit, 'test directories and names count as test');
  assert.equal(limitFinding(findings, 'maxLines'), undefined);
  assert.equal(hit.message, 'Changed lines: non-test 0/0, test 6/5, fixture 0/50');
});

test('scope limits: fixture files count as fixture lines', async (t) => {
  const repo = createTempRepo();
  t.after(() => repo.cleanup());

  write(repo, 'src/lib.rs', RUST_BASE);
  baseline(repo);

  write(repo, 'tests/fixtures/case.json', '{}\n');
  write(repo, 'src/out.snap', 'snapshot\n');
  write(repo, 'src/golden.txt', 'not a fixture\n');
  repo.commitAll('add fixtures');

  const findings = await checkScope({
    cwd: repo.dir,
    base: 'base-branch',
    maxTestLines: 0,
    maxFixtureLines: 1
  });

  const hit = limitFinding(findings, 'maxFixtureLines');
  assert.ok(hit, 'fixture lines have their own limit');
  assert.equal(limitFinding(findings, 'maxTestLines'), undefined);
  assert.equal(hit.message, 'Changed lines: non-test 1/400, test 0/0, fixture 2/1');
});

test('scope limits: no finding when every count is within its limit', async (t) => {
  const repo = createTempRepo();
  t.after(() => repo.cleanup());

  write(repo, 'src/lib.rs', RUST_BASE);
  baseline(repo);

  write(repo, 'src/lib.rs', RUST_BASE.replace('a + b }', 'a + b + 0 }'));
  write(repo, 'crates/x/tests/it.rs', '// a\n');
  repo.commitAll('small change');

  const findings = await checkScope({ cwd: repo.dir, base: 'base-branch' });
  assert.deepEqual(findings, [], 'within all three limits must emit nothing');
});

test('scope limits: every message reports all three counts', async (t) => {
  const repo = createTempRepo();
  t.after(() => repo.cleanup());

  write(repo, 'src/lib.rs', RUST_BASE);
  baseline(repo);

  write(repo, 'src/main.rs', '// a\n// b\n');
  write(repo, 'src/lib_test.rs', '// t\n');
  write(repo, 'tests/fixtures/case.json', '{}\n');
  repo.commitAll('trip all three limits');

  const findings = await checkScope({
    cwd: repo.dir,
    base: 'base-branch',
    maxLines: 1,
    maxTestLines: 0,
    maxFixtureLines: 0
  });

  const limits = findings.filter(f => f.file === 'git-diff').map(f => f.limit);
  assert.deepEqual(limits, ['maxLines', 'maxTestLines', 'maxFixtureLines']);
  for (const f of findings.filter(f => f.file === 'git-diff')) {
    assert.match(f.message, COUNTS_RE);
    assert.equal(f.message, 'Changed lines: non-test 2/1, test 1/0, fixture 1/0');
  }
});
