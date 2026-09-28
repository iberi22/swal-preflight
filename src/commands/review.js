// src/commands/review.js — deterministic zero-LLM review preflight
import path from 'node:path';
import { execSync } from 'node:child_process';
import { checkPolicyTerms } from './review/policy-terms.js';
import { checkLedgerTests } from './review/ledger-tests.js';
import { checkEnvParity } from './review/env-parity.js';
import { checkCitations } from './review/citations.js';
import { checkScope } from './review/scope.js';
import { checkLeaks } from './review/leaks.js';
import { checkNumericConsistency } from './review/numeric-consistency.js';

function getGitDiffFiles(cwd, base) {
  try {
    const out = execSync(`git diff --name-only ${base}`, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return out.split('\n').map(s => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export async function reviewCommand(opts = {}) {
  const cwd = opts.cwd ? path.resolve(opts.cwd) : process.cwd();
  const base = opts.base || 'origin/main';
  const issueFiles = opts.issueFiles;
  const maxLines = opts.maxLines !== undefined ? parseInt(opts.maxLines, 10) : 400;
  const json = Boolean(opts.json);

  const gitDiffFiles = getGitDiffFiles(cwd, base);

  // Run all 7 checks
  const [
    policyFindings,
    ledgerFindings,
    envFindings,
    citationFindings,
    scopeFindings,
    leakFindings,
    numericFindings
  ] = await Promise.all([
    checkPolicyTerms({ cwd, base, gitDiffFiles }),
    checkLedgerTests({ cwd }),
    checkEnvParity({ cwd, base, gitDiffFiles }),
    checkCitations({ cwd, base, gitDiffFiles }),
    checkScope({ cwd, base, issueFiles, maxLines, gitDiffFiles }),
    checkLeaks({ cwd, base }),
    checkNumericConsistency({ cwd, base, gitDiffFiles })
  ]);

  const findings = [
    ...policyFindings,
    ...ledgerFindings,
    ...envFindings,
    ...citationFindings,
    ...scopeFindings,
    ...leakFindings,
    ...numericFindings
  ];

  if (json) {
    console.log(JSON.stringify(findings, null, 2));
    return findings;
  }

  // Pretty-printed terminal output
  console.log(`\n🔍 swal-preflight review — ${cwd}`);
  console.log(`🌿 Base ref: ${base} | Files changed: ${gitDiffFiles.length}`);

  if (findings.length === 0) {
    console.log('\n✅ PASS — 0 findings across 7 review checks\n');
    return findings;
  }

  const blocking = findings.filter(f => f.severity === 'blocking');
  const warnings = findings.filter(f => f.severity === 'warning');

  console.log(`\nFound ${findings.length} issue(s) (${blocking.length} blocking, ${warnings.length} warning):\n`);

  for (const f of findings) {
    const badge = f.severity === 'blocking' ? '❌ [blocking]' : '⚠  [warning] ';
    console.log(`  ${badge} ${f.file}:${f.line} — [${f.check}] ${f.message}`);
  }

  if (blocking.length > 0) {
    console.log(`\nVerdict: ❌ FAIL — address blocking findings before submitting to review panel.\n`);
  } else {
    console.log(`\nVerdict: ✅ PASS — no blocking findings (${warnings.length} warning(s) to consider).\n`);
  }
  return findings;
}
