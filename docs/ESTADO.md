# Estado del proyecto — Lanzador de anuncios con IA

Fase actual: **1 — Entrevista** (falta el texto del punto 3 del doc de origen).

## Checklist

- [x] 0 Bootstrap: git (`main` + `dev`), `CLAUDE.md`, `.gitignore`. CLIs: wrangler 4.163 logueado, gcloud logueado, gh logueado (`ilandaniele`), k6 2.3. El token de `cf` venció el 2026-11-14; el proyecto usará `wrangler`, así que no bloquea.
- [ ] 1 Entrevista → `docs/00-brief.md`
- [ ] 2 Documentos `docs/01..06`
- [ ] 3 Arquitectura y esqueleto
- [ ] 4 Infra y secretos
- [ ] 5 Desarrollo
- [ ] 6 Seguridad
- [ ] 7 Tests y performance
- [ ] 8 Deploy y entrega

## Decisiones de la entrevista (2026-11-16)

- Producto: SaaS multi-cliente (no solo uso propio).
- Login: email con magic link; luego cada cliente conecta Meta con Facebook Login for Business.
- Cobro: no en el MVP; modelo de planes preparado para fase 2.
- Dominio: `*.workers.dev` por ahora.
- App de Meta: crear una nueva (el usuario hace login y aprueba; se guía paso a paso).
- IA: copys y títulos, piloto inteligente, análisis de creativos, lanzar por chat. Proveedor: Workers AI para tareas baratas, Claude API para copy y piloto.

## Pendiente

- Texto del punto 3 del doc "lanzador de anuncios con IA" (no accesible desde esta sesión).
- Inventario de la app vieja → `docs/legacy/inventario-app-vieja.md` (en curso). Después se borran `app.py`, `subir.py`, `static/`, `LEEME*.md/txt`, `iniciar.command`, `.env.ejemplo`.
- Proveedor de email para magic links (propuesta: Resend, plan gratis; requiere cuenta del usuario).
