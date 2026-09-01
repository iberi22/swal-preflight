# @swal/preflight

**SWAL preflight — version sync, release flow, and intelligent wave preflight**

CLI generica reusable por cualquier app SWAL (y por otros desarrolladores): valida versionado semver, estima costes de olas de trabajo, escanea recursos LLM disponibles y enruta inteligentemente tareas.

## Instalacion

```bash
npm i -g @swal/preflight
# o local
npm i -D @swal/preflight
npx swal-preflight check
```

Desarrollo local (este repo):

```bash
cd ~/proyectosSWAL/periferia/swal-preflight
npm install
node ./bin/swal-preflight.js check --cwd ~/proyectosSWAL/apps/xavier
```

## Comandos

| Comando | Que hace |
|---------|----------|
| `check [--cwd <path>]` | Valida manifests alineados, CHANGELOG, git, GitCore |
| `bump [--to <version>] [--dry-run]` | Sugiere o ejecuta bump semver en todos los manifests |
| `release --tag v0.1.0 [--push] [--dry-run]` | Crea tag anotado + opcional push + `gh release` |
| `preflight [--wave 10] [--app <id>] [--json]` | **Protocolo de preparacion**: escanea providers, estima coste, enruta |

## Protocolo preflight (para cualquier app)

Antes de iniciar una ola de N issues en cualquier app SWAL:

```bash
swal-preflight preflight --wave 10 --cwd ~/proyectosSWAL/apps/xavier
swal-preflight preflight --wave 10 --json > preflight.json  # para CI
```

Salida incluye:
- **Checks**: manifests sync, CHANGELOG, git status, GitCore/SRS
- **Providers**: Hermes/muse-spark (1M ctx), agy/Gemini, GH rate, Xavier, toolchain
- **Estimacion**: tokens por issue, turns necesarios vs disponibles, coste USD heuristico
- **Enrutamiento**: que tarea va a que provider y por que
- **Veredicto**: READY o BLOQUEADO con lista de bloqueos accionables

## Sistema de versiones SWAL

Ver canonico: `~/proyectosSWAL/docs/SWAL/VERSIONING.md`

- SemVer 2.0.0 estricto, 0.y.z hasta gate 1.0.0
- Conventional Commits → bump automatico
- Single source: `Cargo.toml` + `package.json` + `tauri.conf.json` deben coincidir
- CHANGELOG Keep a Changelog + `Unreleased`

## Uso como skill Hermes

Instalable como skill: `~/.hermes/skills/swal-preflight` (ver `SKILL.md` en ese path).
Hermes lo invoca automaticamente al preparar olas.

## Licencia

MIT — SWAL Systems
