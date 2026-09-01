// src/commands/release.js
import { execSync } from 'node:child_process';

function sh(cmd, cwd) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: 'inherit' });
}
function shOut(cmd, cwd) {
  try { return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim(); } catch { return null; }
}

export async function releaseCommand(opts) {
  const cwd = opts.cwd || process.cwd();
  const tag = opts.tag; // e.g. v0.1.0
  if (!tag) { console.error('Usage: swal-preflight release --tag v0.1.0 [--push]'); process.exit(1); }
  const push = opts.push;
  const dryRun = opts.dryRun;

  // Validate tag format
  if (!/^v\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/.test(tag)) {
    console.error(`Invalid tag format: ${tag} (expected vX.Y.Z)`);
    process.exit(1);
  }

  // Check clean tree
  const dirty = shOut('git status --porcelain', cwd);
  if (dirty) { console.error('Working tree dirty — commit or stash first:\n' + dirty); process.exit(1); }

  // Check tag not exists
  const existing = shOut(`git tag --list ${tag}`, cwd);
  if (existing) { console.error(`Tag ${tag} already exists locally`); process.exit(1); }

  const version = tag.replace(/^v/, '');
  const msg = `${tag} — ${opts.message || `release ${version}`}`;

  if (dryRun) {
    console.log(`(dry-run) would create annotated tag: git tag -a ${tag} -m "${msg}"`);
    if (push) console.log(`(dry-run) would push: git push origin ${tag} && gh release create ${tag} --generate-notes`);
    return;
  }

  sh(`git tag -a ${tag} -m "${msg.replace(/"/g, '\\"')}"`, cwd);
  console.log(`✓ Tag ${tag} created`);

  if (push) {
    sh(`git push origin ${tag}`, cwd);
    console.log(`✓ Pushed ${tag} to origin`);
    try { sh(`gh release create ${tag} --generate-notes --target main`, cwd); console.log(`✓ GH release ${tag} created`); }
    catch { console.warn('⚠ gh release create failed — create manually'); }
  } else {
    console.log(`Next: git push origin ${tag} && gh release create ${tag} --generate-notes`);
  }
}
