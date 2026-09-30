// test/review/ledger-tests.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkLedgerTests } from '../../src/commands/review/ledger-tests.js';
import { createTempRepo } from './_helpers.mjs';

test('ledger-tests check: positive and negative cases', async (t) => {
  const repo = createTempRepo();
  t.after(() => repo.cleanup());

  fs.mkdirSync(path.join(repo.dir, '.gitcore'), { recursive: true });
  fs.mkdirSync(path.join(repo.dir, 'src'), { recursive: true });

  // Negative case: declared test exists in code
  fs.writeFileSync(
    path.join(repo.dir, '.gitcore/features.json'),
    JSON.stringify({
      features: {
        'feat-demo': {
          id: 'feat-demo',
          tests: ['test_demo_function']
        }
      }
    }, null, 2)
  );

  fs.writeFileSync(
    path.join(repo.dir, 'src/lib.rs'),
    '#[test]\nfn test_demo_function() {\n    assert!(true);\n}\n'
  );

  const negFindings = await checkLedgerTests({ cwd: repo.dir });
  assert.equal(negFindings.length, 0, 'Existing test filter should pass');

  // Positive case: declared test does not exist in code
  fs.writeFileSync(
    path.join(repo.dir, '.gitcore/features.json'),
    JSON.stringify({
      features: {
        'feat-demo': {
          id: 'feat-demo',
          tests: ['test_demo_function', 'test_missing_function']
        }
      }
    }, null, 2)
  );

  const posFindings = await checkLedgerTests({ cwd: repo.dir });
  assert.equal(posFindings.length, 1, 'Missing test filter must be flagged');
  assert.equal(posFindings[0].check, 'ledger-tests');
  assert.equal(posFindings[0].severity, 'blocking');
  assert.match(posFindings[0].message, /test_missing_function/);
});

test('ledger-tests check: count-annotated dart filters resolve', async (t) => {
  const repo = createTempRepo();
  t.after(() => repo.cleanup());
  fs.mkdirSync(path.join(repo.dir, '.gitcore'), { recursive: true });
  fs.mkdirSync(path.join(repo.dir, 'test/core'), { recursive: true });
  fs.writeFileSync(path.join(repo.dir, 'test/core/crypto_test.dart'), 'void main() {}\n');
  fs.writeFileSync(
    path.join(repo.dir, '.gitcore/features.json'),
    JSON.stringify({ features: { vault: { id: 'vault', status: 'stable',
      tests: ['test/core/crypto_test.dart (13)', 'test/core/missing_test.dart (2)'] } } }, null, 2)
  );
  const findings = await checkLedgerTests({ cwd: repo.dir });
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /missing_test\.dart/);
});
