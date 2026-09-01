// src/commands/preflight.js — protocolo de preparacion para cualquier app SWAL
import fs from 'node:fs';
import path from 'node:path';
import { scanProviders, estimateWave, routeIntelligently } from '../../lib/providers.js';
import { discoverVersions, checkSync } from '../../lib/version.js';

export async function preflightCommand(opts) {
  const cwd = opts.cwd ? path.resolve(opts.cwd) : process.cwd();
  const wave = parseInt(opts.wave) || 10;
  const appId = opts.app || path.basename(cwd);
  const json = opts.json;

  const out = { appId, cwd, wave, ts: new Date().toISOString(), checks: {}, providers: [], estimate: null, routes: [], verdict: '' };

  // 1. App detection
  const manifests = discoverVersions(cwd);
  const sync = checkSync(manifests);
  const hasGitcore = fs.existsSync(path.join(cwd, '.gitcore/features.json'));
  const hasSRS = fs.existsSync(path.join(cwd, 'docs/SRS/REQUIREMENTS.md'));
  const hasChangelog = fs.existsSync(path.join(cwd, 'CHANGELOG.md'));
  const hasAgentsMd = fs.existsSync(path.join(cwd, 'AGENTS.md'));

  out.checks = {
    manifests: manifests.map(m => `${m.file}:${m.version}`),
    versionsSync: sync.ok ? 'ok' : `MISMATCH ${sync.uniq?.join(' vs ')}`,
    gitcore: hasGitcore ? 'present' : 'missing',
    srs: hasSRS ? 'present' : 'missing',
    changelog: hasChangelog ? 'present' : 'missing',
    agentsMd: hasAgentsMd ? 'present' : 'missing',
  };

  // Git stats
  const { execSync } = await import('node:child_process');
  function sh(cmd) { try { return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim(); } catch { return null; } }
  const branch = sh('git rev-parse --abbrev-ref HEAD');
  const lastTag = sh('git describe --tags --abbrev=0 2>/dev/null');
  const commitsSinceTag = lastTag ? sh(`git log ${lastTag}..HEAD --oneline | wc -l`) : null;
  const dirty = sh('git status --porcelain');
  const openPRs = sh('gh pr list --limit 5 --json number,title 2>/dev/null');
  out.checks.git = { branch, lastTag, commitsSinceTag, dirty: dirty ? `${dirty.split('\n').length} files` : 'clean', openPRs: openPRs ? JSON.parse(openPRs).length : '?' };

  // 2. Provider scan
  const providers = scanProviders();
  out.providers = providers;

  // 3. Estimate
  const hermes = providers.find(p => p.id === 'hermes');
  const estimate = estimateWave({ issues: wave, provider: hermes });
  out.estimate = estimate;

  // 4. Routing
  const routes = routeIntelligently({ providers, wave: { issues: wave } });
  out.routes = routes;

  // 5. Verdict
  const blockers = [];
  if (!sync.ok) blockers.push(`versions desalineadas: ${sync.uniq?.join(' vs ')} → corre swal-preflight bump`);
  if (dirty) blockers.push('working tree dirty → commit/stash');
  if (!hasChangelog) blockers.push('CHANGELOG.md faltante');
  // GH rate
  const gh = providers.find(p => p.id === 'github');
  if (gh && gh.remaining !== undefined && gh.remaining < 100) blockers.push(`GH rate bajo: ${gh.remaining}/${gh.limit}`);

  out.verdict = blockers.length === 0 ? '✅ READY para ola' : `⛔ BLOQUEADO: ${blockers.join('; ')}`;
  out.blockers = blockers;

  if (json) {
    console.log(JSON.stringify(out, null, 2));
    return out;
  }

  // Pretty print
  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  SWAL PREFLIGHT — ${appId} — ola ${wave} issues                    ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝`);
  console.log(`\n📁 ${cwd}`);
  console.log(`   branch: ${branch}  lastTag: ${lastTag || '(none)'}  commits since tag: ${commitsSinceTag || '?'}`);
  console.log(`   manifests: ${manifests.map(m => `${m.file}=${m.version}`).join(' | ') || '(none)'}`);
  console.log(`   versions sync: ${out.checks.versionsSync}  gitcore: ${out.checks.gitcore}  changelog: ${out.checks.changelog}`);
  console.log(`   tree: ${dirty ? '⚠ dirty (' + dirty.split('\n').length + ' files)' : '✅ clean'}`);

  console.log(`\n🧠 Providers / Recursos disponibles:`);
  for (const p of providers) {
    if (p.role === 'toolchain') continue; // too noisy in default view
    const extra = p.remaining !== undefined ? ` (${p.remaining}/${p.limit})` : p.model ? ` ${p.model}` : p.version ? ` ${p.version}` : '';
    console.log(`   • ${p.name}${extra} — ${p.status}${p.role ? ` — ${p.role}` : ''}${p.cost ? ` — ${p.cost}` : ''}`);
  }
  console.log(`   toolchain: ${providers.filter(p=>p.role==='toolchain'&&p.status==='available').map(p=>p.name).join(', ')}`);

  console.log(`\n📊 Estimacion ola ${wave} issues:`);
  console.log(`   tokens: ${estimate.totalTokensHuman} (research ${estimate.tokensPerIssue.research} + impl ${estimate.tokensPerIssue.implementation} + review ${estimate.tokensPerIssue.review} por issue)`);
  console.log(`   turns: ${estimate.turnsNeeded} necesarios / ${estimate.turnsAvailable} disponibles (${estimate.fitsInOneSession ? '✅ cabe en 1 sesion' : '⚠ requiere split/delegacion'})`);
  console.log(`   coste estimado: $${estimate.estimatedCostUsd.toFixed(2)} (heuristico opencode-go zen)`);
  console.log(`   recomendacion: ${estimate.recommendation}`);

  console.log(`\n🧭 Enrutamiento inteligente:`);
  for (const r of routes) console.log(`   • ${r.task} → ${r.provider} — ${r.reason}`);

  console.log(`\n${out.verdict}`);
  if (blockers.length) blockers.forEach(b => console.log(`   - ${b}`));

  console.log(`\nSiguiente paso:`);
  if (blockers.length === 0) console.log(`   swal-preflight check && gh issue list --limit 10  →  crear ola de ${wave} issues con template canonico`);
  else console.log(`   Corrige bloqueos y re-ejecuta: swal-preflight preflight --wave ${wave}`);
  console.log('');
  return out;
}
