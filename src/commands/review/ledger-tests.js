// src/commands/review/ledger-tests.js
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findLineInFile(filePath, searchString) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(searchString)) return i + 1;
    }
  } catch {}
  return 1;
}

export function testFilterExists(cwd, testFilter, searchDirs) {
  // 1. Direct file
  if (fs.existsSync(path.join(cwd, testFilter))) return true;
  if (fs.existsSync(path.join(cwd, testFilter + '.rs'))) return true;
  if (fs.existsSync(path.join(cwd, 'tests', testFilter + '.rs'))) return true;

  // 2. Cargo.toml [[test]]
  const cargoTomlPath = path.join(cwd, 'Cargo.toml');
  if (fs.existsSync(cargoTomlPath)) {
    try {
      const cargo = fs.readFileSync(cargoTomlPath, 'utf8');
      if (new RegExp(`name\\s*=\\s*"${escapeRegex(testFilter)}"`).test(cargo)) return true;
    } catch {}
  }

  // 3. Module path ending in ::tests
  if (testFilter.endsWith('::tests')) {
    const modParts = testFilter.slice(0, -'::tests'.length).split('::');
    const cand1 = path.join(cwd, 'src', ...modParts) + '.rs';
    const cand2 = path.join(cwd, 'src', ...modParts, 'mod.rs');
    if (fs.existsSync(cand1) || fs.existsSync(cand2)) return true;
  }

  const leaf = testFilter.includes('::') ? testFilter.split('::').pop() : testFilter;

  // 4. fn <leaf>
  if (searchDirs.length > 0) {
    try {
      const out = execSync(`grep -rnE "\\b(async\\s+)?fn\\s+${escapeRegex(leaf)}\\b" ${searchDirs.join(' ')}`, {
        cwd,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      if (out.trim()) return true;
    } catch {}

    // 5. Grep for test name or testFilter in test/src directories
    try {
      const out = execSync(`grep -rnF "${testFilter}" ${searchDirs.join(' ')}`, {
        cwd,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      if (out.trim()) return true;
    } catch {}

    try {
      const out = execSync(`grep -rnF "${leaf}" ${searchDirs.join(' ')}`, {
        cwd,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      if (out.trim()) return true;
    } catch {}
  }

  return false;
}

export async function checkLedgerTests({ cwd = process.cwd() } = {}) {
  const findings = [];

  let featuresRelPath = '.gitcore/features.json';
  let featuresPath = path.join(cwd, featuresRelPath);
  if (!fs.existsSync(featuresPath)) {
    featuresRelPath = 'docs/features/features.json';
    featuresPath = path.join(cwd, featuresRelPath);
    if (!fs.existsSync(featuresPath)) {
      return [];
    }
  }

  let ledger;
  try {
    ledger = JSON.parse(fs.readFileSync(featuresPath, 'utf8'));
  } catch (e) {
    findings.push({
      check: 'ledger-tests',
      severity: 'blocking',
      file: featuresRelPath,
      line: 1,
      message: `Invalid features.json: ${e.message}`
    });
    return findings;
  }

  const rawFeats = ledger.features ? Object.values(ledger.features) : (ledger.items || (Array.isArray(ledger) ? ledger : []));
  const feats = Array.isArray(rawFeats) ? rawFeats : Object.values(rawFeats);

  const searchDirs = ['src', 'tests', 'crates', 'code-graph'].filter(d => fs.existsSync(path.join(cwd, d)));

  // Test-first declarations on not-yet-implemented features are expected; only
  // implemented features (a green verify run would promote them) must resolve.
  const PENDING = new Set(['planned', 'designed', 'draft', 'proposed']);

  for (const f of feats) {
    const featId = f.id || f.name || 'unnamed-feature';
    if (PENDING.has(String(f.status || '').toLowerCase())) continue;
    const tests = Array.isArray(f.tests) ? f.tests : (typeof f.tests === 'string' ? [f.tests] : []);

    for (const testFilter of tests) {
      if (!testFilter || typeof testFilter !== 'string') continue;

      const exists = testFilterExists(cwd, testFilter, searchDirs);
      if (!exists) {
        const line = findLineInFile(featuresPath, testFilter);
        findings.push({
          check: 'ledger-tests',
          severity: 'blocking',
          file: featuresRelPath,
          line,
          message: `Declared test filter '${testFilter}' in feature '${featId}' not found in repo`
        });
      }
    }
  }

  return findings;
}
