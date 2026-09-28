// src/commands/review/scope.js
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TEST_DIRS = new Set(['tests', 'benches', 'fuzz']);
const FIXTURE_DIRS = new Set(['fixtures', 'testdata', 'snapshots']);
const FIXTURE_EXTS = new Set(['.snap', '.golden', '.bin']);
const DATA_EXTS = new Set(['.json', '.toml', '.yaml']);
const CFG_TEST_RE = /^\s*#\[cfg\(test\)\]/;
const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function git(cwd, args) {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch {
    return null;
  }
}

function getChangedFiles(cwd, base) {
  const out = git(cwd, `diff --name-only ${base}`);
  return out ? out.split('\n').map(s => s.trim()).filter(Boolean) : [];
}

function toLimit(value, fallback) {
  if (typeof value === 'number') return value;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function segmentsOf(file) {
  return file.split('/').filter(Boolean);
}

function dirSegmentsOf(file) {
  return segmentsOf(file).slice(0, -1);
}

function extOf(file) {
  return path.posix.extname(file).toLowerCase();
}

function isFixtureFile(file) {
  const ext = extOf(file);
  if (FIXTURE_EXTS.has(ext)) return true;
  const dirs = dirSegmentsOf(file);
  if (dirs.some(d => FIXTURE_DIRS.has(d))) return true;
  if (DATA_EXTS.has(ext) && dirs.some(d => d === 'tests' || d === 'fixtures')) return true;
  return false;
}

function isTestFile(file) {
  if (dirSegmentsOf(file).some(d => TEST_DIRS.has(d))) return true;
  const name = segmentsOf(file).pop();
  return /(^|_)tests?\.rs$/.test(name) || /\.test\.[^.]+$/.test(name) || /\.spec\.[^.]+$/.test(name);
}

function firstCfgTestLine(content) {
  if (content === null) return null;
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (CFG_TEST_RE.test(lines[i])) return i + 1;
  }
  return null;
}

function readNewContent(cwd, file) {
  try {
    return fs.readFileSync(path.join(cwd, file), 'utf8');
  } catch {
    return null;
  }
}

function readOldContent(cwd, base, file) {
  const out = git(cwd, `show ${base}:${JSON.stringify(file)}`);
  return out;
}

// Returns per-line classifiers for one path: added lines use the new file,
// removed lines use the old file (both at their own line numbers).
function classifierFor(cwd, base, file) {
  if (isFixtureFile(file)) {
    return { added: () => 'fixture', removed: () => 'fixture' };
  }
  if (isTestFile(file)) {
    return { added: () => 'test', removed: () => 'test' };
  }
  if (extOf(file) === '.rs') {
    const newStart = firstCfgTestLine(readNewContent(cwd, file));
    let oldStart;
    let oldResolved = false;
    return {
      added: n => (newStart !== null && n >= newStart ? 'test' : 'nonTest'),
      removed: n => {
        if (!oldResolved) {
          oldStart = firstCfgTestLine(readOldContent(cwd, base, file));
          oldResolved = true;
        }
        return oldStart !== null && n >= oldStart ? 'test' : 'nonTest';
      }
    };
  }
  return { added: () => 'nonTest', removed: () => 'nonTest' };
}

function stripDiffPrefix(p) {
  return p.replace(/^[ab]\//, '');
}

function countChangedLines(cwd, base) {
  const counts = { nonTest: 0, test: 0, fixture: 0 };
  const diff = git(cwd, `diff -U0 ${base}`);
  if (diff === null) return counts;

  let classifier = { added: () => 'nonTest', removed: () => 'nonTest' };
  let oldFile = null;
  let newFile = null;
  let newLine = 0;
  let oldLine = 0;
  let inHunk = false;

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      classifier = { added: () => 'nonTest', removed: () => 'nonTest' };
      oldFile = null;
      newFile = null;
      inHunk = false;
      continue;
    }
    if (line.startsWith('--- ')) {
      const p = line.slice(4).trim();
      oldFile = p === '/dev/null' ? null : stripDiffPrefix(p);
      continue;
    }
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).trim();
      newFile = p === '/dev/null' ? null : stripDiffPrefix(p);
      classifier = classifierFor(cwd, base, newFile || oldFile);
      continue;
    }
    const hunk = HUNK_RE.exec(line);
    if (hunk) {
      oldLine = parseInt(hunk[1], 10);
      newLine = parseInt(hunk[2], 10);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith('+')) {
      counts[classifier.added(newLine)]++;
      newLine++;
    } else if (line.startsWith('-')) {
      counts[classifier.removed(oldLine)]++;
      oldLine++;
    } else if (line.startsWith(' ')) {
      newLine++;
      oldLine++;
    } else if (line.startsWith('\\')) {
      continue;
    } else {
      inHunk = false;
    }
  }

  return counts;
}

export async function checkScope({
  cwd = process.cwd(),
  base = 'origin/main',
  issueFiles,
  maxLines = 400,
  maxTestLines = 400,
  maxFixtureLines = 50,
  gitDiffFiles
} = {}) {
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

  // 2. Max lines check — separate limits for non-test, test and fixture lines
  const limits = {
    nonTest: toLimit(maxLines, 400),
    test: toLimit(maxTestLines, 400),
    fixture: toLimit(maxFixtureLines, 50)
  };
  const counts = countChangedLines(cwd, base);
  const message =
    `Changed lines: non-test ${counts.nonTest}/${limits.nonTest}, ` +
    `test ${counts.test}/${limits.test}, ` +
    `fixture ${counts.fixture}/${limits.fixture}`;

  const exceeded = [
    { limit: 'maxLines', kind: 'nonTest' },
    { limit: 'maxTestLines', kind: 'test' },
    { limit: 'maxFixtureLines', kind: 'fixture' }
  ].filter(({ kind }) => counts[kind] > limits[kind]);

  for (const { limit } of exceeded) {
    findings.push({
      check: 'scope',
      severity: 'blocking',
      file: 'git-diff',
      line: 1,
      limit,
      message
    });
  }

  return findings;
}
