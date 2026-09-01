// src/commands/check.js
import fs from 'node:fs';
import path from 'node:path';
import { discoverVersions, checkSync } from '../../lib/version.js';

export async function checkCommand(opts) {
  const cwd = opts.cwd || process.cwd();
  console.log(`\n🔍 swal-preflight check — ${cwd}\n`);

  // 1. Versions
  const versions = discoverVersions(cwd);
  if (versions.length === 0) {
    console.log('⚠  No manifests found (Cargo.toml / package.json / tauri.conf.json)');
  } else {
    console.log('📦 Manifests:');
    for (const v of versions) console.log(`   ${v.file.padEnd(35)} ${v.version}`);
    const sync = checkSync(versions);
    if (sync.ok) console.log('   ✅ Versions in sync:', sync.uniq[0] || '(none)');
    else {
      console.log(`   ❌ MISMATCH: ${sync.uniq.join(' vs ')}`);
      console.log('   → run: swal-preflight bump --to <version>  to align');
    }
  }

  // 2. CHANGELOG
  const changelog = path.join(cwd, 'CHANGELOG.md');
  if (fs.existsSync(changelog)) {
    const raw = fs.readFileSync(changelog, 'utf8');
    const hasUnreleased = raw.includes('## [Unreleased]');
    const versionsInCL = [...raw.matchAll(/## \[([^\]]+)\]/g)].map(m => m[1]);
    console.log(`\n📝 CHANGELOG.md: ${hasUnreleased ? 'has [Unreleased] ✓' : 'MISSING [Unreleased] ✗'} — versions: ${versionsInCL.slice(0,5).join(', ')}`);
  } else {
    console.log('\n📝 CHANGELOG.md: missing ✗');
  }

  // 3. Git status
  const { execSync } = await import('node:child_process');
  function sh(cmd) { try { return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim(); } catch { return null; } }
  const branch = sh('git rev-parse --abbrev-ref HEAD');
  const tags = sh('git tag --list | tail -n5');
  const dirty = sh('git status --porcelain | head -n10');
  const lastTag = sh('git describe --tags --abbrev=0 2>/dev/null');
  const commitsSinceTag = lastTag ? sh(`git log ${lastTag}..HEAD --oneline | wc -l`) : sh('git log --oneline | wc -l');
  console.log(`\n🌿 Git: branch=${branch} lastTag=${lastTag || '(none)'} commitsSinceTag=${commitsSinceTag || '?'}`);
  if (tags) console.log(`   tags (recent): ${tags.split('\n').join(', ')}`);
  if (dirty) console.log(`   ⚠ dirty:\n${dirty.split('\n').map(l => '     ' + l).join('\n')}`);
  else console.log('   ✅ working tree clean');

  // 4. GitCore features (if present)
  const featuresPath = path.join(cwd, '.gitcore/features.json');
  if (fs.existsSync(featuresPath)) {
    try {
      const fj = JSON.parse(fs.readFileSync(featuresPath, 'utf8'));
      const feats = fj.features ? Object.values(fj.features) : (fj.items || []);
      const arr = Array.isArray(feats) ? feats : Object.values(feats);
      const byStatus = {};
      for (const f of arr) byStatus[f.status] = (byStatus[f.status] || 0) + 1;
      console.log(`\n📊 .gitcore/features.json: ${arr.length} features — ${JSON.stringify(byStatus)}`);
    } catch (e) { console.log(`\n📊 .gitcore/features.json: parse error ${e.message}`); }
  }

  console.log('');
}
