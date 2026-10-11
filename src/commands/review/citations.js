// src/commands/review/citations.js
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

export async function checkCitations({ cwd = process.cwd(), base = 'origin/main', gitDiffFiles } = {}) {
  const findings = [];
  const changed = gitDiffFiles || getChangedFiles(cwd, base);
  const changedMd = changed.filter(f => f.endsWith('.md'));

  // Cache line counts of target files
  const lineCountCache = new Map();

  function getFileLineCount(relPath) {
    if (lineCountCache.has(relPath)) return lineCountCache.get(relPath);
    const fullPath = path.join(cwd, relPath);
    if (!fs.existsSync(fullPath)) {
      lineCountCache.set(relPath, null);
      return null;
    }
    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) {
        lineCountCache.set(relPath, null);
        return null;
      }
      const content = fs.readFileSync(fullPath, 'utf8');
      const count = content.split('\n').length;
      lineCountCache.set(relPath, count);
      return count;
    } catch {
      lineCountCache.set(relPath, null);
      return null;
    }
  }

  // Regex to match path/to/file.ext:N or path/to/file.ext:N-M
  // Group 1: path, Group 2: start line, Group 3: optional end line
  const citationRegex = /(?:^|[`("'\s])([a-zA-Z0-9_./-]+\.[a-zA-Z0-9_-]+):(\d+)(?:-(\d+))?(?:[`)"'\s,:]|$)/g;

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
      const matches = line.matchAll(citationRegex);

      for (const m of matches) {
        const targetPath = m[1];
        const startLine = parseInt(m[2], 10);
        const endLine = m[3] ? parseInt(m[3], 10) : startLine;

        // Ignore paths outside the repo or with $HOME or ~ or absolute paths
        if (targetPath.includes('$HOME') || targetPath.startsWith('~') || targetPath.startsWith('/')) {
          continue;
        }

        const totalLines = getFileLineCount(targetPath);
        // Only check references whose path exists in the repo
        if (totalLines === null) {
          continue;
        }

        const rangeStr = m[3] ? `${startLine}-${endLine}` : `${startLine}`;
        if (startLine < 1 || startLine > totalLines || endLine < startLine || endLine > totalLines) {
          findings.push({
            check: 'citations',
            severity: 'blocking',
            file: relFile,
            line: i + 1,
            message: `Citation '${targetPath}:${rangeStr}' is out of range (${targetPath} has ${totalLines} lines)`
          });
        }
      }
    }
  }

  return findings;
}
