// lib/providers.js — scan available LLM/compute resources
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

function tryExec(cmd, timeout = 5000) {
  try { return execSync(cmd, { timeout, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim(); } catch { return null; }
}
function fileExists(p) { try { return fs.existsSync(p); } catch { return false; } }
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

export function scanProviders() {
  const providers = [];

  // 1. Hermes config (opencode-go / muse-spark)
  const hermesCfg = path.join(os.homedir(), '.hermes', 'config.yaml');
  if (fileExists(hermesCfg)) {
    const raw = fs.readFileSync(hermesCfg, 'utf8');
    const model = raw.match(/default:\s*(.+)/)?.[1]?.trim() || 'unknown';
    const provider = raw.match(/provider:\s*(.+)/)?.[1]?.trim() || 'unknown';
    const ctx = raw.match(/context_length:\s*(\d+)/)?.[1] || '?';
    const turns = raw.match(/max_turns:\s*(\d+)/)?.[1] || '?';
    providers.push({
      id: 'hermes',
      name: `Hermes (${provider}/${model})`,
      model, provider,
      context: parseInt(ctx) || 0,
      maxTurns: parseInt(turns) || 0,
      status: 'available',
      role: 'primary — implementacion directa',
      cost: 'low (opencode-go zen)',
    });
  }

  // 2. agy CLI (Gemini)
  const agyBin = tryExec('which agy');
  if (agyBin) {
    const ver = tryExec('agy --version');
    // agy stores auth in ~/.config/agy or via env; probe quota by checking help
    providers.push({
      id: 'agy',
      name: `agy CLI ${ver || ''}`.trim(),
      bin: agyBin,
      status: 'available',
      role: 'research / web / delegacion xhigh',
      cost: 'check agy quota manually (no API yet)',
      note: 'Usa --model para elegir; tokens via opencode ai zen tambien',
    });
  } else {
    providers.push({ id: 'agy', name: 'agy CLI', status: 'not-found', role: 'research' });
  }

  // 3. opencode auth
  const authPath = path.join(os.homedir(), '.local/share/opencode/auth.json');
  if (fileExists(authPath)) {
    const auth = readJson(authPath) || {};
    for (const [k, v] of Object.entries(auth)) {
      providers.push({
        id: `opencode-${k}`,
        name: `opencode auth: ${k}`,
        status: 'configured',
        keyLen: v.key?.length || 0,
        role: k === 'opencode-go' ? 'primary LLM' : 'fallback',
      });
    }
  }

  // 4. OpenRouter
  const orKey = process.env.OPENROUTER_API_KEY || tryExec('grep OPENROUTER_API_KEY ~/.hermes/config.yaml 2>/dev/null');
  if (orKey) providers.push({ id: 'openrouter', name: 'OpenRouter', status: 'configured', role: 'fallback LLM' });

  // 5. GitHub CLI
  const ghRate = tryExec('gh api rate_limit 2>/dev/null');
  if (ghRate) {
    try {
      const j = JSON.parse(ghRate);
      providers.push({ id: 'github', name: 'GitHub API', status: 'available', remaining: j.rate?.remaining ?? j.resources?.core?.remaining, limit: j.rate?.limit ?? 5000, role: 'issues/PRs/releases' });
    } catch { providers.push({ id: 'github', name: 'GitHub API', status: 'available' }); }
  }

  // 6. Local toolchain
  const tools = ['cargo', 'pnpm', 'node', 'gh', 'rg', 'uv'];
  for (const t of tools) {
    const p = tryExec(`which ${t}`);
    const v = p ? tryExec(`${t} --version 2>&1 | head -n1`) : null;
    providers.push({ id: `tool-${t}`, name: t, bin: p || 'not-found', version: v || '', status: p ? 'available' : 'missing', role: 'toolchain' });
  }

  // 7. Xavier health (local memory)
  const xavierHealth = tryExec('curl -s http://localhost:8006/health 2>/dev/null');
  if (xavierHealth) {
    try {
      const h = JSON.parse(xavierHealth);
      providers.push({ id: 'xavier', name: 'Xavier :8006', status: h.status || 'unknown', embedding: h.embedding?.status, vector_db: h.vector_db?.status, role: 'memory/context' });
    } catch { providers.push({ id: 'xavier', name: 'Xavier :8006', status: 'reachable' }); }
  } else {
    providers.push({ id: 'xavier', name: 'Xavier :8006', status: 'unreachable', role: 'memory/context' });
  }

  // 8. System resources
  const mem = tryExec('free -h 2>/dev/null | head -n2');
  const disk = tryExec('df -h ~ 2>/dev/null | tail -n1');
  providers.push({ id: 'system', name: 'System', mem, disk, status: 'info' });

  return providers;
}

export function estimateWave({ issues = 10, avgFilesPerIssue = 3, provider }) {
  // Heuristic based on SWAL wave history (WAVE-4: 10 deltas, ~2000 tests, 52 features)
  const tokensPerIssue = {
    research: 8_000,
    implementation: 25_000,
    review: 5_000,
    total: 38_000,
  };
  const totalTokens = issues * tokensPerIssue.total;
  const contextWindow = provider?.context || 1_000_000;
  const turnsPerIssue = 8; // avg tool calls per issue
  const totalTurns = issues * turnsPerIssue + 10; // overhead

  return {
    issues,
    tokensPerIssue,
    totalTokens,
    totalTokensHuman: `${(totalTokens/1000).toFixed(0)}k tokens`,
    contextWindow,
    turnsNeeded: totalTurns,
    turnsAvailable: provider?.maxTurns || 500,
    fitsInOneSession: totalTurns <= (provider?.maxTurns || 500),
    // Cost: opencode-go zen is cheap; estimate $0.01 per 1k tokens for budgeting
    estimatedCostUsd: (totalTokens / 1000) * 0.005, // heuristic
    recommendation: totalTurns <= 500 ? 'single session ok' : 'split in 2 sessions or delegate subagents',
  };
}

export function routeIntelligently({ providers, wave }) {
  const hermes = providers.find(p => p.id === 'hermes');
  const gh = providers.find(p => p.id === 'github');
  const xavier = providers.find(p => p.id === 'xavier');

  const routes = [];
  // Primary implementation always via Hermes/muse-spark (opencode-go) — cheapest + 1M ctx
  routes.push({ task: 'Implementacion directa (codigo, tests)', provider: 'hermes/muse-spark-1.2', reason: '1M ctx, 500 turns, coste bajo, tool-use enforced' });
  // Research delegable to agy if available
  const hasAgy = providers.some(p => p.id === 'agy' && p.status === 'available');
  if (hasAgy && wave.issues >= 5) {
    routes.push({ task: 'Research previo (web, codebase)', provider: 'agy (Gemini) o hermes research mode', reason: 'paralelizable, no bloquea implementacion' });
  }
  // GitHub ops
  routes.push({ task: 'Issues/PRs/releases', provider: 'gh CLI', remaining: gh?.remaining, reason: `rate ${gh?.remaining ?? '?'}/${gh?.limit ?? 5000}` });
  // Memory
  routes.push({ task: 'Contexto/historial', provider: 'xavier :8006', status: xavier?.status, reason: 'memoria persistente, deduplicacion' });

  return routes;
}
