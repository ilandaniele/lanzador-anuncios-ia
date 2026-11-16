# PRD — Lanzador de anuncios con IA

## Resumen

Lanzador es un SaaS web para marcas y agencias de e-commerce que lanza campañas de Meta Ads con muchos creativos en minutos, escribe los copys con IA, etiqueta los creativos y propone qué pausar o escalar. Toda acción sobre Meta queda registrada y las acciones de riesgo exigen aprobación humana.

## Problema

Lanzar una campaña con 10–30 creativos en Ads Manager lleva 30–60 minutos de clics repetidos y genera errores: link equivocado, Advantage+ creative activado sin querer, conjunto con el público viejo, presupuesto mal puesto. Después, decidir qué pausar exige mirar cuenta por cuenta. La app local anterior resolvía el lanzamiento para un solo usuario, pero no era compartible, guardaba tokens en texto plano y no tenía IA.

## Objetivo de negocio

Validar con 5–20 clientes beta que pagarían por el producto. Preparar el modelo de planes para cobrar en la fase 2.

## Métricas de éxito

- Tiempo de lanzamiento de 20 creativos: < 5 minutos desde abrir el lanzador hasta "verificado".
- 95 % de lanzamientos sin error de verificación.
- ≥ 60 % de los copys usados vienen de sugerencias de la IA (editadas o no).
- ≥ 50 % de las propuestas del piloto se aprueban.
- Retención semanal de workspaces beta ≥ 70 % a las 4 semanas.

## Usuarios y roles

| Rol | Puede |
|---|---|
| `superadmin` (global) | Ver todos los workspaces, crear invitaciones beta, ver consumo de IA y de Meta, desactivar un workspace. No ve tokens. |
| `owner` | Todo lo del workspace: conectar o desconectar Meta, miembros y roles, ajustes, topes de presupuesto, borrar el workspace. |
| `admin` | Todo salvo borrar el workspace y cambiar al owner. |
| `editor` | Productos, lanzar, aprobar acciones del piloto, pausar y activar, escalar presupuesto a mano. |
| `viewer` | Ver métricas, historial y productos. No ejecuta nada en Meta. |

## Funciones MVP

### F1 Auth y workspaces (P0)

Historia: como dueño de marca, quiero entrar con mi email sin contraseña y crear mi workspace, para empezar sin fricción.

- Dado un email invitado, cuando pide el link, entonces recibe un email con un link de un solo uso que vence a los 15 minutos.
- Dado un link usado o vencido, cuando lo abre, entonces ve "Link vencido" y un botón para pedir otro.
- Dado un usuario logueado, cuando crea un workspace, entonces queda como `owner`.
- Dado un `owner`, cuando invita un email con un rol, entonces el invitado entra al workspace con ese rol al aceptar.
- Dado un usuario de otro workspace, cuando pide cualquier recurso ajeno por id, entonces recibe 404.
- Dado más de 5 pedidos de link por email en 15 minutos, entonces recibe 429.
- Beta cerrada: solo emails con invitación beta del `superadmin` pueden crear workspace.

### F2 Conectar Meta (P0)

Historia: como dueño, quiero conectar mi Business Manager con un clic, para no pegar tokens.

- Dado un `owner` o `admin`, cuando toca "Conectar Meta", entonces pasa por Facebook Login for Business y vuelve con la conexión guardada.
- Dado el regreso del login, entonces la app lista cuentas publicitarias, páginas, cuentas de Instagram y píxeles a los que el token tiene acceso, y el usuario elige cuáles habilita.
- Dado un token, entonces se guarda cifrado y nunca se devuelve al navegador.
- Dado un token vencido o revocado, cuando falla una llamada con error de sesión de Meta, entonces la conexión pasa a "Reconectar" y se avisa en la pestaña Hoy.
- Dado "Desconectar", entonces se borra el token y se revocan los permisos en Meta.

### F3 Productos (P0)

Historia: como editor, quiero cargar cada producto una vez, para que todos los anuncios usen el mismo link, textos y UTM.

- Campos: nombre, landing URL, texto principal, título, descripción, CTA, parámetros UTM, precio, costo, moneda.
- Dado precio y costo, entonces muestra ROAS de equilibrio = precio / (precio − costo) y ganancia estimada por venta.
- Dado "Probar landing", cuando la URL no responde 2xx/3xx en 10 s, entonces muestra el error y el lanzador bloquea ese producto.

### F4 Lanzador (P0)

Historia: como editor, quiero lanzar 20 creativos en una campaña nueva o en una CBO que ya corre, para no hacerlo a mano.

- Pasos: cuenta y píxel → estructura (CBO nueva o conjunto nuevo en CBO existente) → producto y copys → creativos → presupuesto, países y programación → revisión.
- CBO nueva: presupuesto diario, estrategia de puja (mayor volumen o límite de costo con monto), países (default `AR`), evento de optimización (default compra). Nombres automáticos `CBO dd-mm` y `CONJ n`, editables con `{producto}`, `{fecha}`, `{hora}`.
- Conjunto en CBO existente: copia el público, el evento de optimización y, si corresponde, el límite de costo del conjunto más nuevo de esa campaña.
- Creativos: subir archivos desde el navegador (video e imagen), pegar link de carpeta de Google Drive, o clonar anuncios elegidos de otra campaña (mismo Business y misma página).
- Todos los anuncios salen con Advantage+ creative y mejoras automáticas desactivadas, salvo que el workspace las active en Ajustes.
- "Simular" valida todo y muestra lo que se va a crear sin llamar a Meta para escribir.
- Dado un presupuesto mayor al tope del workspace, entonces bloquea con mensaje.
- Dado el lanzamiento, entonces todo se crea en pausa; se ve el progreso por anuncio en vivo; al final corre la verificación: cada anuncio existe, tiene el link del producto, la página e Instagram correctos, las mejoras desactivadas y el video procesado.
- Final: "Dejar en pausa", "Activar ahora" (solo si la verificación dio verde) o "Programar" (hora de inicio).
- Si falla un anuncio, el resto sigue; se puede reintentar solo los fallidos.
- Errores de límite de Meta (códigos 17, 613, 80004): la app espera y reintenta con backoff; no falla el lanzamiento.

### F5 IA de copys (P0)

Historia: como editor, quiero variantes de copy por ángulo, para probar mensajes sin escribirlos.

- Dado un producto y un ángulo (dolor, beneficio, prueba social, oferta, urgencia, o libre), cuando toca "Generar", entonces recibe 5 variantes de texto principal, título y descripción en español rioplatense, dentro de los límites de caracteres recomendados por Meta.
- Puede editar, marcar favoritas y guardarlas en el producto.
- Los copys no prometen resultados de salud, dinero ni otras afirmaciones que violen las políticas de publicidad de Meta; la IA marca el riesgo si lo detecta.
- Cada workspace tiene un tope mensual de uso de IA; al llegar, muestra el aviso y deja de generar.

### F6 IA de creativos (P1)

Historia: como editor, quiero que la app etiquete mis creativos, para saber qué tipo de hook gana.

- Dado un creativo subido, entonces la IA genera etiquetas: hook (primeros 3 s), ángulo, formato (UGC, demo, testimonio, estático), idioma, texto en pantalla sí o no.
- Propone el nombre del anuncio con esas etiquetas; el usuario puede cambiarlo.
- En Métricas, el reporte "Qué gana" agrupa ROAS y CPA por etiqueta.

### F7 Métricas y Hoy (P0)

Historia: como dueño, quiero ver en una pantalla cómo va hoy cada cuenta, para decidir rápido.

- Hoy: gasto de hoy vs ayer por cuenta, alertas (conexión vencida, cuenta con problema de pago o deshabilitada, anuncios rechazados), propuestas pendientes del piloto, últimos lanzamientos.
- Métricas: gasto, compras, valor, ROAS, CPA, CTR, CPM por cuenta, campaña, conjunto y anuncio; rangos preset y personalizados; comparación contra el período anterior; filtro por cuenta y producto; exportar CSV.
- Mejores anuncios: top por ROAS con gasto mínimo, con botón "Usar en un lanzamiento" (clonar).
- Acciones manuales: pausar y activar; escalar presupuesto de campaña +X % (tope 50 % por acción, respeta el tope del workspace).
- Los datos se cachean; un dato tiene como máximo 15 minutos de antigüedad y se ve la hora de actualización.

### F8 Piloto inteligente (P1)

Historia: como dueño, quiero que la app me proponga qué pausar o escalar con su razón, para no revisar todo a mano.

- Reglas configurables por workspace (ejemplos: pausar anuncio con gasto ≥ 2× CPA objetivo y 0 compras; escalar campaña con ROAS ≥ 1,3× el de equilibrio durante 3 días).
- Corre cada 6 horas y a pedido. Genera propuestas con datos y una explicación corta de la IA.
- Cada propuesta se aprueba o descarta. Aprobar ejecuta la acción en Meta y la registra.
- Las campañas marcadas como protegidas no reciben propuestas.
- La IA nunca ejecuta sola. Escalar presupuesto desde una propuesta exige que la apruebe un `editor` o superior, con el monto final a la vista.

### F9 Lanzar por chat (P1)

Historia: como editor, quiero escribir "lanzá el producto X con la carpeta de Drive Y a 50 dólares en AR y UY", para no recorrer el formulario.

- El chat entiende el pedido, hace preguntas si falta algo y termina siempre en un borrador del lanzador lleno.
- El chat no lanza, no activa y no cambia presupuestos: abre el lanzador en el paso de revisión.

### F10 Historial y auditoría (P0)

- Lista de lanzamientos con estado, anuncios creados, errores y link "Ver en Meta".
- Registro de acciones: quién, qué, cuándo, sobre qué objeto de Meta, origen (manual, piloto, chat), resultado.
- Desde un lanzamiento en pausa se puede activar.

## Fuera de alcance

Cobro, planes pagos, otras plataformas de anuncios, ejecución automática sin aprobación, borrar objetos en Meta, app móvil nativa, dominio propio, generación de imágenes o video con IA, edición de video, reportes por email, API pública.

## Requisitos no funcionales

- **Performance:** LCP < 2,5 s en 4G; p95 de endpoints propios < 500 ms; las llamadas a Meta corren en segundo plano con progreso visible.
- **Seguridad:** OWASP Top 10; tokens de Meta y de Google cifrados con AES-GCM; cookies de sesión `HttpOnly; Secure; SameSite=Lax`; CSRF en mutaciones; rate limit por IP y por usuario; aislamiento por workspace en cada query.
- **Privacidad:** guardamos solo emails de usuarios y datos de cuentas publicitarias necesarios; política de privacidad y endpoint de borrado de datos que exige Meta.
- **Accesibilidad:** WCAG 2.2 AA en flujos principales.
- **Idioma:** español rioplatense; textos centralizados para traducir después.
- **Costo:** cabe en el free tier de Cloudflare para la escala beta; la IA tiene tope por workspace.

## Supuestos y riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Meta tarda o rechaza el App Review de `ads_management` y Advanced Access | Beta con testers de la app; preparar screencast y política de privacidad desde el día 1 |
| R2 | Videos grandes (> 100 MB) no entran en un request del Worker | Subida directa del navegador a R2 por partes (multipart con URL firmadas) y luego subida a Meta desde el job |
| R3 | Límites de la API de Meta por cuenta | Backoff, cola por cuenta, cache de insights |
| R4 | Costo de IA de un cliente | Tope mensual por workspace y registro de consumo |
| R5 | Cuota diaria compartida de Cloudflare | Assets estáticos fuera del Worker, cache, rate limit |
| R6 | Política de anuncios en copys de IA | Prompt con políticas y marca de riesgo |
