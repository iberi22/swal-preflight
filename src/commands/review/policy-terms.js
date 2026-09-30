// src/commands/review/policy-terms.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_RULES_PATH = path.resolve(__dirname, '../../../templates/review-rules.default.json');

export function compileRegex(pattern, defaultFlags = '') {
  let flags = defaultFlags;
  let p = pattern;
  if (p.startsWith('(?i)')) {
    p = p.slice(4);
    if (!flags.includes('i')) flags += 'i';
  }
  return new RegExp(p, flags);
}

export function globToMatcher(glob) {
  if (!glob || glob === '*') return () => true;
  const parts = glob.split('|').map(s => s.trim()).filter(Boolean);
  const regexes = parts.map(part => {
    let s = '';
    for (let i = 0; i < part.length; i++) {
      if (part.slice(i, i + 3) === '**/') {
        s += '(?:.+/)?';
        i += 2;
      } else if (part.slice(i, i + 2) === '**') {
        s += '.*';
        i += 1;
      } else if (part[i] === '*') {
        s += '[^/]*';
      } else if (part[i] === '?') {
        s += '.';
      } else if (/[.\\+^$[\](){}|]/.test(part[i])) {
        s += '\\' + part[i];
      } else {
        s += part[i];
      }
    }
    return new RegExp(`^${s}$`);
  });
  return (filePath) => regexes.some(r => r.test(filePath));
}

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

export async function checkPolicyTerms({ cwd = process.cwd(), base = 'origin/main', gitDiffFiles } = {}) {
  const findings = [];

  // Load defaults
  let defaults = { forbidden_patterns: [], rules: [] };
  if (fs.existsSync(DEFAULT_RULES_PATH)) {
    try {
      defaults = JSON.parse(fs.readFileSync(DEFAULT_RULES_PATH, 'utf8'));
    } catch {}
  }

  // Load repo rules
  let repoRules = { forbidden_patterns: [], rules: [] };
  const repoRulesPath = path.join(cwd, '.gitcore/review-rules.json');
  if (fs.existsSync(repoRulesPath)) {
    try {
      repoRules = JSON.parse(fs.readFileSync(repoRulesPath, 'utf8'));
    } catch {}
  }

  // Merge forbidden_patterns and rules
  const mergedForbidden = [
    ...(defaults.forbidden_patterns || []),
    ...(repoRules.forbidden_patterns || [])
  ];

  const mergedRules = [
    ...(defaults.rules || []),
    ...(repoRules.rules || [])
  ];

  // Convert simple forbidden_patterns to rules if not already present
  for (const fp of mergedForbidden) {
    const pat = typeof fp === 'string' ? fp : fp.pattern;
    const msg = typeof fp === 'object' && fp.message ? fp.message : `Forbidden pattern: '${pat}'`;
    const sev = typeof fp === 'object' && fp.severity ? fp.severity : 'blocking';
    mergedRules.push({
      forbid: `\\b${pat}\\b`,
      message: msg,
      severity: sev
    });
  }

  const changed = gitDiffFiles || getChangedFiles(cwd, base);

  for (const rule of mergedRules) {
    if (!rule.forbid) continue;

    const forbidRegex = compileRegex(rule.forbid);
    const unlessNearRegex = rule.unless_near ? compileRegex(rule.unless_near, 'i') : null;
    const matcher = globToMatcher(rule.file_glob);
    const severity = rule.severity || 'blocking';
    const message = rule.message || `Policy violation: matches '${rule.forbid}'`;

    // Files to scan: changed files matching glob, plus always files
    const alwaysFiles = Array.isArray(rule.always) ? rule.always : [];
    const filesToScan = new Set();

    for (const f of changed) {
      if (matcher(f)) filesToScan.add(f);
    }
    for (const af of alwaysFiles) {
      filesToScan.add(af);
    }

    for (const relFile of filesToScan) {
      const fullPath = path.join(cwd, relFile);
      if (!fs.existsSync(fullPath)) continue;

      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;

      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (forbidRegex.test(line)) {
          // Check unless_near
          if (unlessNearRegex) {
            const windowStart = Math.max(0, i - 5);
            const windowEnd = Math.min(lines.length - 1, i + 5);
            let forgiven = false;
            for (let w = windowStart; w <= windowEnd; w++) {
              if (unlessNearRegex.test(lines[w])) {
                forgiven = true;
                break;
              }
            }
            if (forgiven) continue;
          }

          findings.push({
            check: 'policy-terms',
            severity,
            file: relFile,
            line: i + 1,
            message
          });
        }
      }
    }
  }

  return findings;
}
