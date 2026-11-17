# Estado del proyecto — Lanzador de anuncios con IA

Fase actual: **4 — Infra y secretos**.

## Checklist

- [x] 0 Bootstrap: git (`main` + `dev`), `CLAUDE.md`, `.gitignore`. CLIs: wrangler 4.163 logueado, gcloud logueado, gh logueado (`ilandaniele`), k6 2.3. El token de `cf` venció el 2026-11-14; el proyecto usará `wrangler`, así que no bloquea.
- [x] 1 Entrevista → `docs/00-brief.md`
- [x] 2 Documentos `docs/01..06`
- [x] 3 Arquitectura y esqueleto (tareas 1–3 del plan). Falta el deploy de prueba a `lanzador-preview`: necesita permiso del usuario.
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
- IA: copys y títulos, piloto inteligente, análisis de creativos, lanzar por chat. Proveedor: solo Workers AI (texto, chat y visión), sin API de Claude; Claude se puede sumar más adelante como un segundo `AiProvider`.
- Medios: sin R2 (la cuenta no tiene medio de pago); los archivos van del navegador al Worker y a Meta, o de Drive al Workflow y a Meta, sin guardarse.
- Email: dominio pospuesto. Resend sin dominio verificado entrega solo al dueño de la cuenta, así que por ahora solo el superadmin puede iniciar sesión.

## Hecho

- Inventario de la app vieja → `docs/legacy/inventario-app-vieja.md`.
- Esqueleto: React 19 + Vite, Worker Hono con `GET /api/health`, ESLint 9 + Prettier, Vitest (`@cloudflare/vitest-plugin` + jsdom), Playwright, CI de GitHub Actions. TypeScript fijado en 6.0 porque typescript-eslint todavía no soporta la 7.

## Pendiente

- Proveedor de email para magic links (Resend, plan gratis; requiere cuenta del usuario). Dominio verificado pendiente (~US$10/año): sin él no se pueden invitar clientes beta reales.
