# Estado del proyecto — Lanzador de anuncios con IA

Fase actual: **5 — Desarrollo** (siguiente: tarea 15 del plan, workspaces y ajustes).

## Checklist

- [x] 0 Bootstrap: git (`main` + `dev`), `CLAUDE.md`, `.gitignore`. CLIs: wrangler 4.163 logueado, gcloud logueado, gh logueado (`ilandaniele`), k6 2.3. El token de `cf` venció el 2026-11-14; el proyecto usará `wrangler`, así que no bloquea.
- [x] 1 Entrevista → `docs/00-brief.md`
- [x] 2 Documentos `docs/01..06`
- [x] 3 Arquitectura y esqueleto (tareas 1–3 del plan). Preview desplegado: https://lanzador-preview.ilandaniele.workers.dev (`/api/health` responde `{"ok":true}`; rutas de la SPA devuelven `index.html`).
- [x] 4 Infra y secretos: D1 `lanzador-db-preview` y `lanzador-db` creadas y enlazadas como `DB`; secretos `TOKEN_ENC_KEY_V1` y `E2E_SECRET` cargados en `lanzador-preview`; `.dev.vars` local con valores propios; `APP_ORIGIN` del preview fijado. Las migraciones remotas se aplican cuando exista el schema (tarea 5).
- [ ] 5 Desarrollo — hechas tareas 4–14: constantes y helpers compartidos, schema D1 con migraciones 0001–0005 (aplicadas en `lanzador-db-preview` remota), cifrado de tokens AES-GCM, cliente de Resend con plantillas de email y pipeline HTTP (request id, cabeceras de seguridad, CSRF, rate limits `RL_*`, manejador de errores con `error_events` y logs sin secretos; revisado en seguridad, hallazgos corregidos) y sesiones (cookie `__Host-lanzador_sid`, rotación cada 24 h, tope de 30 días y 7 de inactividad) y magic link (`/api/auth/magic-link`, `verify`, `logout`, `logout-all`, `/api/me`, `/api/test/magic-link` solo fuera de producción) y tenancy (middleware `workspace` con 404 sin fuga de existencia y 403 `WORKSPACE_DISABLED`, `requireRole`, `requireSuperadmin` con 404, `inWorkspace`, repositorio de auditoría, builders y `tests/helpers/factory.ts`) y arneses de seguridad (`roles.matrix.ts`, `tenancy.params.ts`, `tenancy-coverage` con `PENDING_TABLES`, `seedTenantPair`; cada ruta `/api/w/:wid/*` nueva suma su fila). Revisión de seguridad de tareas 12–13 aplicada: `POST /api/auth/magic-link` responde siempre 202 (envío en segundo plano, topes silenciosos 5 por email+IP y 15 por email), límite de body 16 KB, links de usuarios deshabilitados bloqueados. 365 tests en verde.
- Riesgos aceptados en sesiones: no se revoca la sesión al reusar un token viejo, e `ip_hash` es SHA-256 de IP + fecha sin pepper (reversible con un volcado de la base). Se revisan en la Fase 6.
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

- Producción: cargar `TOKEN_ENC_KEY_V1` en `lanzador` (valor distinto al de preview) y aplicar migraciones a `lanzador-db` en la Fase 8 (en preview ya están aplicadas). `E2E_SECRET` nunca va a producción.
- Bindings `AI`, Workflows y rate limits: se agregan en la tarea del plan que los usa.
- Datos del usuario: `RESEND_API_KEY` (se carga con `npx wrangler secret put RESEND_API_KEY --env preview` en su terminal), email de superadmin, `META_APP_ID`, `META_LOGIN_CONFIG_ID` y `META_APP_SECRET` según `docs/guia-app-meta.md`.
- Tareas 17/18: quien escriba en `beta_invites` e `invitations` debe normalizar el email (minúsculas, sin espacios).
- Tarea 107 exige `PENDING_TABLES = []`, pero `error_events`, `oauth_states` y `audit_log` quizás nunca usen `inWorkspace`: decidir si se agrega una lista de exentas.
- Cuenta Cloudflare: 9 de 10 bases D1 del plan gratis en uso.

- Proveedor de email para magic links (Resend, plan gratis; requiere cuenta del usuario). Dominio verificado pendiente (~US$10/año): sin él no se pueden invitar clientes beta reales.
