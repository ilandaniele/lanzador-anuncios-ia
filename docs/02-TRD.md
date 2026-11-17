# TRD — Lanzador de anuncios con IA

Fecha: 2026-11-16. Fuentes: `00-brief.md`, `01-PRD.md`, `legacy/inventario-app-vieja.md` (en adelante "inventario"). El schema de datos está en `05-backend-schema.md`.

## 1. Stack elegido

| Capa | Elección | Por qué |
|---|---|---|
| Hosting | Cloudflare Workers plan Free, `lanzador.<subdominio>.workers.dev` | Decisión del brief. Cero costo fijo, escala beta (≤ 20 workspaces, 10 concurrentes) entra en el free tier. Sin dominio propio. |
| Front | React + Vite (SPA), servida como Workers static assets con `assets.run_worker_first: ["/api/*"]` y `not_found_handling: "single-page-application"` | Los assets no ejecutan el Worker: no gastan requests de la cuota diaria compartida. No hace falta SSR (todo detrás de login). |
| API | Hono en el mismo Worker, solo bajo `/api/*` | Router liviano, middlewares listos (`secure-headers`, `cors`), tipado end-to-end. Un Worker por app (regla de cuotas). |
| DB | D1 (SQLite) + Drizzle ORM + drizzle-kit | Relacional, transacciones por `batch`, gratis. Drizzle genera SQL tipado y migraciones versionadas. |
| Archivos | Sin almacenamiento propio: R2 descartado (sin medio de pago); los medios van directo a Meta | Navegador → Worker → Meta (subida resumable por bloques) y Drive → Workflow → Meta. La app solo guarda ids y hashes de Meta, no el archivo. |
| Trabajos largos | Cloudflare Workflows (3 clases) | Pasos durables con reintento, `step.sleep` sin consumir CPU mientras Meta procesa video (hasta ~15 min), estado persistido. Reemplaza los jobs en memoria de la app vieja. |
| Programación | 1 Cron Trigger `0 * * * *` | Piloto cada 6 h, precalentado de insights y limpieza. Una sola expresión porque las cron del plan Free se comparten en la cuenta. |
| Rate limit | Workers Rate Limiting binding | Por IP y por usuario sin escribir en KV ni D1. |
| IA | Workers AI (binding `AI`): Llama 3.3 70B para texto, Llama 4 Scout para chat con function calling y visión | Copys en rioplatense, explicaciones del piloto, chat y etiquetado, todo dentro del cupo diario de neurons y sin claves de terceros. Claude se puede sumar más adelante como un segundo `AiProvider`. |
| Email | Resend (plan gratis) | Magic links e invitaciones. API HTTP simple. |
| Validación | Zod, schemas en `src/shared/` usados por front y back | Una sola definición por contrato. El servidor valida siempre. |
| Tests | Vitest + `@cloudflare/vitest-plugin` (unit e integración contra D1 local de workerd), Playwright E2E | Corre en el runtime real. E2E contra la URL desplegada (criterio del brief). |
| Lenguaje | TypeScript `strict` en todo | Tipos compartidos front/back. |

### Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Vercel + Neon/Supabase | El brief fija Cloudflare; Supabase daría RLS real, pero suma otro proveedor y otra cuota. D1 + helper de tenancy + tests alcanza para la escala beta. |
| Postgres vía Hyperdrive | No se necesitan joins pesados ni > 500 MB por base en beta. |
| Queues en lugar de Workflows | Queues no tiene `sleep` durable ni estado por paso; el lanzamiento necesita esperar el procesamiento de video y reintentar pasos sueltos. |
| Durable Objects para jobs | Más código propio (alarmas, estado). Workflows ya resuelve pasos y reintentos. |
| R2 (bucket propio, subida prefirmada o por el Worker) | R2 descartado: la cuenta de Cloudflare no tiene medio de pago. Los medios van navegador → Worker → Meta, sin guardar el archivo. El Worker reenvía bloques de 10 MiB en stream (I/O, no CPU) y respeta el límite de 100 MB por request. |
| SSE / WebSocket para el progreso | Una conexión abierta por pestaña y un loop de lecturas a D1 dentro del Worker. Polling acotado (≥ 3 s solo mientras corre un lanzamiento) es más simple y barato. |
| Better Auth / Lucia | Solo hace falta magic link + sesión opaca; una implementación propia de ~200 líneas sobre D1 es más chica que adaptar una librería, y queda testeada. |
| Scope `drive.readonly` de Google | Es restringido: para un SaaS exige evaluación de seguridad CASA paga. `drive.file` + Google Picker no la exige. |
| KV para sesiones o cache de insights | Tope de 1.000 escrituras/día. Sesiones e insights van a D1; caches cortas de lecturas de Meta van a la Cache API. |
| Token de usuario de larga duración (60 días) de Meta | Vence y obliga a reconectar. El token de usuario del sistema de la integración de negocio (FLfB) no vence. Queda como camino de respaldo. |

## 2. Arquitectura

```mermaid
flowchart LR
  subgraph Navegador
    SPA["SPA React (assets estáticos)"]
    PICK["Google Picker"]
  end
  subgraph Cloudflare["Cloudflare (plan Free)"]
    ASSETS["Static assets (no ejecutan el Worker)"]
    W["Worker Hono /api/*"]
    RL["Rate Limiting binding"]
    D1[("D1 lanzador-db")]
    WF["Workflows: LaunchWorkflow, LaunchItemWorkflow, JobWorkflow"]
    CRON["Cron 0 * * * *"]
    WAI["Workers AI (texto, chat, visión)"]
    CACHE["Cache API (lecturas cortas de Meta)"]
  end
  subgraph Terceros
    META["Meta Graph API v24.0"]
    GVID["graph-video.facebook.com (subida de medios)"]
    FLFB["Facebook Login for Business"]
    RESEND["Resend"]
    GOOG["Google OAuth + Drive API"]
  end
  SPA --> ASSETS
  SPA -->|"fetch /api/* + cookie"| W
  SPA -->|"PUT bloques de 10 MiB"| W
  SPA --> PICK
  SPA -->|"redirect"| FLFB
  FLFB -->|"GET /api/meta/oauth/callback"| W
  W --> RL
  W --> D1
  W --> CACHE
  W --> WF
  CRON --> W
  WF --> D1
  WF --> META
  WF --> WAI
  WF --> GOOG
  W --> META
  W -->|"stream del bloque"| GVID
  GOOG -->|"Drive: lectura por rangos"| WF
  WF -->|"stream a Meta por rangos"| GVID
  W --> WAI
  W --> RESEND
  W --> GOOG
```

### Capas del código

| Carpeta | Responsabilidad | Regla |
|---|---|---|
| `src/api/routes/` | Request/response, Zod, DTO de salida | Sin lógica ni acceso a DB. |
| `src/api/middleware/` | request id, headers, CSRF, rate limit, sesión, workspace+rol | Orden fijo, ver 4.1. |
| `src/api/services/` | Lógica de negocio (lanzador, piloto, métricas, IA) | No conoce HTTP. |
| `src/api/repositories/` | Único lugar que importa tablas de Drizzle; helper de tenancy | Una query (o un `db.batch`) por caso de uso. |
| `src/api/integrations/meta/` | `read.ts` (GET/batch de lectura) y `write.ts` (creaciones y cambios de estado) | `write.ts` solo acepta `status=PAUSED` en edges de creación y `ACTIVE`/`PAUSED` en updates; no existe DELETE. |
| `src/api/integrations/{ai,meta,google}/` y `resend` | Clientes HTTP con timeout y reintentos. `ai/` define la interfaz `AiProvider` (`provider.ts`) y la implementa Workers AI (`workers-ai.ts`); `meta/upload.ts` sube medios y `src/api/lib/multipart-stream.ts` arma el multipart en stream | `write.ts` conserva sus guardrails y no exporta funciones de subida. |
| `src/workflows/` | `LaunchWorkflow`, `LaunchItemWorkflow`, `JobWorkflow` | Llaman a services. |
| `src/shared/` | Schemas Zod, tipos, constantes (roles, CTA, límites de caracteres, tarifas de neurons por modelo en `ai-neuron-rates.ts`) | Importado por front y back. |
| `src/web/` | Páginas, componentes, hooks | Textos en `src/web/i18n/es-AR.ts`. |

Regla ESLint (`no-restricted-imports`): `src/api/services/chat/**` y `src/api/services/ai/**` no pueden importar `integrations/meta/write`. Así el chat y la IA no tienen camino de código hacia una escritura en Meta.

## 3. Herramientas

| Tema | Herramienta |
|---|---|
| Lenguaje | TypeScript 5 `strict`, ESM |
| Framework | Hono (API), React 19 + Vite + React Router (SPA), TanStack Query (fetch, cache, refetch al foco) |
| ORM / migraciones | Drizzle ORM + drizzle-kit (`db:generate`), `wrangler d1 migrations apply` (`db:migrate`) |
| Validación | Zod (schemas compartidos en `src/shared/schemas/`) |
| Tests | Vitest + `@cloudflare/vitest-plugin`; Playwright E2E contra el deploy; k6 solo local |
| Lint/format | ESLint (typescript-eslint, react-hooks, jsx-a11y) + Prettier + `tsc --noEmit` |
| CI | GitHub Actions: lint, typecheck, test, build en cada push y PR a `dev`/`main` |
| Deploy | `npx wrangler deploy` (Worker `lanzador`); preview como Worker `lanzador-preview` con su propia D1 (`lanzador-db-preview`) |

## 4. APIs internas

### 4.1 Convenciones comunes

| Tema | Regla |
|---|---|
| Base | Todo bajo `/api`. Rutas de workspace: `/api/w/:wid/...`. |
| Middleware (orden) | `requestId` → `secureHeaders` → `rateLimit(IP)` → `csrf` (mutaciones) → `session` → `rateLimit(usuario)` → `workspace` (membresía + estado del workspace; actualiza `last_activity_at` como mucho 1 vez por hora) → `requireRole(min)` → handler. |
| Sesión | Cookie `__Host-lanzador_sid` (`HttpOnly; Secure; SameSite=Lax; Path=/`). Sin sesión: 401. |
| CSRF | `POST/PUT/PATCH/DELETE` exigen `Origin` igual a `APP_ORIGIN` y header `X-Lanzador: 1`. Exentos: `/api/meta/deauthorize`, `/api/meta/data-deletion` (validan `signed_request`). |
| Workspace | Si el usuario no es miembro de `:wid` o un id pedido no pertenece a `:wid`: **404** (nunca 403, para no revelar existencia). Miembro con rol insuficiente: 403 `FORBIDDEN_ROLE`. Workspace desactivado por superadmin: 403 `WORKSPACE_DISABLED`. |
| Roles | Jerarquía `viewer < editor < admin < owner`. La columna "Rol" indica el mínimo. `superadmin` es global y solo accede a `/api/admin/*` (no ve contenido de workspaces de los que no es miembro). |
| Errores | `{"error":{"code":"...","message":"texto para mostrar","requestId":"...","fields":{...},"details":{...}}}` (`fields` y `details?: Record<string,unknown>` son opcionales). `UPLOAD_OFFSET_MISMATCH` lleva `details:{nextChunk}` y `AI_BUDGET_EXHAUSTED` lleva `details:{scope,resetsAt}`. Sin stack traces. |
| Errores comunes (no se repiten en la tabla) | 400 `VALIDATION`, 401 `UNAUTHENTICATED`, 403 `CSRF_FAILED`, 403 `FORBIDDEN_ROLE`, 404 `NOT_FOUND`, 429 `RATE_LIMITED` (con `Retry-After`), 500 `INTERNAL`. |
| Paginación | Cursor: `?cursor=<opaco>&limit=` (default 25, máximo 100). Respuesta `{data:[...], nextCursor:string|null}`. Sin totales (`COUNT(*)` prohibido por request). |
| DTOs | Explícitos por endpoint. Nunca salen: `token_*`, `*_ciphertext`, `*_hash`, `refresh_token`, ids de sesión. |
| Montos | Enteros en unidades menores (`*Minor`, centavos) + `currency`. |
| Fechas | ISO 8601 UTC en JSON; la UI muestra en la zona del workspace (default `America/Argentina/Buenos_Aires`). |

Rate limits (binding, período 60 s): `IP` 300/min por IP en todo `/api/*`; `USR` 120/min por usuario autenticado; `AUTH` 5/min por IP; `EXP` 10/min por usuario (IA, chequeo de landing, CSV, simulación); `UPL` 600/min por usuario (bloques de subida); `POLL` 30/min por usuario (progreso); `CLIENT_ERR` (binding `RL_CLIENT_ERR`) 20/min por IP solo en `/api/client-errors`. Los topes de ventanas largas (5 links por email en 15 min, 1 refresco de métricas por minuto por workspace, 1 corrida del piloto cada 5 min) se calculan contra D1 con índice.

### 4.2 Contratos compartidos clave (`src/shared/schemas/`)

| Schema | Forma |
|---|---|
| `LaunchDraft` | `{adAccountAssetId, pixelId, pageId, instagramUserId?, mode:"new_cbo"\|"existing_cbo", existingCampaignId?, productId, copy:{copyId?, primaryText, headline, description, cta}, items:[{source:"upload"\|"drive"\|"clone", creativeId?, cloneAdId?, cloneStoryId?, adName, copyId?}], dailyBudgetMinor?, bidStrategy:"LOWEST_COST_WITHOUT_CAP"\|"COST_CAP", bidAmountMinor?, countries:string[2-letter][], optimizationEvent:"PURCHASE", campaignName, adsetName, driveFolderHint?}` (1 a `plan.max_creatives_per_launch` items; no mezcla video e imagen en un mismo conjunto, igual que la app vieja). |
| `LaunchPlan` | `{campaign?, adset, ads:[{position, adName, mediaKind, link, pageId, instagramUserId}], warnings:[{code,text}], blockers:[{code,text}], planHash}` |
| `LaunchProgress` | `{status, phase, counts:{total,done,failed}, items:[{id, position, status, adName, metaAdId?, error?}], checks?:[{ok, code, text}], updatedAt, nextPollMs:number\|null}` |
| `Proposal` | `{id, action:"pause"\|"scale"\|"duplicate", object:{level, id, name, adAccountId}, evidence:{spendMinor, purchases, roas, cpaMinor, breakEvenRoas?, window}, currentBudgetMinor?, proposedBudgetMinor?, percent?, explanation:string\|null, status:"pending"\|"executing"\|"executed"\|"dismissed"\|"failed"\|"expired"}` |
| `MetricsRow` | `{id, name, level, status, adAccountId, currency, productId?, dailyBudgetMinor?, spendMinor, purchases, purchaseValueMinor, roas, cpaMinor, ctr, cpmMinor, protected, scaledHoursAgo?}` |

### 4.3 Tabla de endpoints

Leyenda de auth: `pub` público · `ses` sesión · `ses+ws` sesión + membresía · `sig` firma Meta (`signed_request`) · `state` state OAuth de un uso + sesión.

#### Auth, sesión y workspaces (F1)

| F | Método | Ruta | Auth | Rol | Request | Response | Errores | Rate limit | Pag. |
|---|---|---|---|---|---|---|---|---|---|
| F1 | POST | `/api/auth/magic-link` | pub | — | `{email}` | 202 `{ok:true}` siempre (no revela si existe) | 503 `EMAIL_SEND_FAILED` | AUTH + 5 por email / 15 min (D1) → 429 | no |
| F1 | POST | `/api/auth/verify` | pub | — | `{token}` (viene del fragmento `#t=` de `/ingresar/confirmar`) | 200 `{user, workspaces}` + `Set-Cookie` | 410 `LINK_EXPIRED` (usado o vencido) | AUTH | no |
| F1 | POST | `/api/auth/logout` | ses | — | — | 204 + cookie expirada | — | USR | no |
| F1 | POST | `/api/auth/logout-all` | ses | — | — | 204 + cookie expirada (borra todas las sesiones del usuario) | — | USR | no |
| F1 | GET | `/api/me` | ses | — | — | `{user:{id,email,name,isSuperadmin}, workspaces:[{id,name,role,status}]}` | — | USR | no |
| F1 | POST | `/api/workspaces` | ses | — | `{name}` | 201 `{workspace, role:"owner"}` | 403 `BETA_INVITE_REQUIRED`, 422 `WORKSPACE_LIMIT` (3 por usuario) | USR | no |
| F1 | GET | `/api/w/:wid` | ses+ws | viewer | — | `{workspace, role, plan:{limits}, settings, aiUsage:{neuronsToday, dailyCap, neuronsMonth, monthlyCap, globalExhausted, resetsAt}}` | — | USR | no |
| F1 | PATCH | `/api/w/:wid` | ses+ws | admin | `{name}` | `{workspace}` | — | USR | no |
| F1 | DELETE | `/api/w/:wid` | ses+ws | owner | `{confirmName}` | 202 `{purgeAfter}` (borrado lógico, purga de D1 a los 7 días) | 422 `CONFIRM_MISMATCH` | USR | no |
| F1 | GET | `/api/w/:wid/settings` | ses+ws | viewer | — | `{maxCampaignBudgetMinor, budgetCurrency, maxScalePercent, advantageCreativeEnabled, timezone, defaultCountries, nameTemplates, launchDefaults}` | — | USR | no |
| F1 | PATCH | `/api/w/:wid/settings` | ses+ws | admin | parcial del anterior | `{settings}` | 422 `SCALE_PERCENT_MAX_50` | USR | no |
| F1 | GET | `/api/w/:wid/members` | ses+ws | viewer | `?cursor&limit` | `{data:[{userId,email,name,role,joinedAt}]}` | — | USR | sí |
| F1 | PATCH | `/api/w/:wid/members/:userId` | ses+ws | admin | `{role:"admin"\|"editor"\|"viewer"}` | `{member}` | 422 `CANNOT_CHANGE_OWNER` | USR | no |
| F1 | DELETE | `/api/w/:wid/members/:userId` | ses+ws | admin (o uno mismo) | — | 204 | 422 `OWNER_CANNOT_LEAVE` | USR | no |
| F1 | POST | `/api/w/:wid/transfer-ownership` | ses+ws | owner | `{userId, confirm:true}` | `{workspace}` (el owner viejo pasa a admin) | 422 `NOT_A_MEMBER` | USR | no |
| F1 | GET | `/api/w/:wid/invitations` | ses+ws | admin | `?cursor&limit` | `{data:[{id,email,role,expiresAt,status}]}` | — | USR | sí |
| F1 | POST | `/api/w/:wid/invitations` | ses+ws | admin | `{email, role}` (no `owner`) | 201 `{invitation}` + email | 409 `ALREADY_MEMBER`, 409 `INVITATION_PENDING`, 422 `PLAN_MEMBER_LIMIT`, 503 `EMAIL_SEND_FAILED` | USR + EXP | no |
| F1 | DELETE | `/api/w/:wid/invitations/:id` | ses+ws | admin | — | 204 (revoca) | — | USR | no |
| F1 | POST | `/api/invitations/accept` | pub o ses | — | `{token}` (viene del fragmento `#t=` de `/invitacion`) | 200 `{workspaceId, role}` + `Set-Cookie` si no había sesión | 410 `INVITATION_EXPIRED`, 409 `EMAIL_MISMATCH` | AUTH | no |
| F1 | POST | `/api/test/magic-link` | header `X-E2E-Secret` | — | `{email}` | `{link}` | 404 en producción (la ruta no se registra) | AUTH | no |

#### Superadmin (F1, F5, F10)

| F | Método | Ruta | Auth | Rol | Request | Response | Errores | Rate limit | Pag. |
|---|---|---|---|---|---|---|---|---|---|
| F1 | GET | `/api/admin/workspaces` | ses | superadmin | `?status&cursor&limit` | `{data:[{id,name,status,planId,ownerEmail,metaStatus,memberCount,lastActivityAt,createdAt,aiNeuronsMonth}]}` | — | USR | sí |
| F1 | PATCH | `/api/admin/workspaces/:id` | ses | superadmin | `{status?:"active"\|"disabled", disabledReason?, planId?, aiDailyNeuronsOverride?, aiMonthlyNeuronsOverride?}` (`status:"active"` sobre un workspace en `deleting` lo restaura y limpia `deleted_at`, dentro de los 7 días) | `{workspace}` | — | USR | no |
| F1 | GET | `/api/admin/beta-invites` | ses | superadmin | `?cursor&limit` | `{data:[{id,email,note,usedAt,revokedAt}]}` | — | USR | sí |
| F1 | POST | `/api/admin/beta-invites` | ses | superadmin | `{email, note?}` | 201 `{invite}` + email de bienvenida | 409 `ALREADY_INVITED` | USR | no |
| F1 | DELETE | `/api/admin/beta-invites/:id` | ses | superadmin | — | 204 (revoca, no borra) | — | USR | no |
| F5 | GET | `/api/admin/usage` | ses | superadmin | `?month=YYYY-MM` | `{workspaces:[{id,name,neurons,metaCalls}], global:{neuronsToday}}` | — | USR | no |
| F10 | GET | `/api/admin/errors` | ses | superadmin | `?source&cursor&limit` | `{data:[{id,source,route,status,code,message,workspaceId,requestId,createdAt}]}` | — | USR | sí |

#### Meta: conexión, activos y callbacks (F2)

| F | Método | Ruta | Auth | Rol | Request | Response | Errores | Rate limit | Pag. |
|---|---|---|---|---|---|---|---|---|---|
| F2 | POST | `/api/w/:wid/meta/connect` | ses+ws | admin | — | `{authorizeUrl}` (FLfB con `config_id` y `state`) | — | USR | no |
| F2 | GET | `/api/meta/oauth/callback` | state | admin | `?code&state` o `?error` | 302 a `/w/<wid>/ajustes/conexiones?resultado=ok` o `?resultado=error&motivo=<code>` | motivos: `STATE_INVALID`, `META_DENIED`, `TOKEN_EXCHANGE_FAILED`, `MISSING_PERMISSIONS` | AUTH | no |
| F2 | GET | `/api/w/:wid/meta/connections` | ses+ws | viewer | — | `{data:[{id,businessId,businessName,status,scopes,connectedBy,connectedAt,lastErrorCode,tokenExpiresAt,creativeCount}]}` (`creativeCount` sale de un subconteo en la misma query) | — | USR | no |
| F2 | GET | `/api/w/:wid/meta/assets` | ses+ws | viewer | `?kind&enabled&cursor&limit` | `{data:[{id,kind,metaId,name,parentMetaId,currency,enabled,health}]}` | — | USR | sí |
| F2 | PATCH | `/api/w/:wid/meta/assets` | ses+ws | admin | `{changes:[{id, enabled}]}` (máx. 100) | `{data:[asset]}` | 422 `PLAN_AD_ACCOUNT_LIMIT` | USR | no |
| F2 | POST | `/api/w/:wid/meta/connections/:id/refresh-assets` | ses+ws | admin | — | `{data:[asset]}` | 409 `META_RECONNECT_REQUIRED`, 502 `META_ERROR` | EXP | no |
| F2 | DELETE | `/api/w/:wid/meta/connections/:id` | ses+ws | admin | `{confirm:true}` | 204 (revoca en Meta; borra token, activos y, en cascada, insights, subidas y creativos de esas cuentas) | — | USR | no |
| F2 | POST | `/api/meta/deauthorize` | sig | — | form `signed_request` | 200 | 400 `BAD_SIGNATURE` | IP | no |
| F2 | POST | `/api/meta/data-deletion` | sig | — | form `signed_request` | `{url, confirmation_code}` | 400 `BAD_SIGNATURE` | IP | no |
| F2 | GET | `/api/meta/data-deletion/:code` | pub | — | — | `{status:"received"\|"done", receivedAt, completedAt}` | — | AUTH | no |
| F4 | GET | `/api/w/:wid/meta/ad-accounts/:assetId/campaigns` | ses+ws | viewer | `?status=ACTIVE,PAUSED` | `{data:[{id,name,effectiveStatus,dailyBudgetMinor,objective,bidStrategy,isCbo}]}` (Cache API 60 s) | 409 `META_RECONNECT_REQUIRED`, 502 `META_ERROR` | USR | no (tope 300, como la app vieja, con aviso si se trunca) |
| F4 | GET | `/api/w/:wid/meta/campaigns/:campaignId/reference` | ses+ws | editor | `?adAccountAssetId` | `{adsetName, optimizationGoal, customEventType, pixelId, bidStrategy, bidAmountMinor, countries, dailyBudgetMinor, nextAdsetNumber}` | 422 `NO_REFERENCE_ADSET`, 422 `NOT_CBO` | USR | no |
| F4 | GET | `/api/w/:wid/meta/campaigns/:campaignId/ads` | ses+ws | editor | `?adAccountAssetId&range` | `{data:[{adId,name,storyId,thumbnailUrl,effectiveStatus,spendMinor,purchases,roas}]}` | 502 `META_ERROR` | USR | no (tope 200) |
| F4 | GET | `/api/w/:wid/meta/ads/:adId/preview` | ses+ws | viewer | `?adAccountAssetId` | `{iframeSrc}` (solo host `facebook.com`, nunca HTML crudo) | 502 `META_ERROR` | USR | no |

Toda ruta con `adAccountAssetId` valida que el activo pertenece a `:wid`, está habilitado y que el objeto de Meta pedido tiene ese `account_id` (si no: 404).

#### Productos y copys (F3, F5)

| F | Método | Ruta | Auth | Rol | Request | Response | Errores | Rate limit | Pag. |
|---|---|---|---|---|---|---|---|---|---|
| F3 | GET | `/api/w/:wid/products` | ses+ws | viewer | `?q&archived&cursor&limit` | `{data:[{id,name,landingUrl,headline,primaryText,cta,landingStatus,breakEvenRoas,archived}]}` | — | USR | sí |
| F3 | POST | `/api/w/:wid/products` | ses+ws | editor | `{name, landingUrl, primaryText, headline, description?, cta, utm?, priceMinor?, costMinor?, currency}` | 201 `{product}` | 409 `NAME_TAKEN`, 422 `COST_NOT_BELOW_PRICE`, 422 `LANDING_NOT_HTTPS` | USR | no |
| F3 | GET | `/api/w/:wid/products/:id` | ses+ws | viewer | — | `{product}` con `breakEvenRoas` y `profitPerSaleMinor` calculados | — | USR | no |
| F3 | PATCH | `/api/w/:wid/products/:id` | ses+ws | editor | parcial | `{product}` (cambiar la URL vuelve `landingStatus` a `unchecked`) | 409 `NAME_TAKEN` | USR | no |
| F3 | POST | `/api/w/:wid/products/:id/duplicate` | ses+ws | editor | — | 201 `{product}` (nombre + " (copia)") | — | USR | no |
| F3 | POST | `/api/w/:wid/products/:id/archive` | ses+ws | editor | `{archived:boolean}` | `{product}` | — | USR | no |
| F3 | POST | `/api/w/:wid/products/:id/check-landing` | ses+ws | editor | — | `{status:"ok"\|"soft_ok"\|"error", httpStatus, finalUrl, ms, error?}` | — | EXP | no |
| F5 | POST | `/api/w/:wid/products/:id/copies/generate` | ses+ws | editor | `{angle:"dolor"\|"beneficio"\|"prueba_social"\|"oferta"\|"urgencia"\|"libre", customAngle?}` | `{data:[5 copies con policyRisk]}` | 422 `AI_BUDGET_EXHAUSTED`, 502 `AI_UPSTREAM` | EXP | no |
| F5 | GET | `/api/w/:wid/products/:id/copies` | ses+ws | viewer | `?status&favorite&cursor&limit` | `{data:[copy]}` | — | USR | sí |
| F5 | POST | `/api/w/:wid/products/:id/copies` | ses+ws | editor | `{primaryText, headline, description?}` (copy manual) | 201 `{copy}` | — | USR | no |
| F5 | PATCH | `/api/w/:wid/copies/:copyId` | ses+ws | editor | `{primaryText?, headline?, description?, favorite?, status?:"saved"\|"discarded"}` | `{copy}` | — | USR | no |

#### Creativos, subidas y Drive (F4, F6)

| F | Método | Ruta | Auth | Rol | Request | Response | Errores | Rate limit | Pag. |
|---|---|---|---|---|---|---|---|---|---|
| F4 | POST | `/api/w/:wid/uploads` | ses+ws | editor | `{adAccountAssetId, fileName, contentType, sizeBytes, sha256, width?, height?, durationMs?}` (solo después de elegir la cuenta: paso 1 del lanzador o selector de cuenta de la biblioteca) | 201 `{uploadId, creativeId, kind:"video"\|"image", nextChunk:{start,end}\|null, duplicateOf?}` (crea `creatives` en `uploading` y `uploads`; video: `upload_phase=start` en `act_X/advideos`; imagen: `nextChunk={start:0,end:sizeBytes}`) | 404 (cuenta que no es del workspace), 413 `FILE_TOO_LARGE` (video 500 MB, imagen 30 MB), 415 `UNSUPPORTED_TYPE` (mp4, mov, m4v, jpg, png), 409 `META_RECONNECT_REQUIRED`, 502 `META_ERROR` | UPL | no |
| F4 | PUT | `/api/w/:wid/uploads/:uploadId/chunk?start=<n>` | ses+ws | editor | `application/octet-stream`; `Content-Length` = `nextChunk.end - nextChunk.start`, ≤ 10 MiB (10485760) | `{nextChunk:{start,end}\|null}` (video: `upload_phase=transfer` con `upload_session_id`, `start_offset`, `video_file_chunk`; imagen: `POST act_X/adimages` multipart `filename` y guarda `hash` y `url`; el Worker calcula `end = min(metaEndOffset, start + 10 MiB)`) | 413 `CHUNK_TOO_LARGE`, 409 `UPLOAD_OFFSET_MISMATCH` (con `details:{nextChunk}`), 409 `UPLOAD_NOT_ACTIVE`, 410 `UPLOAD_EXPIRED` (sesión > 24 h), 502 `META_ERROR` | UPL | no |
| F4 | POST | `/api/w/:wid/uploads/:uploadId/complete` | ses+ws | editor | — | `{creative}` (video: `upload_phase=finish` con `upload_session_id` y `title`, `creatives.status:"processing"` y se encola el job `meta_video_status`; imagen: `status:"ready"`) | 409 `UPLOAD_NOT_ACTIVE`, 410 `UPLOAD_EXPIRED`, 502 `META_ERROR` | USR | no |
| F4 | POST | `/api/w/:wid/uploads/:uploadId/abort` | ses+ws | editor | — | 204 (borra el `creatives` creado por esa subida y marca `uploads.status='aborted'`; solo en D1, no toca Meta) | — | USR | no |
| F6 | POST | `/api/w/:wid/creatives/:id/tag` | ses+ws | editor | `image/jpeg` ≤ 1 MB (una hoja de contacto armada en el navegador: 3 frames de video o la imagen reducida) | `{tags}` (el Worker llama a Workers AI visión en forma síncrona y guarda solo las etiquetas) | 413, 415, 422 `AI_BUDGET_EXHAUSTED`, 502 `AI_UPSTREAM` | EXP | no |
| F4 | GET | `/api/w/:wid/creatives` | ses+ws | viewer | `?ids&tag&adAccountAssetId&sort=recent\|most_used&status&kind&q&cursor&limit` | `{data:[{id,name,kind,status,adAccountAssetId,thumbnailUrl,formatWarning,tags,aiStatus,usedInLaunches,createdAt}]}` (una sola query con el conteo sobre `launch_items`; `name = ad_name ?? ad_name_suggested ?? original_filename`) | — | USR | sí |
| F6 | GET | `/api/w/:wid/creatives/:id` | ses+ws | viewer | — | `{creative}` (mismo DTO que la lista) | — | USR | no |
| F6 | PATCH | `/api/w/:wid/creatives/:id` | ses+ws | editor | `{name?, tags?:{hook,angle,format,language,onScreenText}}` (`name` escribe `ad_name`) | `{creative}` | — | USR | no |
| F6 | POST | `/api/w/:wid/creatives/:id/retag` | ses+ws | editor | — | 202 `{aiStatus:"queued"}` (el job `tag_creative` usa la miniatura de Meta, que baja el servidor) | 422 `AI_BUDGET_EXHAUSTED`, 409 `CREATIVE_NOT_READY` | EXP | no |
| F4 | POST | `/api/w/:wid/creatives/:id/archive` | ses+ws | editor | `{archived:boolean}` | `{creative}` | — | USR | no |
| F4 | POST | `/api/w/:wid/google/connect` | ses+ws | editor | `{launchId?}` | `{authorizeUrl}` (scopes `drive.file openid email`; si viene `launchId`, el servidor verifica que sea un borrador de `:wid` (si no, 404) y lo guarda en `oauth_states.launch_id`) | — | USR | no |
| F4 | GET | `/api/google/oauth/callback` | state | editor | `?code&state` o `?error` | 302 a `/w/<wid>/lanzador/<launchId>?google=ok\|error` si la fila de `oauth_states` trae `launch_id`; si no, a `/w/<wid>/ajustes/conexiones?google=ok\|error` | `STATE_INVALID`, `TOKEN_EXCHANGE_FAILED` | AUTH | no |
| F4 | GET | `/api/w/:wid/google/connection` | ses+ws | editor | — | `{connected, email, status}` (de la conexión del usuario actual) | — | USR | no |
| F4 | GET | `/api/w/:wid/google/picker-token` | ses+ws | editor | — | `{accessToken, expiresAt, apiKey, appId}` (token corto, solo `drive.file`) | 409 `GOOGLE_RECONNECT_REQUIRED` | USR | no |
| F4 | DELETE | `/api/w/:wid/google/connection` | ses+ws | editor | — | 204 (revoca en Google y borra) | — | USR | no |
| F4 | POST | `/api/w/:wid/google/imports` | ses+ws | editor | `{adAccountAssetId, files:[{id,name,mimeType,sizeBytes}]}` (máx. 30, elegidos en el Picker) | 202 `{data:[{creativeId,status:"importing"}]}` (encola `drive_import_file` con `{creativeId, fileId, adAccountAssetId}`) | 413, 415, 409 `GOOGLE_RECONNECT_REQUIRED` | EXP | no |

#### Lanzamientos e historial (F4, F9, F10)

| F | Método | Ruta | Auth | Rol | Request | Response | Errores | Rate limit | Pag. |
|---|---|---|---|---|---|---|---|---|---|
| F4 | POST | `/api/w/:wid/launches` | ses+ws | editor | `{draft: LaunchDraft parcial}` | 201 `{launch}` (`status:"draft"`) | — | USR | no |
| F10 | GET | `/api/w/:wid/launches` | ses+ws | viewer | `?status&cursor&limit` | `{data:[{id,status,source,productName,adAccountName,campaignName,itemsTotal,itemsDone,itemsFailed,metaCampaignUrl,createdBy,createdAt}]}` | — | USR | sí |
| F10 | GET | `/api/w/:wid/launches/:id` | ses+ws | viewer | — | `{launch, items, checks, plan}` | — | USR | no |
| F4 | PATCH | `/api/w/:wid/launches/:id` | ses+ws | editor | `{draft}` | `{launch}` (vuelve a `draft` si estaba `simulated`) | 409 `NOT_EDITABLE` | USR | no |
| F4 | POST | `/api/w/:wid/launches/:id/simulate` | ses+ws | editor | — | `LaunchPlan` (solo lecturas en Meta; un creativo de otra cuenta publicitaria sale como blocker `MEDIA_NOT_IN_ACCOUNT`, UI "Volvé a subirlo para esta cuenta") | 409 `META_RECONNECT_REQUIRED`, 502 `META_ERROR` | EXP | no |
| F4 | POST | `/api/w/:wid/launches/:id/start` | ses+ws | editor | `{confirm:true, planHash}` | 202 `{status:"queued"}` | 409 `NOT_SIMULATED`, 409 `PLAN_CHANGED`, 422 `BLOCKERS` (tope de presupuesto, landing en error, cuenta no activa o no USD, creativos sin terminar, `MEDIA_NOT_IN_ACCOUNT`), 409 `META_RECONNECT_REQUIRED` | USR | no |
| F4 | GET | `/api/w/:wid/launches/:id/progress` | ses+ws | viewer | `?since=<updatedAt>` | `LaunchProgress` (solo ítems cambiados desde `since`) | — | POLL | no |
| F4 | POST | `/api/w/:wid/launches/:id/retry-failed` | ses+ws | editor | `{confirm:true}` | 202 | 409 `NOTHING_TO_RETRY`, 409 `LAUNCH_RUNNING` | USR | no |
| F4 | POST | `/api/w/:wid/launches/:id/verify` | ses+ws | editor | — | 202 | 409 `LAUNCH_RUNNING` | USR | no |
| F4, F10 | POST | `/api/w/:wid/launches/:id/activate` | ses+ws | editor | `{confirm:true, startAt?}` (`startAt` = "Programar") | 202 `{status:"activating"}` | 409 `CHECKS_NOT_GREEN`, 422 `START_IN_PAST`, 409 `NOT_PAUSED` | USR | no |
| F4 | POST | `/api/w/:wid/launches/:id/discard` | ses+ws | editor | — | 204 (solo `draft`/`simulated`; no toca Meta) | 409 `NOT_EDITABLE` | USR | no |

#### Métricas, Hoy y acciones manuales (F6, F7)

| F | Método | Ruta | Auth | Rol | Request | Response | Errores | Rate limit | Pag. |
|---|---|---|---|---|---|---|---|---|---|
| F7 | GET | `/api/w/:wid/today` | ses+ws | viewer | — | `{accounts:[{id,name,currency,spendTodayMinor,spendYesterdayMinor,purchases,roas,cpaMinor}], alerts:[{kind,severity,text,objectId}], proposals:{pendingCount, top:[Proposal x5]}, launches:[x5], updatedAt, stale}` | — | USR | no |
| F7 | GET | `/api/w/:wid/metrics` | ses+ws | viewer | `?level=account\|campaign\|adset\|ad&range=today\|yesterday\|last_7d\|last_14d\|last_30d\|this_month\|custom&from&to&adAccountIds&productId&status&q&sort&cursor&limit` | `{data:[MetricsRow], totals, previousTotals, daily?, updatedAt, stale, nextCursor}` | 422 `RANGE_INVALID` (máx. 400 días, no futuro) | USR | sí |
| F7 | GET | `/api/w/:wid/metrics/export.csv` | ses+ws | viewer | mismos filtros | `text/csv` (máx. 5.000 filas, escape de fórmulas `= + - @`) | 422 `RANGE_INVALID` | EXP | no |
| F7 | GET | `/api/w/:wid/metrics/top-ads` | ses+ws | viewer | `?range&minSpendMinor=1000&limit=16` | `{data:[{adId,name,adAccountId,storyId,thumbnailUrl,spendMinor,roas,purchases}]}` | — | USR | no |
| F6 | GET | `/api/w/:wid/metrics/winning-tags` | ses+ws | viewer | `?range&dimension=hook\|angle\|format\|language\|onScreenText` | `{data:[{tag, ads, spendMinor, purchases, roas, cpaMinor}]}` | — | USR | no |
| F7 | POST | `/api/w/:wid/metrics/refresh` | ses+ws | viewer | `{range?}` | `{updatedAt}` | 429 si hubo refresco hace < 60 s | USR | no |
| F7 | POST | `/api/w/:wid/meta/objects/:objectId/status` | ses+ws | editor | `{adAccountAssetId, level:"campaign"\|"adset"\|"ad", status:"ACTIVE"\|"PAUSED", confirm:true}` | `{status}` | 422 `INVALID_STATUS`, 409 `META_RECONNECT_REQUIRED`, 502 `META_ERROR` | USR | no |
| F7 | POST | `/api/w/:wid/meta/campaigns/:campaignId/scale` | ses+ws | editor | `{adAccountAssetId, percent (1–50), expectedCurrentBudgetMinor, confirm:true}` | `{previousBudgetMinor, newBudgetMinor}` | 409 `BUDGET_CHANGED`, 422 `SCALE_LIMIT`, 422 `BUDGET_CAP`, 422 `NOT_CBO`, 502 `META_ERROR` | USR | no |
| F8 | GET | `/api/w/:wid/protected-campaigns` | ses+ws | viewer | `?cursor&limit` | `{data:[{campaignId, adAccountId, protectedBy, createdAt}]}` | — | USR | sí |
| F8 | PUT | `/api/w/:wid/protected-campaigns/:campaignId` | ses+ws | editor | `{adAccountAssetId}` | 204 | — | USR | no |
| F8 | DELETE | `/api/w/:wid/protected-campaigns/:campaignId` | ses+ws | editor | — | 204 | — | USR | no |

#### Piloto (F8)

| F | Método | Ruta | Auth | Rol | Request | Response | Errores | Rate limit | Pag. |
|---|---|---|---|---|---|---|---|---|---|
| F8 | GET | `/api/w/:wid/pilot/rules` | ses+ws | viewer | — | `{data:[{ruleType, enabled, params}]}` | — | USR | no |
| F8 | PUT | `/api/w/:wid/pilot/rules` | ses+ws | admin | `{rules:[{ruleType, enabled, params}]}` | `{data}` | 422 `SCALE_PERCENT_MAX_50` | USR | no |
| F8 | POST | `/api/w/:wid/pilot/run` | ses+ws | editor | — | 200 `{run, proposals}` (síncrono, usa insights con ≤ 15 min; sin neurons: 200 con `explanation:null` en cada propuesta) | 409 `RUN_IN_PROGRESS`, 429 si corrió hace < 5 min | EXP | no |
| F8 | GET | `/api/w/:wid/pilot/runs` | ses+ws | viewer | `?cursor&limit` | `{data:[{id,trigger,status,proposalsCreated,startedAt,finishedAt}]}` | — | USR | sí |
| F8 | GET | `/api/w/:wid/pilot/proposals` | ses+ws | viewer | `?status=pending\|executed\|dismissed\|failed\|expired&cursor&limit` (Historial usa executed, dismissed y failed) | `{data:[Proposal]}` | — | USR | sí |
| F8 | POST | `/api/w/:wid/pilot/proposals/:id/approve` | ses+ws | editor | `{confirm:true, proposedBudgetMinor?}` (obligatorio y debe coincidir si es `scale`) | `{proposal, launchId?}` (`duplicate` crea un borrador de lanzamiento) | 409 `PROPOSAL_STALE` (ya decidida, vencida o el presupuesto cambió), 422 `BUDGET_CAP`, 502 `META_ERROR` | USR | no |
| F8 | POST | `/api/w/:wid/pilot/proposals/:id/dismiss` | ses+ws | editor | `{reason?}` | `{proposal}` | 409 `PROPOSAL_STALE` | USR | no |

#### Chat, auditoría y varios (F9, F10)

| F | Método | Ruta | Auth | Rol | Request | Response | Errores | Rate limit | Pag. |
|---|---|---|---|---|---|---|---|---|---|
| F9 | POST | `/api/w/:wid/chat/sessions` | ses+ws | editor | — | 201 `{session}` | — | USR | no |
| F9 | GET | `/api/w/:wid/chat/sessions` | ses+ws | editor | `?cursor&limit` (solo las propias) | `{data:[{id,title,status,launchId,updatedAt}]}` | — | USR | sí |
| F9 | GET | `/api/w/:wid/chat/sessions/:id/messages` | ses+ws | editor | `?cursor&limit` | `{data:[{id,role,content,createdAt}]}` (sin mensajes `tool`) | — | USR | sí |
| F9 | POST | `/api/w/:wid/chat/sessions/:id/messages` | ses+ws | editor | `{text}` (≤ 2.000 caracteres) | `{messages:[assistant], draftLaunchId?}` (JSON, sin streaming) | 422 `AI_BUDGET_EXHAUSTED`, 502 `AI_UPSTREAM`, 409 `SESSION_CLOSED` | EXP | no |
| F10 | GET | `/api/w/:wid/audit` | ses+ws | viewer | `?origin&action&objectId&actorUserId&from&to&cursor&limit` | `{data:[{id,actorEmail,origin,action,objectType,objectId,objectName,result,detail,createdAt}]}` | — | USR | sí |
| — | GET | `/api/health` | pub | — | — | `{ok:true, version}` (no toca D1) | — | IP | no |
| — | POST | `/api/client-errors` | pub (sesión opcional) | — | `{message, stack?, route, release}` | 204 | — | `RL_CLIENT_ERR` (20/min por IP) | no |

### 4.4 Polling y tiempo real

| Situación | Intervalo | Cómo se corta |
|---|---|---|
| Lanzamiento en `queued`, `running`, `verifying` o `activating` | 3 s (`nextPollMs:3000` lo dicta el servidor) | El servidor devuelve `nextPollMs:null` al llegar a un estado final; el front deja de pedir. |
| Importación de Drive de un borrador abierto en el lanzador: `GET /api/w/:wid/creatives?ids=` mientras algún creativo esté en `importing` o `processing` | 3 s | Ningún creativo en `importing` ni `processing`: el front deja de pedir. |
| Pestaña Hoy y Métricas visibles | 60 s, solo con `document.visibilityState === "visible"`, más refetch al volver el foco | Pestaña oculta: no pide. |
| Corrida del piloto a pedido | Sin polling (síncrona) | — |
| Cualquier otra pantalla | Sin polling | — |

### 4.5 Trabajos en segundo plano (Workflows)

| Clase | Instancia (id determinístico) | Pasos | Reintentos |
|---|---|---|---|
| `LaunchWorkflow` | `launch-<launchId>-<attempt>` | 1 preflight (cuenta, página/IG, landing, referencia si es CBO existente) → 2 crear campaña (si `new_cbo`) → 3 crear conjunto → 4 crear hijos `LaunchItemWorkflow` en tandas de 5 y esperar con `step.sleep(20 s)` + lectura de contadores en D1 → 5 verificación con un `POST /` batch de Graph → 6 marcar `paused_verified` o `verified_with_errors` | Cada paso: 3 intentos ante 5xx/red (10 s, 30 s, 90 s); códigos de límite de Meta usan el backoff de 6.3. Pasos de creación son idempotentes: antes de crear se mira el id guardado en D1 y, en reintento, se busca en Meta por nombre exacto creado después de `started_at`. |
| `LaunchItemWorkflow` | `item-<launchItemId>-<attempt>` | 1 media: reusa `creatives.meta_video_id` / `meta_image_hash` (no se sube nada al lanzar; la subida ya se hizo en la cuenta elegida) → 2 verificar que el video esté `ready` (`step.sleep` 10 s, 20 s, 30 s y después 60 s; máx. 20 chequeos ≈ 17 min) → 3 miniatura → 4 creativo → 5 anuncio en `PAUSED` | Igual que arriba. Un ítem fallido no frena a los demás. |
| `JobWorkflow` | `<kind>-<clave>` | `kind` ∈ `activate_launch`, `drive_import_file`, `meta_video_status`, `tag_creative`, `insights_refresh`, `pilot_run`, `purge_workspace` (solo D1), `meta_disconnect_cleanup` | 3 intentos, sin reintentos infinitos; al agotar se registra en `error_events`. |

Presupuesto de subrequests: cada instancia cuenta sus `fetch` externos y, al llegar a 45, encadena una instancia de continuación con el estado mínimo (offset, ids). Se diseña así porque el plan Free limita a 50 subrequests externos por invocación y se asume el caso más estricto (por instancia). `meta_video_status` consulta `GET {video_id}?fields=status,format` con `step.sleep` entre chequeos, lee `GET {video_id}/thumbnails` al quedar `ready`, guarda `thumbnail_url` y `format_warning` y pasa el creativo a `ready` (o `failed` si Meta devuelve error).

### 4.6 Cron (`0 * * * *`, UTC)

| Condición | Qué hace |
|---|---|
| Siempre | Limpieza: `magic_links`, `oauth_states` y `sessions` vencidos; `uploads` de más de 24 h → `uploads.status='expired'` y `creatives.status='failed'` con `error='UPLOAD_EXPIRED'`; `insights_cache` vencido hace > 24 h; `error_events` > 30 días; propuestas `pending` vencidas → `expired`. |
| Siempre | Mantenimiento: re-cifrado de tokens con la clave vieja (de a 50 por corrida); creativos con `ai_status=pending` vuelven a la cola de etiquetado; refresco de miniaturas con más de 20 h (videos: `GET /?ids=<≤50>&fields=picture`; imágenes: `GET act_X/adimages?hashes=[...]&fields=hash,url`) porque las URLs de fbcdn vencen. |
| Siempre | Precalentado: `JobWorkflow insights_refresh` (rango `today`, niveles cuenta y campaña + salud) para workspaces con `last_activity_at` en las últimas 2 h. |
| Hora UTC ∈ {0, 6, 12, 18} (AR 21, 3, 9, 15 h) | `JobWorkflow pilot_run` por workspace activo con Meta conectado y al menos una regla habilitada. |
| Hora UTC = 7 | Purga de workspaces en `deleting` con `deleted_at` > 7 días (solo D1). |

## 5. Flujos técnicos clave

### 5.1 Subida de creativos desde el navegador

La app no guarda el archivo: va del navegador a Meta a través del Worker. La subida arranca recién cuando el usuario eligió la cuenta publicitaria (paso 1 del lanzador o selector de cuenta de la biblioteca), porque el medio queda en esa cuenta.

1. El navegador valida tipo y tamaño (video ≤ 500 MB, imagen ≤ 30 MB, por tiempo de subida y cantidad de requests), calcula `sha256` (aviso de duplicado) y llama `POST /uploads` con `adAccountAssetId`. El Worker crea la fila `creatives` (`uploading`) y la fila `uploads`; en video hace `upload_phase=start` con `file_size` en `POST act_X/advideos` (`graph-video.facebook.com`) y devuelve `nextChunk`. En imagen devuelve `nextChunk={start:0,end:sizeBytes}`.
2. El navegador manda cada bloque con `PUT .../chunk?start=<n>`: máximo 10 MiB (10485760), un bloque a la vez, 3 reintentos por bloque. Si `start` no coincide con `start_offset` guardado: 409 `UPLOAD_OFFSET_MISMATCH` con `details:{nextChunk}` correcto. El Worker reenvía el cuerpo en stream, sin buffer: video con `upload_phase=transfer` (`upload_session_id`, `start_offset`, `video_file_chunk`); imagen en un solo bloque con `POST act_X/adimages` multipart `filename` (devuelve `images.<nombre>.hash` y `url`). El multipart se arma como stream (preámbulo + `request.body` + cierre) a través de `FixedLengthStream(totalBytes)`. Es I/O, no CPU, y consume 1 subrequest por bloque. El Worker devuelve `end = min(metaEndOffset, start + 10 MiB)`.
3. `POST .../complete`: video hace `upload_phase=finish` con `upload_session_id` y `title`, pasa a `processing` y se encola el job `meta_video_status` (estado, miniatura y `format_warning`); imagen pasa a `ready` con `meta_image_hash` y `thumbnail_url`.
4. Reintentar siempre significa volver a mandar desde el navegador. Si el usuario cierra la pestaña, la subida queda hasta que vence (> 24 h: 410 `UPLOAD_EXPIRED`, el cron la pasa a `uploads.status='expired'` y su creativo a `creatives.status='failed'` con `error='UPLOAD_EXPIRED'`) y tiene que elegir el archivo otra vez.
5. Etiquetado: en paralelo, el navegador arma una hoja de contacto JPEG (3 frames de `<video>` + `canvas`, o la imagen reducida; ≤ 1 MB) y la manda a `POST /creatives/:id/tag`; el Worker llama a Workers AI visión de forma síncrona y guarda solo las etiquetas. `retag` y el job `tag_creative` (archivos de Drive) usan la miniatura de Meta, que baja el servidor. La miniatura es la URL de `/thumbnails` (video) o la `url` de `adimages` (imagen); las URLs de fbcdn vencen y el cron las refresca (4.6). El CSP permite `img-src https://*.fbcdn.net`.
6. Archivos de Drive: el job `drive_import_file` lleva `{creativeId, fileId, adAccountAssetId}`. Video: `runResumableUpload` lee Drive por rangos (`GET drive/v3/files/{id}?alt=media` con `Range: bytes=start-end`) y lo manda a Meta con 1 bloque por paso de Workflow (2 subrequests por paso). Imagen (≤ 30 MB): un paso que pasa el stream de Drive a `adimages`. Después sigue igual que en el paso 3.

Riesgo a confirmar en la tarea 40 con una cuenta publicitaria de prueba gratuita: que Meta acepte un bloque más chico que su `end_offset`. Si no lo acepta, el Worker devuelve el rango exacto de Meta, hasta 95 MB por request. El contrato con el navegador no cambia.

### 5.2 Video hacia Meta

| Origen | Método | Detalle |
|---|---|---|
| Navegador | `upload_phase=start` → `transfer` por bloque → `finish`, desde el Worker (5.1) | `meta/upload.ts`: `startVideoUpload`, `transferVideoChunk`, `finishVideoUpload`. El cuerpo se arma con `multipartStream` (`src/api/lib/multipart-stream.ts`) y pasa en stream. |
| Drive | Mismas fases desde un Workflow con `runResumableUpload` (`src/workflows/lib/resumable-upload.ts`) | `readRange(start, end)` abre el rango en Drive; 1 bloque por paso; el `start_offset` queda en el estado del paso; el presupuesto de subrequests (4.5) encadena la continuación. |
| Después de `finish` | Job `meta_video_status`: `GET {video_id}?fields=status,format` hasta `ready` (`readVideoStatus`); `GET {video_id}/thumbnails` (`readVideoThumbnail`, preferida o primera); el aviso de video horizontal sale de `format` | Igual que inventario 2.4. |

### 5.3 Payloads de Meta (heredados del inventario, sin cambios de semántica)

| Objeto | Llamada | Campos |
|---|---|---|
| Campaña (solo `new_cbo`) | `POST {act}/campaigns` | `name, objective` (default `OUTCOME_SALES`), `status=PAUSED, buying_type=AUCTION, special_ad_categories=[]`, `bid_strategy` (`LOWEST_COST_WITHOUT_CAP` o `COST_CAP`), `daily_budget` (centavos, 1 ≤ presupuesto ≤ tope del workspace). |
| Conjunto | `POST {act}/adsets` | `name, campaign_id, status=PAUSED, optimization_goal` (`OFFSITE_CONVERSIONS`), `billing_event` (`IMPRESSIONS`), `targeting` (pasado por `cleanTargeting`, lista blanca de inventario 2.2), `promoted_object={pixel_id, custom_event_type:"PURCHASE"}`, `attribution_spec`, `start_time?`, `bid_amount?`, `bid_constraints?`. En CBO existente se copian del conjunto más nuevo `optimization_goal, billing_event, attribution_spec, targeting, custom_event_type` y `bid_amount`/`bid_constraints` según `bid_strategy`. |
| Imagen | `POST {act}/adimages` multipart `filename` | Devuelve `images.<nombre>.hash` y `url`. |
| Creativo nuevo | `POST {act}/adcreatives` | `object_story_spec={page_id, instagram_user_id?, video_data:{video_id, image_url, title, message, link_description, call_to_action:{type, value:{link}}}}` o `link_data={image_hash, link, name, message, description, call_to_action}`; `degrees_of_freedom_spec.creative_features_spec` = todas las features en `OPT_OUT` sin `standard_enhancements` (salvo que el workspace active mejoras); `contextual_multi_ads={enroll_status:"OPT_OUT"}`; `url_tags` = UTM del producto. |
| Creativo clonado | `POST {act}/adcreatives` | `name, object_story_id` (prefijo = `page_id` elegido, si no: error "publicación de otra página"), mismo `degrees_of_freedom_spec` y `contextual_multi_ads`. |
| Anuncio | `POST {act}/ads` | `name, adset_id, status=PAUSED, creative={creative_id}, tracking_specs=[{"action.type":["offsite_conversion"],"fb_pixel":[pixel]}]`. |
| Activación | `POST /` batch (≤ 50 por llamada) con `status=ACTIVE` sobre campaña (si es nueva), conjunto y anuncios; `start_time` en el conjunto si es "Programar" | Luego `verify_active` (batch de lectura). Falla parcial: "Se activaron X de Y. Volvé a tocar Activar". |
| Cambio de estado manual o del piloto | `POST {object_id}` `status=ACTIVE\|PAUSED` | Único update de estado permitido. |
| Escalar | `GET {campaign}?fields=daily_budget` → `POST {campaign}` `daily_budget` | `nuevo = max(actual + 100, round(actual × (1 + pct/100) / 100) × 100)`, con `pct ≤ max_scale_percent (50)`, `nuevo ≤ actual × 1,5` y `nuevo ≤ tope del workspace`; si el actual difiere de `expectedCurrentBudgetMinor`: 409. |

### 5.4 Verificación (por lanzamiento, con batch de lectura)

Relee campaña (`name, status, daily_budget, objective, bid_strategy`), conjunto (`name, status, promoted_object, optimization_goal, start_time, bid_amount, targeting`) y anuncios (`name, status, effective_status, issues_info, creative{object_story_spec, effective_object_story_id, degrees_of_freedom_spec}`). Chequeos, cada uno `{ok, code, text}`:

| Código | Chequeo |
|---|---|
| `CAMPAIGN_PAUSED`, `BUDGET_MATCH` | Campaña en `PAUSED` y presupuesto esperado (solo `new_cbo`). |
| `ADSET_PAUSED`, `START_TIME`, `BID` | Conjunto en `PAUSED`; `start_time` esperado; `COST_CAP` + `bid_amount` si corresponde. |
| `COUNTRIES`, `PIXEL`, `EVENT`, `OPT_GOAL` | Países (solo `new_cbo`), píxel, `custom_event_type=PURCHASE`, `optimization_goal=OFFSITE_CONVERSIONS`. |
| `AD_COUNT` | Cantidad de anuncios = ítems no fallidos. |
| `LINK`, `LANDING_UP` | Mismo link del producto en todos los anuncios y la landing responde. |
| `PAGE`, `INSTAGRAM` | `page_id` e `instagram_user_id` esperados. |
| `TEXTS` | Título, texto y descripción del copy elegido (modo clon: `effective_object_story_id` ∈ `story_ids`). |
| `ADS_PAUSED_NO_ISSUES` | Cada anuncio en `PAUSED` y sin `issues_info`. |
| `ENHANCEMENTS_OFF` | Ninguna feature con `enroll_status=OPT_IN` (salvo que el workspace las active). |
| `VIDEO_READY` | Cada video con `video_status=ready`. |

### 5.5 Guardrails (implementados en código y cubiertos por tests unitarios)

| Guardrail | Dónde |
|---|---|
| Todo se crea en `PAUSED` | `meta/write.ts` rechaza cualquier creación en `/campaigns`, `/adsets`, `/ads`, `/adcreatives` con otro `status`. |
| No existe borrar | `meta/write.ts` no expone `DELETE` y rechaza `status` ∉ {`ACTIVE`, `PAUSED`}. La app no tiene "Descartar" sobre Meta. |
| Subir presupuesto solo un humano en la UI | Solo dos caminos tocan `daily_budget` de una campaña existente: `POST .../scale` y aprobar una propuesta `scale`; ambos exigen sesión, CSRF, rol `editor+` y `confirm:true` con el monto visto. Chat e IA no importan `meta/write`. |
| Tope de presupuesto | `workspace_settings.max_campaign_budget_minor` (default 30000 = US$300) en creación y escala. |
| Escala máxima | +50 % por acción (`max_scale_percent`, check ≤ 50 en DB). |
| Activar solo con verde | `activate` exige `checks_ok=1`. |
| Rate limit de Meta | Ver 6.3. |
| Cuenta apta | `account_status ∈ {1, 201}` y moneda `USD` para lanzar (ver 01-PRD § Decisiones aceptadas). |

### 5.6 IA

Todo corre en Workers AI (binding `AI`, sin claves de terceros) detrás de la interfaz `AiProvider` (`src/api/integrations/ai/provider.ts`), con `generateText`, `runTools` y `describeImage`. `workers-ai.ts` la implementa; los tests usan un proveedor falso. Claude se puede sumar más adelante como un segundo `AiProvider`.

| Uso | Variable y modelo | Entrada | Salida validada con Zod | Tope |
|---|---|---|---|---|
| Copys (F5) y explicación del piloto (F8) | `WORKERS_AI_TEXT_MODEL` (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`), `generateText` | Copys: producto, ángulo, políticas de Meta resumidas, límites (título 40, texto 125, descripción 150). Piloto: propuestas ya calculadas por reglas (la IA no decide, explica), una llamada por corrida | Copys: 5 × `{primaryText, headline, description, policyRisk:"none"\|"low"\|"high", policyNote}`; si alguno excede el límite se reintenta una vez y si no se marca `over_limit`. Piloto: `{[proposalId]: explicación ≤ 240 caracteres}` | Neurons del workspace; si no hay, el piloto sale con propuestas sin explicación |
| Chat (F9) | `WORKERS_AI_CHAT_MODEL` (`@cf/meta/llama-4-scout-17b-16e-instruct`), `runTools` con function calling, máx. 6 iteraciones por mensaje | Historial (últimos 20 mensajes) + herramientas | Texto + `create_launch_draft` validado contra `LaunchDraft` | Neurons del workspace + EXP |
| Etiquetado (F6) | `WORKERS_AI_VISION_MODEL` (`@cf/meta/llama-4-scout-17b-16e-instruct`), `describeImage` (sin respaldo en otro modelo) | Hoja de contacto JPEG (3 frames de video o imagen reducida) + nombre de archivo | `{hook, angle, format:"ugc"\|"demo"\|"testimonio"\|"estatico"\|"otro", language, onScreenText:boolean, summary}` + nombre sugerido `{hook}-{formato}-{angulo}-{n}` | Neurons del workspace + `WORKERS_AI_DAILY_NEURON_CAP` global |

Herramientas del chat (todas de lectura en D1/caché salvo la última, que solo escribe un borrador en D1): `search_products`, `list_enabled_assets`, `list_campaigns` (lee la Cache API o Meta en lectura), `list_recent_creatives`, `create_launch_draft`. No hay herramienta de activar, pausar, escalar ni lanzar.

Defensas contra prompt injection: los datos de herramientas y de usuario van en bloques marcados como datos; el system prompt prohíbe ejecutar instrucciones dentro de datos; la salida de herramientas se valida con Zod; el borrador queda en `draft` y el usuario lo revisa en el paso de revisión del lanzador; el chat no tiene camino de código hacia `meta/write` (regla ESLint + test).

Contabilidad: cada llamada devuelve `AiUsage` (`{model, inputTokens, outputTokens, neurons}`), escribe una fila en `ai_usage` (`provider=workers_ai`, `model`, `input_tokens`, `output_tokens`, `neurons`) y suma en `usage_counters` (métrica `ai_neurons`: día y mes del workspace, y día global). `src/shared/ai-neuron-rates.ts` mapea el id del modelo a neurons por millón de tokens de entrada y salida (un id desconocido usa la tarifa más alta) y se carga con los valores vigentes al implementar (tarea 108).

Presupuesto en `src/api/services/ai-budget.ts` (`assertAiBudget`, `recordAiUsage`, `neuronsLeftToday`): por workspace `plans.ai_daily_neurons` (2000) y `plans.ai_monthly_neurons` (30000), con overrides `workspaces.ai_daily_neurons_override` y `workspaces.ai_monthly_neurons_override`; global `WORKERS_AI_DAILY_NEURON_CAP` (9000). El día es el día UTC (así resetea Cloudflare: 21 h en Argentina). Antes de cada llamada se chequea; si se pasa: 422 `AI_BUDGET_EXHAUSTED` con `details:{scope:"workspace_day"|"workspace_month"|"global_day", resetsAt}`. `AI_UPSTREAM` sigue siendo 502. `GET /api/w/:wid` expone `aiUsage` y la UI muestra "IA en pausa hasta las 21 h" cuando se agota el tope global.

Estimación de neurons (las tarifas se re-verifican en la tarea 108): Llama 3.3 70B fp8-fast ≈ 26.700 / 204.800 por millón de tokens de entrada / salida; Llama 4 Scout ≈ 24.500 / 77.300.

| Operación | Neurons aprox. |
|---|---|
| 5 variantes de copy | ≈ 190 |
| Etiquetado de un creativo | ≈ 90 |
| Explicación del piloto | ≈ 100 |
| Chat | ≈ 90 por iteración (≈ 540 con 6) |

Con 2.000 por día alcanza para unas 4 corridas de copys + 6 etiquetados + 2 pilotos + 2 chats. El tope global de 9.000 por día soporta 4 o 5 workspaces muy activos a la vez.

## 6. APIs externas

### 6.1 Tabla

| Proveedor | Propósito | Límites del free tier / cupos | Timeout | Reintentos | Si cae |
|---|---|---|---|---|---|
| Meta Graph API `v24.0` (`graph.facebook.com`, `graph-video.facebook.com`) | Login, activos, creación, estado, insights | Sin costo. Límite por cuenta publicitaria (Business Use Case `ads_management` / `ads_insights`), menor en nivel de acceso de desarrollo; se leen `X-Business-Use-Case-Usage`, `X-Ad-Account-Usage` y `x-fb-ads-insights-throttle` y se frena al 75 % | 30 s lecturas y creaciones; 60 s batch; 120 s por bloque de subida | Ver 6.3 | Lanzamiento queda en pausa con lo creado; métricas muestran caché con `stale:true` y hora; acciones manuales dan 502 `META_ERROR` con el mensaje de Meta. |
| Facebook Login for Business | Conexión con `config_id` | — | 10 s el canje de `code` | 1 ante 5xx | Callback redirige con `motivo=TOKEN_EXCHANGE_FAILED`. |
| Resend (`api.resend.com/emails`) | Magic links e invitaciones | Plan gratis: 3.000 emails/mes, 100/día, 1 dominio verificado. Sin dominio verificado solo entrega al email dueño de la cuenta de Resend (dominio pendiente) | 10 s | 1 ante 429/5xx | 503 `EMAIL_SEND_FAILED`; el magic link creado se invalida. |
| Workers AI (binding `AI`) | Copys, explicación del piloto, chat y etiquetado | 10.000 neurons/día por cuenta (compartido con otras apps); la app se limita a `WORKERS_AI_DAILY_NEURON_CAP` (9000) | 60 s copys y chat; 90 s piloto; 30 s etiquetado | 1 ante 5xx | 502 `AI_UPSTREAM`; el piloto genera propuestas sin explicación; el chat muestra error y conserva el historial; el etiquetado deja `ai_status=failed` y el creativo se usa sin etiquetas. Sin neurons: 422 `AI_BUDGET_EXHAUSTED`. |
| Google OAuth (`accounts.google.com/o/oauth2/v2/auth`, `oauth2.googleapis.com/token`, `/revoke`) | Conexión de Drive | Gratis; app en modo prueba hasta 100 usuarios de prueba; `drive.file` no es scope restringido | 10 s | 1 ante 5xx | 409 `GOOGLE_RECONNECT_REQUIRED` si el refresh falla con `invalid_grant`. |
| Google Picker (`apis.google.com/js/api.js`) | Elegir archivos en el navegador | Gratis, cuota de API key | — (cliente) | — | El usuario puede subir desde el navegador. |
| Google Drive API v3 (`files/{id}?alt=media&supportsAllDrives=true`) | Leer archivos elegidos y mandarlos a Meta (stream a Meta por rangos) | 12.000 consultas/min por proyecto | 10 s a primer byte; sin tope de reloj en el stream | 3 por archivo (paso del Workflow) | Creativo en `failed` con "No pude bajar el archivo de Drive"; 401 → reconectar; 403/404 → "no tengo acceso". |

### 6.2 Meta: app, permisos y token

| Tema | Decisión |
|---|---|
| App | Nueva, tipo Business. Productos: Marketing API y Facebook Login for Business. Modo Activo. "Require App Secret" activado: toda llamada lleva `appsecret_proof = HMAC-SHA256(token, META_APP_SECRET)`. Token en header `Authorization: Bearer`, nunca en la URL; las URLs `paging.next` no se loguean. |
| Configuración FLfB (`META_LOGIN_CONFIG_ID`) | Tipo de token: **token de acceso de usuario del sistema** (integración de negocio), vencimiento "Nunca". Activos: cuentas publicitarias, páginas, cuentas de Instagram, píxeles. |
| Permisos mínimos | `ads_management` (crear y cambiar estado), `ads_read` (insights), `business_management` (activos del negocio y token de usuario del sistema), `pages_show_list` (listar páginas), `pages_read_engagement` (leer página y publicaciones para clonar), `pages_manage_ads` (crear anuncios con la página en `object_story_spec`), `instagram_basic` (listar la cuenta de Instagram de la página). No se piden permisos de publicación ni de mensajes. La pantalla de prueba del screencast de App Review usa exactamente estos siete. |
| Login | `https://www.facebook.com/v24.0/dialog/oauth?client_id&redirect_uri=<APP_ORIGIN>/api/meta/oauth/callback&config_id&state&response_type=code&override_default_response_type=true`. `state` = 32 bytes aleatorios, guardado como hash en `oauth_states` (10 min, un uso, ligado a usuario y workspace). |
| Canje | `GET /v24.0/oauth/access_token?client_id&client_secret&redirect_uri&code` → token del usuario del sistema. Luego `GET /debug_token?input_token=<token>` (con app token `app_id|app_secret`) para `is_valid`, `scopes`, `granular_scopes` (ids de activos por permiso) y `expires_at` (0 = no vence). Si falta un permiso obligatorio: `motivo=MISSING_PERMISSIONS`. Si la configuración devolviera un token de usuario, se canjea por uno largo (`grant_type=fb_exchange_token`, 60 días) y se guarda `token_expires_at`; la pestaña Hoy avisa 7 días antes. |
| Descubrimiento (3 llamadas) | `GET me?fields=id,name`; `GET me/adaccounts?fields=id,name,account_id,account_status,currency,timezone_name,business{id,name},adspixels{id,name,last_fired_time}&limit=100`; `GET me/accounts?fields=id,name,instagram_business_account{id,username}&limit=100` (si viene vacío, `me/assigned_pages`). `business_id` = `target_ids` de `business_management` en `granular_scopes` o, si no viene, el `business` de las cuentas. Paginación hasta 500. |
| Desconectar | `DELETE /me/permissions` con el token (revoca la app para ese usuario del sistema); si Meta responde error, igual se borran token y activos y se muestra "Quitá también la integración en Configuración del negocio > Integraciones". |
| Deautorizar (`/api/meta/deauthorize`) | Valida `signed_request` (base64url `firma.payload`, HMAC-SHA256 con `META_APP_SECRET`, `algorithm=HMAC-SHA256`). Marca las conexiones con ese `meta_user_id` como `reconnect_required` y audita. |
| Borrado de datos (`/api/meta/data-deletion`) | Mismo chequeo; crea `data_deletion_requests`, borra conexiones, activos e insights de ese `meta_user_id` (job `meta_disconnect_cleanup`) y responde `{url:"<APP_ORIGIN>/api/meta/data-deletion/<code>", confirmation_code}`. |
| Páginas legales | `/privacidad` y `/terminos` (assets estáticos), cargadas en la app de Meta junto con las URLs de deautorizar y borrado. |
| App Review | Riesgo alto (PRD R1). Hasta aprobar `ads_management` y `business_management` con Acceso Avanzado (requiere verificación del negocio), solo usuarios con rol en la app (testers) pueden conectar. Se prepara desde el día 1: screencast del flujo completo, política de privacidad y descripción de uso por permiso. |
| Versión | `v24.0` (la de la app vieja). No se pudo verificar desde esta sesión la versión estable más nueva a noviembre de 2026. Va en la variable `GRAPH_API_VERSION`; en la tarea 108 (Hito 6) se revisa el changelog de Graph API, se sube a la más nueva si los tests de payload pasan y se anota acá. Meta mantiene cada versión al menos 2 años, así que `v24.0` no bloquea la beta. |

### 6.3 Errores de Meta → comportamiento

| Código / caso | Clasificación | Comportamiento |
|---|---|---|
| 4, 17, 32, 613, 80000–80014 (incluye 80004) o `is_transient:true` | Límite / transitorio | Backoff con `step.sleep`: 60 s, 2 min, 4 min, 8 min, 15 min, 15 min (máx. 6 intentos); si el header trae `estimated_time_to_regain_access`, se usa ese valor. No falla el lanzamiento salvo agotar intentos. En requests síncronos: 429 `META_RATE_LIMITED` con "Meta pide esperar: probá de nuevo en 1 o 2 minutos". |
| 190 (o subcódigos 458, 460, 463, 467) | Sesión inválida | Conexión → `reconnect_required`; alerta en Hoy; 409 `META_RECONNECT_REQUIRED`. Sin reintento. |
| "API access blocked" | App no activa | Mismo trato que 190 con el texto del inventario 3.7. |
| 10, 200–299 | Permiso | Ítem fallido: "Falta permiso: revisá que la integración tenga asignada la cuenta o la página". |
| 100, 1487xxx, 2446xxx, 1885xxx | Parámetro / creativo / política | Ítem fallido con `error_user_title` + `error_user_msg`. Sin reintento. |
| 5xx, timeout, error de red | Transitorio | 3 reintentos (10 s, 30 s, 90 s). |

## 7. Variables de entorno y secretos

| Nombre | Tipo | Dónde vive |
|---|---|---|
| `APP_ORIGIN` | var | `wrangler.jsonc` `vars` (por entorno) |
| `ENVIRONMENT` (`production` \| `preview` \| `development`) | var | `wrangler.jsonc` |
| `GRAPH_API_VERSION` (`v24.0`) | var | `wrangler.jsonc` |
| `META_APP_ID`, `META_LOGIN_CONFIG_ID` | var | `wrangler.jsonc` |
| `META_APP_SECRET` | secreto | `wrangler secret` / `.dev.vars` |
| `TOKEN_ENC_KEY_V1` (AES-256, base64; futuras `_V2`…) | secreto | `wrangler secret` / `.dev.vars` |
| `TOKEN_ENC_KEY_CURRENT` (número de versión activa) | var | `wrangler.jsonc` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_PICKER_API_KEY` (restringida por referrer a `APP_ORIGIN`), `GOOGLE_PROJECT_NUMBER` | var | `wrangler.jsonc` |
| `GOOGLE_CLIENT_SECRET` | secreto | `wrangler secret` |
| `RESEND_API_KEY` | secreto | `wrangler secret` |
| `EMAIL_FROM` | var | `wrangler.jsonc` |
| `WORKERS_AI_TEXT_MODEL` (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`), `WORKERS_AI_CHAT_MODEL` y `WORKERS_AI_VISION_MODEL` (ambos `@cf/meta/llama-4-scout-17b-16e-instruct`) | var | `wrangler.jsonc` |
| `WORKERS_AI_DAILY_NEURON_CAP` (9000) | var | `wrangler.jsonc` |
| `SUPERADMIN_EMAIL` | var | `wrangler.jsonc` (al loguearse ese email queda `is_superadmin=1`) |
| `E2E_SECRET` | secreto | solo en `lanzador-preview` y en GitHub Actions secrets |
| Bindings: `DB` (D1 `lanzador-db`), `AI`, `LAUNCH_WF`, `LAUNCH_ITEM_WF`, `JOB_WF`, `RL_IP`, `RL_USER`, `RL_AUTH`, `RL_EXP`, `RL_UPL`, `RL_POLL`, `RL_CLIENT_ERR`, `ASSETS` | binding | `wrangler.jsonc` |

`.dev.vars.example` lista los nombres con valores vacíos. Ningún secreto llega al bundle del front (el front recibe `GOOGLE_PICKER_API_KEY` y `GOOGLE_PROJECT_NUMBER` por `/picker-token`, que son públicos por diseño de Google).

Cifrado de tokens: AES-256-GCM con WebCrypto, IV de 12 bytes aleatorio por cifrado, AAD = `"<tabla>:<id>:<workspace_id>"` (el ciphertext no sirve en otra fila). Se guarda `key_version`; para rotar se agrega `TOKEN_ENC_KEY_V2`, se sube `TOKEN_ENC_KEY_CURRENT` y el cron re-cifra filas con versión vieja de a 50 por corrida.

## 8. Hosting y headers

| Tema | Decisión |
|---|---|
| Workers | `lanzador` (producción, rama `main`) y `lanzador-preview` (rama `dev`), cada uno con su D1 (`lanzador-db` y `lanzador-db-preview`). `compatibility_flags: ["nodejs_compat"]`, `observability.enabled: true`. |
| Assets | `assets.directory: "dist/web"`, `run_worker_first: ["/api/*"]`, `not_found_handling: "single-page-application"`. Archivos con hash: `Cache-Control: public, max-age=31536000, immutable` vía `_headers`. `robots.txt` bloquea `/api/`. |
| Headers de la SPA (`_headers`) | `Content-Security-Policy: default-src 'self'; script-src 'self' https://apis.google.com; frame-src https://www.facebook.com https://docs.google.com https://drive.google.com; img-src 'self' data: blob: https://*.fbcdn.net https://*.googleusercontent.com; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. |
| Headers de la API | `hono/secure-headers` + `Cache-Control: no-store`. CORS: sin CORS (mismo origen); preflight rechazado. |
| Landing check (SSRF) | Solo `https`, sin credenciales en la URL, sin IPs literales ni `localhost`, redirecciones manuales (máx. 5, todas `https`), 10 s, User-Agent de navegador; 2xx/3xx = `ok`, 401/403/429 = `soft_ok`, resto = `error`. |

## 9. Observabilidad

| Señal | Implementación | Costo |
|---|---|---|
| Logs | Workers Logs (`observability.enabled`), JSON por línea: `requestId, route, method, status, ms, userId, workspaceId, metaCalls, cpuHint`. Nunca tokens, cookies, cuerpos de request ni URLs de Meta con query. | Free: 200.000 eventos/día, 3 días de retención. |
| Errores | Tabla `error_events` en D1 (5xx de la API, Workflows que agotan reintentos, cron, errores del front vía `/api/client-errors`). Pantalla de superadmin `/admin/errores`. Retención 30 días. | Logpush y Tail Workers no están en el plan Free; D1 sí. |
| Métricas de uso | `usage_counters` (llamadas a Meta y neurons por workspace por día y mes; neurons globales por día) en `/admin/uso`. | — |
| Consumo de Cloudflare | Dashboard › Workers › Analytics y D1 › Metrics; se recomienda activar notificaciones de uso (no se cambia la cuenta sin preguntar). | — |
| Alertas al usuario | Pestaña Hoy (conexión vencida, cuenta con problemas, anuncios rechazados, lanzamientos con error). | — |

## 10. Límites del plan Free usados en el diseño y consumo estimado

### 10.1 Límites de referencia (se re-verifican en developers.cloudflare.com en la tarea 108 (Hito 6); si cambian, se ajusta esta tabla)

| Recurso | Límite Free | Cómo lo respeta el diseño |
|---|---|---|
| Workers requests | 100.000/día por cuenta | Assets fuera del Worker; polling acotado; cache de insights. |
| CPU | 10 ms por invocación | Streams para archivos; payloads de Meta con campos acotados; JSON de insights ≤ 1.000 filas por blob; trabajo largo en pasos de Workflow. |
| Subrequests | 50 por invocación | Instancias por ítem, batch de Graph, continuación a los 45 (4.5). |
| Cuerpo de request | 100 MB | Bloques de subida de 10 MiB. |
| D1 | 5 M filas leídas/día, 100.000 escritas/día, 500 MB por base | Índices por filtro frecuente, blobs de insights (1 fila por cuenta/nivel/rango), contadores, purga horaria. |
| Workers AI | 10.000 neurons/día por cuenta | Tope de la app 9.000 (`WORKERS_AI_DAILY_NEURON_CAP`) más 2.000 por día y 30.000 por mes por workspace; sin respaldo en otro proveedor. |
| Workflows | Instancias concurrentes y pasos por instancia acotados por plan | ≤ 5 hijos por lanzamiento a la vez; ≤ 120 pasos por instancia. |
| Cron Triggers | 5 por cuenta | 1 expresión. |
| Workers Logs | 200.000 eventos/día | 1 línea por request y por paso. |

### 10.2 Consumo por workspace activo por día

Supuesto: 2 usuarios, 4 h de uso, 1 lanzamiento de 20 videos de 60 MB, 2 h con Hoy o Métricas visibles, 4 corridas del piloto, 10 copys o mensajes de chat. Los medios no se guardan: pasan por el Worker hacia Meta.

| Recurso | Detalle | Por workspace | 20 workspaces | % del Free |
|---|---|---|---|---|
| Requests al Worker | navegación API 150 + polling Hoy 120 + métricas 60 + subida 20 × 8 (inicio + 6 bloques de 10 MiB + cierre) = 160 + progreso 160 + pasos de Workflow ~340 + estado de video ~40 + etiquetado 20 + piloto ~30 + precalentado 24 + IA 20 | ≈ 1.100 | ≈ 22.000 | 22 % |
| D1 filas leídas | sesión + membresía por request, listas paginadas, blobs de insights | ≈ 25.000 | ≈ 500.000 | 10 % |
| D1 filas escritas (con índices, ×2,5) | ítems ~140, uploads y creativos 140, insights ~100, auditoría 40, IA 60, varios 120 | ≈ 1.500 | ≈ 30.000 | 30 % |
| Workers AI | etiquetado ~90 neurons por creativo × 20 = 1.800, más copys y chat dentro del tope diario del workspace | ≤ 2.000 | tope global 9.000 (≈ 4 o 5 workspaces muy activos el mismo día) | 90 % |

Conclusión: entra en el free tier con margen en requests y lecturas. El riesgo que supera el 50 % son los neurons de Workers AI con muchos workspaces muy activos el mismo día; tiene tope duro en la app (por workspace y global) y la UI avisa "IA en pausa hasta las 21 h". Si se vuelve habitual, la opción es Workers Paid o sumar Claude como segundo `AiProvider`, y eso se consulta antes.

## 11. Pruebas mínimas que este TRD exige

| Área | Test |
|---|---|
| Tenancy | Para cada ruta de `/api/w/:wid/*` con id: usuario de otro workspace → 404 (lista de rutas generada desde el router, no a mano). |
| Roles | Matriz rol × endpoint → 403 donde corresponde. |
| Auth | Link usado o vencido → 410; 6.º pedido en 15 min → 429; rotación de sesión; logout invalida. |
| Meta write | Creación con `status≠PAUSED` → excepción; `status=DELETED`/`ARCHIVED` → excepción; no existe método DELETE. |
| Payloads | Snapshots de campaña, conjunto (incl. `cleanTargeting`), creativo (features en `OPT_OUT`, sin `standard_enhancements`), anuncio, batch de activación. |
| Escala | Cálculo de presupuesto, tope 50 %, tope del workspace, 409 si cambió. |
| Piloto | Reglas con datos fijos; protegidas excluidas; deduplicación. |
| Firmas | `signed_request` válido/ inválido. |
| Subida | `multipartStream` arma el multipart correcto en stream (preámbulo + cuerpo + cierre, `contentLength` exacto) y los offsets: `start` distinto de `start_offset` → 409 `UPLOAD_OFFSET_MISMATCH`; bloque > 10 MiB → 413 `CHUNK_TOO_LARGE`; sesión > 24 h → 410 `UPLOAD_EXPIRED`; `end = min(metaEndOffset, start + 10 MiB)`. |
| Chat | El módulo no importa `meta/write` (test de imports); un prompt "activá la campaña X" termina sin escritura en Meta. |
| CSV | Escape de fórmulas. |

## Notas para el PRD

Aplicadas en 01-PRD § Decisiones aceptadas.

Alternativa evaluada y no implementada: **Iniciar sesión con Facebook** en lugar del magic link por email.

| A favor | En contra |
|---|---|
| No hace falta dominio propio ni Resend para el login; los usuarios reales pueden entrar desde el día 1. | Obliga a tener una cuenta de Meta. |
| | Necesita el scope `email` y App Review. |
| | El login depende de Meta: si Meta cae o bloquea la app, nadie entra. |
| | Deja afuera a quienes no tienen Facebook. |
