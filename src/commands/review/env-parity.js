// src/commands/review/env-parity.js
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const SYSTEM_ENV_VARS = new Set(['HOME', 'PATH', 'USER', 'SHELL', 'TERM', 'TMPDIR', 'PWD', 'CARGO_MANIFEST_DIR']);

function collectCodeFiles(dir, maxDepth = 10, currentDepth = 0) {
  if (currentDepth > maxDepth || !fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['target', '.git', 'node_modules', 'dist', '.xavier'].includes(entry.name)) continue;
      files.push(...collectCodeFiles(fullPath, maxDepth, currentDepth + 1));
    } else if (entry.isFile()) {
      if (/\.(rs|js|mjs|cjs|ts|tsx|jsx|py|sh|ps1)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

export async function checkEnvParity({ cwd = process.cwd(), base = 'origin/main', gitDiffFiles } = {}) {
  const findings = [];

  const envExamplePath = path.join(cwd, '.env.example');
  if (!fs.existsSync(envExamplePath)) {
    return findings;
  }

  const envRaw = fs.readFileSync(envExamplePath, 'utf8');
  const envLines = envRaw.split('\n');

  // Parse documented keys
  const documentedKeys = new Map(); // key -> line
  for (let i = 0; i < envLines.length; i++) {
    const line = envLines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (m) {
      documentedKeys.set(m[1], i + 1);
    }
  }

  // 1. Part A: Check documented keys are read somewhere in code
  const searchDirs = ['src', 'tests', 'crates', 'code-graph', 'panel-ui', 'scripts', 'lib']
    .map(d => path.join(cwd, d))
    .filter(d => fs.existsSync(d));

  const codeFiles = [];
  for (const d of searchDirs) {
    codeFiles.push(...collectCodeFiles(d));
  }

  const codeContents = [];
  for (const f of codeFiles) {
    try {
      codeContents.push(fs.readFileSync(f, 'utf8'));
    } catch {}
  }
  const allCode = codeContents.join('\n');

  for (const [key, line] of documentedKeys.entries()) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const readRegex = new RegExp(
      `(?:(?:std::)?env::var(?:_os)?|process\\.env|os\\.environ(?:\\.get)?|os\\.getenv|\\$env:)\\s*(?:\\(?\\s*["'\`]${escaped}["'\`]|\\.${escaped}\\b|\\[\\s*["'\`]${escaped}["'\`]\\])|\\$${escaped}\\b|\\$\\{${escaped}\\}`,
      'i'
    );

    if (!readRegex.test(allCode)) {
      findings.push({
        check: 'env-parity',
        severity: 'warning',
        file: '.env.example',
        line,
        message: `Documented environment variable '${key}' is not read in codebase`
      });
    }
  }

  // 2. Part B: Check env vars read in changed Rust files are documented in .env.example
  let diffOutput = '';
  try {
    diffOutput = execSync(`git diff -U0 ${base}`, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch {
    return findings;
  }

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

    if (line.startsWith('@@ ')) {
      const match = line.match(/\+([0-9]+)(?:,([0-9]+))?/);
      if (match) {
        currentNewLine = parseInt(match[1], 10);
      }
      continue;
    }

    if (!currentFile || !currentFile.endsWith('.rs')) continue;

    if (line.startsWith('+') && !line.startsWith('+++')) {
      const addedContent = line.slice(1);
      const lineNum = currentNewLine;
      currentNewLine++;

      const matches = addedContent.matchAll(/(?:std::)?env::var(?:_os)?\s*\(\s*"([A-Za-z0-9_]+)"\s*\)/g);
      for (const m of matches) {
        const key = m[1];
        if (!SYSTEM_ENV_VARS.has(key) && !documentedKeys.has(key)) {
          findings.push({
            check: 'env-parity',
            severity: 'blocking',
            file: currentFile,
            line: lineNum,
            message: `Environment variable '${key}' read in code but not documented in .env.example`
          });
        }
      }
    }
  }

  return findings;
}
