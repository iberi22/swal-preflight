// src/index.js — router
import { checkCommand } from './commands/check.js';
import { bumpCommand } from './commands/bump.js';
import { releaseCommand } from './commands/release.js';
import { preflightCommand } from './commands/preflight.js';
import { reviewCommand } from './commands/review.js';

function parseArgs(args) {
  const cmd = args[0];
  const opts = { _: [] };
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const k = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const next = args[i + 1];
      if (next && !next.startsWith('-')) { opts[k] = next; i++; }
      else opts[k] = true;
    } else if (a.startsWith('-')) {
      const k = a.slice(1);
      opts[k] = true;
    } else opts._.push(a);
  }
  // alias --cwd, --app, --wave, --to, --tag
  if (opts.cwd && typeof opts.cwd !== 'string') opts.cwd = process.cwd();
  return { cmd, opts };
}

function help() {
  console.log(`
swal-preflight — SWAL versioning + wave preflight

Usage:
  swal-preflight check [--cwd <path>]
  swal-preflight bump [--to <version>] [--dry-run] [--cwd <path>]
  swal-preflight bump --dry-run            # sugiere bump por commits
  swal-preflight release --tag v0.1.0 [--push] [--dry-run] [--cwd <path>]
  swal-preflight preflight [--wave 10] [--app <id>] [--cwd <path>] [--json]
  swal-preflight review [--cwd <path>] [--base <ref>] [--issue-files <files>] [--max-lines <n>] [--json]

Comandos:
  check      Valida manifests alineados, CHANGELOG, git, GitCore
  bump       Actualiza version en todos los manifests + CHANGELOG + README badge
  release    Crea tag anotado y opcionalmente push + gh release
  preflight  Protocolo de preparacion: escanea recursos, estima coste, enruta
  review     Review preflight determinista (zero-LLM) antes de panel AI

Docs: ~/proyectosSWAL/docs/SWAL/VERSIONING.md
`);
}

export async function run(args) {
  const { cmd, opts } = parseArgs(args);
  if (!cmd || cmd === 'help' || cmd === '--help' || opts.help || opts.h) return help();
  if (cmd === 'check') return checkCommand(opts);
  if (cmd === 'bump') return bumpCommand(opts);
  if (cmd === 'release') return releaseCommand(opts);
  if (cmd === 'preflight') return preflightCommand(opts);
  if (cmd === 'review') {
    const findings = await reviewCommand(opts);
    if (findings && findings.length > 0) {
      process.exitCode = 1;
    }
    return findings;
  }
  console.error(`Comando desconocido: ${cmd}`);
  help();
  process.exit(1);
}
