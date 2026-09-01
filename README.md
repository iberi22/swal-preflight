# @swal/preflight

**SWAL preflight — version sync, release flow, and intelligent wave preflight**

Reusable CLI for any SWAL app (and beyond): validates SemVer alignment, estimates wave cost, scans available LLM providers and routes tasks intelligently. **No npm publish required — use directly from the repo while iterating.**

## Usage from repo (recommended)

```bash
git clone https://github.com/iberi22/swal-preflight periferia/swal-preflight
cd periferia/swal-preflight
npm install

# run from repo
node ./bin/swal-preflight.js check --cwd ~/proyectosSWAL/apps/xavier
node ./bin/swal-preflight.js preflight --wave 10 --cwd ~/proyectosSWAL/apps/xavier
node ./bin/swal-preflight.js preflight --wave 10 --json > preflight.json  # for CI

# optional local alias (add to your shell rc)
alias swal-preflight="node $HOME/proyectosSWAL/periferia/swal-preflight/bin/swal-preflight.js"
swal-preflight check --cwd ~/proyectosSWAL/apps/xavier
```

> The package is intentionally **not published to npm** yet. Install from the repo and keep improving it in place. When it stabilizes, publishing is just `npm publish --access public` (requires `NPM_TOKEN`).

## Commands

| Command | What it does |
|---------|--------------|
| `check [--cwd <path>]` | Validates manifests are aligned, CHANGELOG, git, GitCore |
| `bump [--to <version>] [--dry-run]` | Suggests or executes SemVer bump across all manifests |
| `release --tag v0.1.0 [--push] [--dry-run]` | Creates annotated tag + optional push + `gh release` |
| `preflight [--wave 10] [--app <id>] [--json]` | **Preparation protocol**: scans providers, estimates cost, routes |

## Preflight protocol (for any app)

Before starting a wave of N issues in any SWAL app:

```bash
swal-preflight preflight --wave 10 --cwd ~/proyectosSWAL/apps/xavier
swal-preflight preflight --wave 10 --json > preflight.json  # for CI gate
```

Output includes:
- **Checks**: manifests sync, CHANGELOG, git status, GitCore/SRS
- **Providers**: Hermes/muse-spark (1M ctx), agy/Gemini, GH rate, Xavier, toolchain
- **Estimation**: tokens per issue, turns needed vs available, heuristic USD cost
- **Routing**: which task goes to which provider and why
- **Verdict**: READY or BLOCKED with actionable blockers

## SWAL versioning system

Canonical spec: `~/proyectosSWAL/docs/SWAL/VERSIONING.md`

- Strict SemVer 2.0.0, 0.y.z until 1.0.0 gate
- Conventional Commits → automatic bump
- Single source: `Cargo.toml` + `package.json` + `tauri.conf.json` must match
- CHANGELOG: Keep a Changelog + `Unreleased`

## Use as Hermes skill

Installable as skill: `~/.hermes/skills/swal-preflight` (see `SKILL.md` there).
Hermes invokes it automatically when preparing waves.

## Future npm install (when published)

```bash
# not yet published — for reference only
npm i -g @swal/preflight
npm i -D @swal/preflight
npx swal-preflight check
```

## License

MIT — SWAL Systems
