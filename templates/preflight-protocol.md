# Protocolo Preflight — Detalle

## Flujo canonico antes de cualquier ola

```
1. swal-preflight preflight --wave N --cwd <app>   # escaneo completo
   ↓
   ├─ BLOQUEADO → corrige cada bloqueo listado:
   │   • versions desalineadas → swal-preflight bump --to <v>
   │   • dirty working tree → git add/commit/stash
   │   • CHANGELOG sin [Unreleased] → agrega seccion
   │   • GH rate bajo → espera reset (gh api rate_limit)
   │   └─ re-ejecuta preflight hasta ✅ READY
   │
   └─ READY → continua:
       2. swal-preflight check --cwd <app>          # detalle fino
       3. gh issue list --limit 20 --json number,title,state
       4. Crear N issues con template canonico (11 secciones Rust / 9 FE)
       5. Delegar segun routing sugerido
```

## Estimacion de coste (heuristico)

Basado en historico SWAL (WAVE-4: 10 issues, 2009 tests, 52 features):

- Research: 8k tokens/issue (web search, codebase scan)
- Implementacion: 25k tokens/issue (codigo + tests + clippy)
- Review: 5k tokens/issue (CI, fixes)
- **Total: ~38k tokens/issue** → 10 issues = 380k tokens

Coste opencode-go zen: ~$0.005 / 1k tokens → 10 issues ≈ $1.90

Turns: ~8 tool calls/issue + 10 overhead = 90 turns para 10 issues (limite 500 → cabe en 1 sesion).

Si wave > 40 issues → split en 2 sesiones o delegar subagentes paralelos.

## Routing inteligente

| Tarea | Provider preferido | Razon | Fallback |
|-------|-------------------|-------|----------|
| Codigo + tests | hermes/muse-spark-1.2 (opencode-go) | 1M ctx, 500 turns, barato, tool-use enforced | openrouter |
| Research web | agy (Gemini) | paralelizable, no bloquea | hermes research mode |
| Codebase deep scan | hermes (rg, xavier codegraph) | local, rapido | agy |
| Issues/PRs | gh CLI | rate 5000/h | — |
| Memoria/contexto | Xavier :8006 | persistente, dedup | — |
| UI (screenshots) | cli-image-analysis (hermes) | vision | — |

## Rate limits a vigilar

- **GH API**: `gh api rate_limit` → remaining/limit (5000/h). Si <100, espera reset.
- **agy**: no expone quota via CLI aun → verificar manualmente en dashboard si ola >20 issues.
- **opencode-go**: zen tier sin limite duro conocido → monitorear latencia.
- **Xavier embeddings**: `curl :8006/health | jq .embedding.status` → debe ser healthy.

## Checklist pre-wave (copy-paste)

```bash
swal-preflight preflight --wave 10 --cwd ~/proyectosSWAL/apps/xavier
# si READY:
swal-preflight check --cwd ~/proyectosSWAL/apps/xavier
gh issue list --repo iberi22/xavier --limit 20 --json number,title,state,labels
gh pr list --repo iberi22/xavier --limit 10
curl -s http://localhost:8006/health | jq .status
```
