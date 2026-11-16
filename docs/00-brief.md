# Brief — Lanzador de anuncios con IA

Fecha: 2026-11-16. Fuente: entrevista con el usuario, la app local anterior (ver `docs/legacy/inventario-app-vieja.md`) y supuestos marcados.

## Objetivo real

Que un media buyer de e-commerce lance en minutos campañas de Meta Ads con muchos creativos, copys buenos y estructura correcta, sin errores manuales, y que después la IA le diga qué pausar, qué escalar y qué creativo funciona, siempre con su aprobación.

La app anterior resolvía esto para un solo usuario en su Mac (Python local, tokens pegados en `.env`). La nueva es un SaaS web multi-cliente desplegado en Cloudflare.

## Usuarios

- **Dueño de workspace:** dueño de una marca o agencia chica. Conecta su Meta, crea productos, lanza, mira métricas.
- **Miembros:** media buyers o editores que el dueño invita. Roles: `owner`, `admin`, `editor`, `viewer`.
- **Superadmin (el usuario, Ilan):** ve todos los workspaces, invita clientes beta, ve consumo de IA.

Hoy, sin la app, hacen todo a mano en Ads Manager: crean campaña, conjunto, suben video por video, copian texto y link, revisan que no se active Advantage+ creative, y miran métricas cuenta por cuenta.

## Alcance MVP

1. Login por magic link (email), workspaces con roles e invitaciones.
2. Conectar Meta con Facebook Login for Business: elegir cuentas publicitarias, páginas, Instagram y píxeles.
3. Productos: textos, link de landing (con chequeo), CTA, UTM, precio y costo (ROAS de equilibrio).
4. Lanzador: campaña CBO nueva o conjunto nuevo en una CBO existente, con creativos subidos desde el navegador, desde un link de Google Drive o clonados de otra campaña. Simular, lanzar en pausa, verificar, activar o programar.
5. IA de copys: variantes de texto principal, título y descripción por producto y ángulo.
6. IA de creativos: etiqueta cada video o imagen (hook, ángulo, formato, idioma) y propone el nombre del anuncio. Con el tiempo muestra qué etiquetas ganan.
7. Métricas: pestaña Hoy y Métricas por cuenta, campaña y anuncio (gasto, compras, ROAS, CPA) con comparación contra el período anterior y mejores anuncios.
8. Piloto inteligente: reglas configurables + explicación de IA; propone pausar, escalar o duplicar ganadores; nada se ejecuta sin aprobación humana.
9. Lanzar por chat: el usuario describe el lanzamiento en lenguaje natural y la IA arma un borrador del lanzador para que lo confirme.
10. Historial y registro de auditoría de todo lo que se hizo en Meta.

## Fuera de alcance (MVP)

Cobro y planes pagos (el modelo de planes queda preparado), otras plataformas (TikTok, Google Ads), acciones automáticas sin aprobación, borrar campañas o anuncios, app móvil nativa, dominio propio para la app (un dominio solo para enviar email queda pendiente, ver S4), generación de imágenes o videos con IA, edición de creativos.

## Decisiones

- Plataforma: web responsive en español rioplatense.
- Hosting: Cloudflare Workers + D1 + Workflows, en `*.workers.dev`; los medios van directo a Meta, sin almacenamiento propio.
- IA: solo Workers AI para copys, etiquetado, piloto y chat (Claude más adelante).
- App de Meta nueva, tipo Business, con Marketing API y Facebook Login for Business. El usuario la crea con su login.

## Guardrails heredados de la app anterior

- Todo se crea en pausa salvo que el usuario elija activar o programar al final y la verificación dé verde.
- Subir el presupuesto de una campaña existente solo se hace a mano desde la pantalla, nunca la IA ni el chat.
- Borrar no existe en la app.
- Presupuesto máximo por campaña configurable por workspace (default US$300).
- Acciones importantes piden confirmación con el detalle de lo que pasa.

## Criterios de calidad

- **Funcionales:** cada función MVP con criterios dado/cuando/entonces en `docs/01-PRD.md`.
- **Performance:** LCP < 2,5 s; p95 de la API propia < 500 ms (excluye llamadas a Meta); error rate < 1 %.
- **Seguridad:** 0 hallazgos críticos o altos; OWASP Top 10 cubierto; tokens de Meta cifrados en reposo; aislamiento entre workspaces probado.
- **Accesibilidad:** WCAG 2.2 AA en login, lanzador, métricas y piloto.
- **Código:** lint sin errores; cobertura ≥ 80 % en lógica de negocio (armado de payloads de Meta, reglas del piloto, cálculos de métricas, permisos).
- **Señal externa:** E2E con Playwright contra la URL desplegada; lanzamiento real en una cuenta de prueba de Meta (sandbox ad account) que queda en pausa y verificada.

## Supuestos

- S1: El punto 3 del documento de origen no estuvo disponible; el alcance se basa en la app anterior y la entrevista.
- S2: Escala beta: hasta 20 workspaces y 10 usuarios concurrentes. Alcanza el free tier de Cloudflare.
- S3: Cuentas publicitarias en USD como en la app anterior; se muestra la moneda de cada cuenta y no se convierte.
- S4: Emails de magic link con Resend (plan gratis). Requiere que el usuario cree la cuenta. Sin dominio verificado, Resend solo entrega al dueño de la cuenta, así que solo el superadmin puede iniciar sesión. Decisión pendiente: comprar un dominio (~US$10/año, costo a aprobar) antes de invitar clientes beta.
- S5: Workers AI no necesita clave de nadie; el consumo se limita con créditos de IA por workspace (por día y por mes) más un tope global diario.
- S6: Mientras Meta no apruebe el App Review, solo usuarios agregados como testers de la app de Meta pueden conectar su cuenta.
- S7: Nombre de trabajo del producto: "Lanzador".
