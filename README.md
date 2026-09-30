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
| `review [--cwd <path>] [--base origin/main] [--issue-files <list>] [--max-lines 400] [--json]` | **Review preflight**: deterministic zero-LLM checks before AI review panel |

## Review preflight (`review`)

A deterministic, zero-LLM preflight that must pass before an AI review panel runs, preventing token waste on mechanically detectable defects:

```bash
swal-preflight review --cwd ~/proyectosSWAL/apps/xavier --base origin/main
swal-preflight review --cwd ~/proyectosSWAL/apps/xavier --json
```

### Checks
1. **policy-terms**: Scans changed files (and `always` files) against forbidden models/terms and paired-consistency rules (`review-rules.json` + `templates/review-rules.default.json`).
2. **ledger-tests**: Verifies every declared test in `.gitcore/features.json` actually exists in code/tests (avoiding cargo test 0-match false positives).
3. **env-parity**: Verifies all `.env.example` keys are read in code (warning if unused), and all env reads in changed Rust files are documented in `.env.example` (blocking if undocumented).
4. **citations**: Validates `path/to/file.ext:N` or `:N-M` references in changed Markdown point to real line ranges within existing files.
5. **scope**: Validates changed files belong to `--issue-files` (if given) and total lines changed (`git diff --numstat`) do not exceed `--max-lines` (default 400).
6. **leaks**: Detects personal absolute paths (`/home/...`, `/Users/...`), `file:///` URLs, and secret-shaped strings in added lines (never printing values).
7. **numeric-consistency** (warning): Detects inconsistent `<metric> <number> min` values across changed Markdown files.

Exit codes: `0 = pass` (no findings), `1 = findings`.

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
