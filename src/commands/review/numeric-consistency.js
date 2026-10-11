// src/commands/review/numeric-consistency.js
import fs from 'node:fs';
import path from 'node:path';
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

export async function checkNumericConsistency({ cwd = process.cwd(), base = 'origin/main', gitDiffFiles } = {}) {
  const findings = [];
  const changed = gitDiffFiles || getChangedFiles(cwd, base);
  const changedMd = changed.filter(f => f.endsWith('.md'));

  // Regex for "<metric> <number> min"
  const metricRegex = /(?:^|[\s*`_~])([a-zA-Z][a-zA-Z0-9_-]*)\s+(\d+(?:\.\d+)?)\s*min\b/gi;

  // metricKey -> list of { file, line, num, rawMetric }
  const occurrencesByMetric = new Map();

  for (const relFile of changedMd) {
    const fullPath = path.join(cwd, relFile);
    if (!fs.existsSync(fullPath)) continue;

    let content;
    try {
      content = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matches = line.matchAll(metricRegex);
      for (const m of matches) {
        const rawMetric = m[1];
        const metricKey = rawMetric.toLowerCase();
        const num = parseFloat(m[2]);

        if (!occurrencesByMetric.has(metricKey)) {
          occurrencesByMetric.set(metricKey, []);
        }
        occurrencesByMetric.get(metricKey).push({
          file: relFile,
          line: i + 1,
          num,
          rawMetric
        });
      }
    }
  }

  // Check each metric for different numbers
  for (const [key, occurrences] of occurrencesByMetric.entries()) {
    const uniqueNums = new Set(occurrences.map(o => o.num));
    if (uniqueNums.size > 1) {
      for (const occ of occurrences) {
        const others = [...uniqueNums].filter(n => n !== occ.num).join(', ');
        findings.push({
          check: 'numeric-consistency',
          severity: 'warning',
          file: occ.file,
          line: occ.line,
          message: `Inconsistent metric value for '${occ.rawMetric}': stated as ${occ.num} min, but other values (${others} min) found in changed docs`
        });
      }
    }
  }

  return findings;
}
