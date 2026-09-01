// src/commands/bump.js
import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import { discoverVersions, suggestBump } from '../../lib/version.js';

function setCargoVersion(filePath, newVersion) {
  let raw = fs.readFileSync(filePath, 'utf8');
  raw = raw.replace(/^(\s*version\s*=\s*)"[^"]+"/m, `$1"${newVersion}"`);
  fs.writeFileSync(filePath, raw);
}
function setJsonVersion(filePath, newVersion) {
  const j = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  j.version = newVersion;
  fs.writeFileSync(filePath, JSON.stringify(j, null, 2) + '\n');
}

export async function bumpCommand(opts) {
  const cwd = opts.cwd || process.cwd();
  const to = opts.to;
  const dryRun = opts.dryRun;

  const versions = discoverVersions(cwd);
  if (versions.length === 0) { console.error('No manifests found'); process.exit(1); }

  const current = versions.find(v => v.key === 'cargo' || v.file === 'Cargo.toml')?.version
    || versions[0].version;

  let target = to;
  if (!target) {
    // auto-suggest from commits since last tag
    const { execSync } = await import('node:child_process');
    function sh(cmd) { try { return execSync(cmd, { cwd, encoding: 'utf8' }).trim(); } catch { return ''; } }
    const lastTag = sh('git describe --tags --abbrev=0 2>/dev/null');
    const log = lastTag ? sh(`git log ${lastTag}..HEAD --pretty=%s`) : sh('git log --pretty=%s | head -n20');
    const commits = log.split('\n').filter(Boolean).map(m => ({ message: m }));
    target = suggestBump(commits, current);
    if (!target) { console.log(`No bump needed (current ${current}, no feat/fix/breaking since ${lastTag || 'HEAD'})`); return; }
    console.log(`Suggested bump: ${current} → ${target} (from commits since ${lastTag || 'HEAD'})`);
    if (dryRun) { console.log('(dry-run, not writing)'); return; }
  } else {
    if (!semver.valid(to)) { console.error(`Invalid semver: ${to}`); process.exit(1); }
    console.log(`Bump: ${current} → ${to}${dryRun ? ' (dry-run)' : ''}`);
  }

  if (dryRun) return;

  for (const v of versions) {
    const full = path.join(cwd, v.file);
    if (v.file.endsWith('Cargo.toml')) setCargoVersion(full, target);
    else setJsonVersion(full, target);
    console.log(`  ✓ ${v.file} → ${target}`);
  }

  // CHANGELOG: move Unreleased → new version if exists
  const clPath = path.join(cwd, 'CHANGELOG.md');
  if (fs.existsSync(clPath)) {
    let cl = fs.readFileSync(clPath, 'utf8');
    if (cl.includes('## [Unreleased]')) {
      const date = new Date().toISOString().slice(0, 10);
      cl = cl.replace('## [Unreleased]', `## [Unreleased]\n\n## [${target}] — ${date}`);
      fs.writeFileSync(clPath, cl);
      console.log(`  ✓ CHANGELOG.md: [Unreleased] → [${target}] — ${date}`);
    }
  }

  // README badge (optional)
  const readmePath = path.join(cwd, 'README.md');
  if (fs.existsSync(readmePath)) {
    let rd = fs.readFileSync(readmePath, 'utf8');
    const badgeRe = /badge\/version-[0-9.]+-/;
    if (badgeRe.test(rd)) {
      rd = rd.replace(badgeRe, `badge/version-${target}-`);
      fs.writeFileSync(readmePath, rd);
      console.log(`  ✓ README.md badge → ${target}`);
    }
  }

  console.log(`\nDone. Next: git add -A && git commit -m "chore(release): ${target}"`);
}
