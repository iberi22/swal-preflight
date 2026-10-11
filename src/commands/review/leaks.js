// src/commands/review/leaks.js
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const DEFAULT_SECRET_PATTERNS = [
  'sk-[A-Za-z0-9_-]{20,}',
  'sk-or-v1-[A-Za-z0-9_-]{20,}',
  'ghp_[A-Za-z0-9]{20,}',
  'gho_[A-Za-z0-9]{20,}',
  'ghu_[A-Za-z0-9]{20,}',
  'AKIA[0-9A-Z]{16}',
  'xox[baprs]-[A-Za-z0-9-]{10,}',
  'AIza[0-9A-Za-z_-]{30,}',
  'BEGIN (?:[A-Z]+ )?PRIVATE KEY',
  'XAVIER_TOKEN=[a-zA-Z0-9]{8,}',
  'XAVIER_SUPABASE_KEY=[a-zA-Z0-9]{8,}'
];

function loadRepoSecretPatterns(cwd) {
  const scriptPath = path.join(cwd, 'scripts/check-secrets.sh');
  if (fs.existsSync(scriptPath)) {
    try {
      const content = fs.readFileSync(scriptPath, 'utf8');
      const m = content.match(/PATTERNS=['"]([^'"]+)['"]/);
      if (m && m[1]) {
        return m[1].split('|').map(p => p.trim()).filter(Boolean);
      }
    } catch {}
  }
  return [];
}

export async function checkLeaks({ cwd = process.cwd(), base = 'origin/main' } = {}) {
  const findings = [];

  let diffOutput = '';
  try {
    diffOutput = execSync(`git diff -U0 ${base}`, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch {
    return [];
  }

  // Combine default and repo secret patterns
  const repoPatterns = loadRepoSecretPatterns(cwd);
  const allSecretPatterns = [...new Set([...repoPatterns, ...DEFAULT_SECRET_PATTERNS])];
  const secretRegex = new RegExp(allSecretPatterns.join('|'));

  const personalPathRegex = /(?:^|[\s"'`=:(])\/(?:home|Users)\/[a-zA-Z0-9_.-]+(?:\/|\b)/;
  const fileUrlRegex = /file:\/\/\//;

  let currentFile = null;
  let currentNewLine = 0;

  const lines = diffOutput.split('\n');
  for (const line of lines) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6).trim();
      continue;
    } else if (line.startsWith('+++ /dev/null')) {
      currentFile = null;
      continue;
    }

    // Hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    if (line.startsWith('@@ ')) {
      const match = line.match(/\+([0-9]+)(?:,([0-9]+))?/);
      if (match) {
        currentNewLine = parseInt(match[1], 10);
      }
      continue;
    }

    if (!currentFile) continue;

    // Added lines start with + (and are not +++ diff headers)
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const addedContent = line.slice(1);
      const lineNum = currentNewLine;
      currentNewLine++;

      // Check personal absolute path
      if (personalPathRegex.test(addedContent)) {
        findings.push({
          check: 'leaks',
          severity: 'blocking',
          file: currentFile,
          line: lineNum,
          message: 'Personal absolute path detected'
        });
      }

      // Check file:///
      if (fileUrlRegex.test(addedContent)) {
        findings.push({
          check: 'leaks',
          severity: 'blocking',
          file: currentFile,
          line: lineNum,
          message: 'file:/// URL detected'
        });
      }

      // Check secret pattern
      if (secretRegex.test(addedContent)) {
        findings.push({
          check: 'leaks',
          severity: 'blocking',
          file: currentFile,
          line: lineNum,
          message: 'Potential secret pattern detected'
        });
      }
    }
  }

  return findings;
}
