// src/commands/review/scope.js
import { execSync } from 'node:child_process';

function getChangedFiles(cwd, base) {
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

function getNumstat(cwd, base) {
  try {
    const out = execSync(`git diff --numstat ${base}`, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return out.split('\n').map(s => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export async function checkScope({ cwd = process.cwd(), base = 'origin/main', issueFiles, maxLines = 400, gitDiffFiles } = {}) {
  const findings = [];
  const changed = gitDiffFiles || getChangedFiles(cwd, base);

  // 1. Issue files check (if provided)
  if (issueFiles) {
    const rawList = Array.isArray(issueFiles) ? issueFiles : issueFiles.split(',');
    const allowed = new Set(rawList.map(s => s.trim()).filter(Boolean));

    for (const f of changed) {
      if (!allowed.has(f)) {
        findings.push({
          check: 'scope',
          severity: 'blocking',
          file: f,
          line: 1,
          message: `Changed file '${f}' is not in --issue-files allowlist`
        });
      }
    }
  }

  // 2. Max lines check
  const numstatLines = getNumstat(cwd, base);
  let totalChanged = 0;
  for (const line of numstatLines) {
    const parts = line.split('\t');
    if (parts.length >= 2) {
      const added = parseInt(parts[0], 10) || 0;
      const deleted = parseInt(parts[1], 10) || 0;
      totalChanged += added + deleted;
    }
  }

  const limit = typeof maxLines === 'number' ? maxLines : (parseInt(maxLines, 10) || 400);
  if (totalChanged > limit) {
    findings.push({
      check: 'scope',
      severity: 'blocking',
      file: 'git-diff',
      line: 1,
      message: `Total changed lines (${totalChanged}) exceeds limit of ${limit}`
    });
  }

  return findings;
}
