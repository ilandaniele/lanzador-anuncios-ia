# Inventario de la app vieja (Cargador de anuncios, Python)

Este documento junta todo el conocimiento de dominio de la app local vieja antes de borrarla y reescribirla como web app en Cloudflare Workers. Se armó leyendo `app.py` (~2067 líneas, servidor HTTP con la stdlib), `subir.py` (CLI), `static/index.html` (SPA de una sola página), `LEEME.md`, `LEEME-INSTALAR.txt`, `iniciar.command` y `.env.ejemplo`. No se tocó ningún archivo viejo y no hay secretos copiados acá (el `.env` no existe; donde habría un valor sensible va `[REDACTED]`). Lo que no sale literal del código está marcado con "(inferido)".

## 0. Resumen de arquitectura de la app vieja

- Servidor `ThreadingHTTPServer` de la stdlib en `127.0.0.1:8765` (puerto por `PORT` del entorno). Sirve `static/index.html` y una API JSON bajo `/api/*`. En el HTML se reemplaza el marcador `__HUMAN__` por el `HUMAN_TOKEN` al momento de servirlo.
- Una CLI (`subir.py`) importa `app.py` como módulo y reutiliza toda la lógica. Está pensada para que la use Claude Code desde la terminal.
- Solo hay dos Business Managers soportados, `BM1` y `BM2` (`bms()` los lee del `.env`). Es un límite duro del código.
- Variables del `.env`: `META_APP_ID`, `META_APP_SECRET`, `BM1_NAME`, `BM1_TOKEN`, `BM2_NAME`, `BM2_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, y opcionales `PORT`, `MAX_BUDGET_USD` (default 300), `GRAPH_VERSION` (default `v24.0`), `CHUNK_MB` (default 20). Todos los valores quedan en `[REDACTED]` en este documento.
- Persistencia: archivos JSON en `data/` con copia `.bak` del estado anterior en cada escritura. Cachés y jobs en memoria.
- Zona horaria fija `AR_TZ` = UTC-3 (Argentina). Todo lo que dice "hoy" se calcula con esa hora.
- Pensada para Mac: los selectores de carpeta y ZIP usan `osascript` (`/api/pick_folder`, `/api/pick_zip`) y la detección de Drive de escritorio mira `~/Library/CloudStorage`. En Windows no andaría tal cual (inferido).

## 1. Funciones por pestaña

La SPA tiene seis pestañas: Hoy, Subir anuncios, Métricas, Historial, Productos, Ajustes. Arriba hay una píldora de conexión (usa `/api/accounts`, muestra "Sin conexión" si falla) y un botón "Actualizar" que llama `POST /api/refrescar` (vacía la caché en memoria). El router es por hash (`#hoy`, `#subir`, etc.).

Convenciones de la UI que conviene mantener:
- Todo lo importante pasa por un modal de confirmación (`ask`) con el detalle de lo que va a pasar: pausar, activar, escalar, activar lote, descartar (borrar), aplicar piloto, desconectar Google, restaurar copia.
- Colores del ROAS: si el producto tiene ROAS de equilibrio (`be`), verde si `roas >= be*1.2`, amarillo si `>= be`, rojo si no. Sin `be`: verde `>= 2`, amarillo `>= 1`, rojo si no.
- Los enlaces "Ver en Meta" apuntan a `adsmanager.facebook.com`.
- Se recuerda en `localStorage` la última cuenta usada, el último píxel por cuenta (`mem`), el estado final elegido y el último job (`lastJob`) para reanudar el seguimiento si se recarga la página.

### 1.1 Hoy

Entradas: ninguna, carga en paralelo `metricas?rango=today`, `metricas?rango=yesterday`, la simulación del piloto (`POST /api/piloto` con `aplicar=false`), `/api/salud` y `/api/historial`.

Salidas:
- Hero con gasto total, compras, ROAS y CPA de hoy, comparados contra ayer, más tarjetas por BM.
- "Qué hacer ahora": lista de acciones sugeridas con botones de pausar y escalar (los de pausa salen de las reglas del piloto; los de escala de las reglas de escalar). Además la UI agrega por su cuenta una sugerencia "+30%" para campañas con `roas >= be*1.2` (o 2 si no hay `be`), `gasto >= 10`, que no estén protegidas y que no estén ya en el plan. Esta lógica es del frontend, distinta de la del piloto (ver sección 4 y 10).
- Salud de cuentas (ver sección 3.5).
- Los últimos 5 lanzamientos con botón "Activar" para los que están en pausa.
- Un punto rojo en la pestaña y en el título del documento con la cantidad de pausas sugeridas más cuentas con problemas.
- Auto-refresco tras 5 minutos de inactividad (se chequea cada 60 s).

Acciones desde esta pestaña: `POST /api/estado` (pausar/activar campaña), `POST /api/escalar`, `POST /api/hist/activar`, `POST /api/hist/descartar`.

### 1.2 Subir anuncios

Es el formulario más grande. Cinco pasos numerados más un panel lateral con resumen y checklist, y una barra inferior con "Simular" y "Subir y activar".

Paso 1, cuenta: select agrupado por BM (viene de `/api/accounts`), con filtro de texto si hay más de 6 cuentas. Al elegir cuenta se llama `/api/account?bm=&id=` (píxeles, páginas, campañas) y `/api/instagram?bm=&page=` (cuentas de Instagram de la página).

Paso 2, configuración:
- Modo: "Campaña nueva (CBO)" o "Conjunto nuevo en campaña existente". En modo existente se deshabilitan presupuesto, nombre de campaña, puja y países, porque se copian del conjunto más nuevo (`/api/reference` devuelve el resumen para mostrarlo).
- Píxel (recuerda el último por cuenta; si no, `template.default_pixel`).
- Presupuesto diario con chips 20, 30, 50, 100 (default `template.default_budget`).
- Estrategia de puja: "Mayor volumen" o "Límite de costo" (cost cap) con monto.
- Países (default `AR`, separados por coma).
- Página de Facebook e Instagram (se lee en vivo).
- Nombres de campaña y de conjunto, con chips `{producto}`, `{fecha}`, `{hora}`.
- Inicio: "Al activar" o "Programar" (campo `datetime-local` con chips medianoche, +2h, +4h, +6h; hora de Argentina).
- Estado final: "Dejarla activa" (se verifica y se activa sola) o "Dejarla en pausa".

Paso 3, producto: select con los productos no archivados y una vista previa tipo anuncio de Facebook (`adMock`) con el link de destino.

Paso 4, anuncios, con dos orígenes:
- "Desde una carpeta": escribir/pegar ruta, elegir carpeta (osascript), elegir ZIP, pegar link de Drive (abre el panel de Drive) o usar los atajos de ZIP recientes. Llama `GET /api/scan?path=` y muestra miniaturas por lote, con aviso si un lote tiene menos de 5 o más de 10 anuncios. Cada subcarpeta con medios es una campaña distinta.
- "Copiar anuncios" (clonar ganadores): cuenta origen y campaña origen (del mismo BM que el destino), rango, y una galería con selección (`/api/anuncios`), botón "Marcar los de ROAS >= 2" y "Ver anuncio" (`/api/preview`). Solo se pueden elegir anuncios con `story_id`.

Paso 5, resultado: log del job y lista de verificación por lote, con botones "Activar" y "Descartar" si quedó en pausa.

Salidas y endpoints: `POST /api/dryrun` (simulacro, no crea nada en Meta), `POST /api/upload`, `POST /api/clonar_sim`, `POST /api/clonar`. Todos devuelven `{job}` y la UI hace polling de `GET /api/job?id=` cada 2 s. Si algo falta, la UI lista "Falta: ..." (`missing()`) y deshabilita los botones.

Cuerpo que arma `goUpload`: `bm`, `account_id`, `cuenta_nombre`, `modo` (`nueva` o `existente`), `campaign_id`, `pixel_id`, `presupuesto`, `page_id`, `instagram_id`, `nombre_campana`, `nombre_conjunto`, `inicio`, `producto` (el objeto entero), `carpeta`, `anuncios` (solo clonar: `{ad_id, nombre, story_id}`), `estado` (`ACTIVE` o `PAUSED`), `paises`, `puja` (`{tipo:"cost_cap", monto}` o null).

### 1.3 Métricas

Entradas: rango por chips (Hoy, Ayer, 7, 14, 30 días, Este mes, Personalizado con desde/hasta). Rangos válidos en el backend: `today`, `yesterday`, `last_7d`, `last_14d`, `last_30d`, `this_month` y `custom:YYYY-MM-DD:YYYY-MM-DD` (máximo 400 días, no puede ser futuro).

Salidas:
- Hero con totales y comparación contra el período anterior.
- Barras apiladas de gasto por día y por BM (no se muestra para hoy ni ayer).
- Tabla de gasto por producto (campañas, gasto, compras, ROAS, equilibrio, ganancia estimada).
- "Mejores anuncios" de todas las cuentas (rango 7/14/30, gasto mínimo default 10, botón "Copiar" que lleva a la pestaña Subir con ese anuncio preseleccionado, y botón "Ver" para la vista previa). Necesita otra cuenta del mismo BM como destino.
- "Campañas a revisar": umbrales editables `r1` (default 15, sin ventas) y `r2` (ROAS menor a 1, con gasto >= 30), resalta en rojo las campañas ACTIVE que cumplen, botón "Pausar marcadas" (llama `/api/estado` en serie).
- Tarjetas por BM y por cuenta, tabla de campañas con búsqueda y filtros (Todas, Activas, Pausadas, Con ventas, Sin ventas), candado para proteger del piloto, "+%" de presupuesto (`/api/escalar`), pausar/activar, etiquetas de producto y "subió hace N h".
- "Copiar resumen" (texto al portapapeles) y "Descargar CSV" (columnas `cuenta, campaña, estado, producto, presupuesto, gasto, compras, cpa, roas, ganancia_est`; con protección contra inyección de fórmulas: si la celda empieza con `=`, `+`, `-` o `@` se le antepone una comilla simple).

### 1.4 Historial

Entradas: filtro por estado (Todos, En pausa, Activados, Descartados). Salidas: tabla de lanzamientos (`/api/historial`) con botones "Activar" y "Descartar" para los que están en `pausa` (y "Descartar" también para `error` con `campaign_id`, para limpiar lo que quedó a medias), más la tabla de acciones (`/api/acciones`, últimas 60) con origen, acción, campaña y detalle.

### 1.5 Productos

CRUD de productos (ver sección 5): buscador, checkbox "Ver archivados", tarjetas con título, texto, CTA, link, ROAS de equilibrio y cantidad de usos (contando el historial con ese nombre de producto y estado distinto de `descartado`). Acciones por tarjeta: Usar (salta a Subir con el producto elegido), Editar, Duplicar (agrega " (copia)" al nombre), Archivar/Desarchivar. El editor es un modal con vista previa en vivo estilo Meta, contadores de caracteres, botón "Probar" (landing, `/api/link-check`), botón "UTM estándar" y cálculo del ROAS de equilibrio.

### 1.6 Ajustes

- Conexión Meta por BM: `/api/conexion` devuelve por BM `nombre`, `token_ok`, `usuario`, `cuentas` (cantidad), `paginas`, `error`. Botón "Cambiar token"/"Reconectar con un token nuevo" abre un modal para pegar el token (`POST /api/token`). Las instrucciones dicen: crear un token de usuario del sistema para la app "Cargador de ads en bulk", expiración "Nunca", con permisos `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`.
- Reglas del piloto: formulario para las tres reglas, "Guardar reglas", "Simular ahora", "Aplicar ahora" (ver sección 4).
- Drive: estado de Google (configurado/conectado/email) y de Drive para escritorio, y botón que abre el panel de Drive (ver sección 6).
- Copia de seguridad: `GET /api/backup` descarga un JSON; `POST /api/restore` lo restaura (deja `.bak`).
- Seguridad y límites: lista de texto con las reglas de la sección 7.
- Glosario: ROAS, ROAS de equilibrio, CPA, ganancia estimada, piloto.

### 1.7 CLI (`subir.py`)

Comandos: `cuentas, productos, producto-crear, campanas, subir, historial, activar, pausar, metricas, resumen, salud, top, piloto, proteger, reglas, ganadores, clonar, acciones, backup`.
- `find_account` busca por id o por nombre (con fallback a substring). `find_product` ignora archivados.
- `pick_page_ig`: usa la única página/Instagram si hay una sola; si no exige `--pagina`/`--instagram`. `pick_pixel` exige `--pixel` salvo que la cuenta tenga exactamente un píxel.
- `base_req`: estado `PAUSED` si pasan `--pausa`, si no `ACTIVE`; presupuesto default 30.
- `resumen`: defaults `gasto-sin-ventas 15`, `roas 2`, compara ayer y últimos 7 días.
- `piloto --aplicar` solo pausa; escalar no se aplica desde la CLI. `reglas` solo informa.
- `descartar` y `escalar` fueron removidos: salen con un mensaje de bloqueo.
- `cmd_pausar` busca la campaña en todos los BMs y registra origen `claude`.
- `ganadores` y `clonar` aceptan `--rango` (de `RANGOS`) y `--roas` (default 2). En `clonar`, si se pasan `--anuncios` con ids, pisan el filtro de ROAS. La CLI exige el mismo BM en origen y destino.
- La CLI nunca setea `_ctx.human`, por eso queda bloqueada para subir presupuestos, borrar, guardar tokens, guardar credenciales de Google o desconectar Google.

## 2. Flujo exacto de subida a Meta

Versión de API: `VERSION = ENV.get("GRAPH_VERSION", "v24.0")`. Hosts: `graph.facebook.com` para todo y `graph-video.facebook.com` para subir videos. Autenticación: el `access_token` del BM va en el cuerpo form (POST) o en la query (GET). Parámetros que no son strings se serializan como JSON. Timeout de 120 s (900 s para multipart de archivos).

### 2.1 Invariante central y barreras

- Todo lo nuevo se crea en `PAUSED`. `graph()` tiene una lista `CREATE_EDGES` (`/campaigns`, `/adsets`, `/ads`, `/adcreatives`, `/advideos`, `/adimages`); si se intenta crear en uno de esos edges con un estado distinto de `PAUSED`, tira "Lo nuevo se crea en pausa...".
- Barrera por código: un POST a un edge que no es de creación y que lleva `daily_budget` o `lifetime_budget`, o `status` = `DELETED`/`ARCHIVED`, llama `require_human`. Sin `X-Human` válido tira error. Es la protección real contra que Claude Code o la CLI suban presupuestos o borren.
- Después de crear y verificar, recién se activa (en el mismo job si el estado final elegido es `ACTIVE`, o a mano desde Hoy/Historial).

### 2.2 Lectura previa (`make_ctx`)

En este orden:
1. Valida que vengan `page_id` y luego `ig_id`.
2. `GET {act}` con fields `name, account_status, currency, funding_source_details`. Exige `account_status == 1` y `currency == "USD"`. Si no hay `funding_source_details` avisa que falta medio de pago (warning, no error).
3. Toma el template del BM: `templates.json[bm]` (clave `adset`, `campaign`, `creative`; ver sección 8).
4. Modo existente:
   - `reference_adset`: `GET {campaign}/adsets` con fields `name, targeting, promoted_object, attribution_spec, optimization_goal, billing_event, bid_amount, bid_constraints`, filtrado por `effective_status` en `ADSET_STATUS`, ordenado por id descendente (el más nuevo primero).
   - Copia `optimization_goal`, `billing_event`, `attribution_spec`, `targeting` y `promoted_object.custom_event_type`.
   - `n_next = len(rows) + 1` para el nombre `CONJ n`.
   - `GET {campaign}?fields=bid_strategy`. Si es `COST_CAP` o `LOWEST_COST_WITH_BID_CAP`, copia `bid_amount` del conjunto de referencia (error si no hay). Si es `LOWEST_COST_WITH_MIN_ROAS`, copia `bid_constraints` (error si falta).
5. Modo nuevo: si `puja.tipo == "cost_cap"`, el monto debe estar entre 0.5 y 1000 (USD), se guarda en centavos y la estrategia es `COST_CAP`.
6. El targeting base se limpia con `clean_targeting` (solo deja `age_min`, `age_max`, `genders`, `geo_locations`, `excluded_geo_locations`, `custom_audiences`, `excluded_custom_audiences`, `flexible_spec`, `exclusions`, `brand_safety_content_filter_levels`, `publisher_platforms`, `facebook_positions`, `instagram_positions`, `messenger_positions`, `audience_network_positions`, `device_platforms`, `user_os`, `locales`; y si trae `targeting_automation.advantage_audience` lo conserva como `targeting_automation`). Así no se arrastran campos que Meta rechaza.
7. Países: solo se pisan en modo nuevo; códigos de 2 letras, en mayúsculas, separados por coma, escritos en `geo_locations.countries`.

### 2.3 Creación del contenedor (`create_container`)

Presupuesto validado entre 1 y `MAX_BUDGET` (default 300), enviado como `daily_budget` en centavos (CBO: el presupuesto va en la campaña).

1. Campaña (solo modo nuevo): `POST {act}/campaigns` con `name`, `objective` (de `template.campaign.objective`), `status=PAUSED`, `buying_type=AUCTION`, `special_ad_categories=[]`, `bid_strategy` (del ctx si hay cost cap; si no `template.campaign.bid_strategy`), `daily_budget`.
2. Conjunto: `POST {act}/adsets` con `name`, `campaign_id`, `status=PAUSED`, `optimization_goal`, `billing_event`, `targeting`, `promoted_object={pixel_id, custom_event_type}` (default `PURCHASE`), `attribution_spec`, y opcionales `start_time`, `bid_amount`, `bid_constraints`.
3. Si el conjunto falla, el error queda en `created["error"]` y se frena ese lote (la campaña ya creada queda en pausa).

Nombres: `fmt_name` reemplaza `{producto}`, `{fecha}`, `{hora}`. Default campaña `CBO dd-mm` (con sufijo " - <subcarpeta>" si hay varios lotes), conjunto `CONJ n`.

Hora de inicio (`start_time_of`): se ingresa `YYYY-MM-DDTHH:MM` en hora Argentina, debe ser futura, y se emite como `%Y-%m-%dT%H:%M:00-0300`. Vacío significa "al activar".

### 2.4 Subida de medios (`prep_media`)

Los medios de un lote se suben en paralelo con un `ThreadPoolExecutor` de 3 workers.

Videos:
- Archivos de más de `CHUNK_FROM` (20 MB por defecto, `CHUNK_MB`) usan subida resumable (`upload_video_resumable`) contra `graph-video.facebook.com`:
  1. `POST {act}/advideos` con `upload_phase=start` y `file_size`. Respuesta: `upload_session_id`, `video_id`, `start_offset`, `end_offset`.
  2. Bucle `POST {act}/advideos` multipart con `upload_phase=transfer`, `upload_session_id`, `start_offset` y el trozo en la parte `video_file_chunk`, hasta que `start_offset == end_offset`.
  3. `POST {act}/advideos` con `upload_phase=finish`, `upload_session_id` y `title`.
- Archivos chicos: un solo POST multipart a `/{ver}/{act}/advideos` con el campo `source`.
- Extensiones aceptadas: `VIDEO_EXT = {.mp4, .mov, .m4v}`.

Espera de procesamiento (`wait_video`): `GET {video_id}?fields=status` cada 4 s, hasta 200 intentos (unos 13 minutos). `video_status == "ready"` termina; `error` tira excepción con el `processing_phase`.

Miniatura (`thumb`): `GET {video_id}/thumbnails`, hasta 10 intentos cada 3 s; elige la `is_preferred` o, si no, la primera `uri`. Se usa como `image_url` del creativo.

Chequeo de formato: después de procesar, `GET {video_id}?fields=format`; si el formato más grande es más ancho que alto, avisa "AVISO ... horizontal ... conviene vertical 9:16 o 4:5". Es solo un warning.

Imágenes: `POST /{ver}/{act}/adimages` multipart con el campo `filename`; la respuesta trae `images.<nombre>.hash`. Extensiones: `IMAGE_EXT = {.jpg, .jpeg, .png}`.

No se pueden mezclar videos e imágenes en un mismo lote (error en `scan_folder`).

### 2.5 Creativo y anuncio

Creativo (`make_creative`): `POST {act}/adcreatives`.
- CTA: `{type: prod.cta o template.creative.call_to_action_type, value: {link}}`.
- Video: `object_story_spec = {page_id, instagram_user_id (si hay), video_data: {video_id, image_url (miniatura), title, message, link_description, call_to_action}}`.
- Imagen: `object_story_spec.link_data = {image_hash, link, name, message, description, call_to_action}`.
- `degrees_of_freedom_spec.creative_features_spec = all_features_off(tpl)`: copia profunda del `creative_features_spec` del template con todo `enroll_status` puesto en `"OPT_OUT"` recursivamente y quitando `standard_enhancements` (feature deprecada, `DEPRECATED_FEATURES`). Es para que Meta no active mejoras automáticas de Advantage+.
- `contextual_multi_ads = {"enroll_status": "OPT_OUT"}`.
- `url_tags = prod.utm.lstrip("?& ")` si el producto tiene UTM.

Anuncio: `POST {act}/ads` con `name` (nombre del archivo sin extensión), `adset_id`, `status=PAUSED`, `creative={creative_id}`, `tracking_specs=[{"action.type": ["offsite_conversion"], "fb_pixel": [pixel]}]`.

### 2.5.1 Orden completo de `run_upload`

1. `make_ctx` (validaciones de 2.2).
2. Exige que el producto tenga `titulo`, `texto` y `link`.
3. `check_link`: debe ser `https`; GET con timeout de 10 s y User-Agent tipo Mozilla; 401/403/429 cuentan como "ok blando"; un 4xx/5xx corta el proceso; si la URL no responde (`ok=None`) solo avisa.
4. `scan_folder` (ruta, URL de Drive o ZIP; ver sección 6).
5. En modo existente solo se permite un lote.
6. Aviso de carpeta duplicada: busca en el historial lotes con el mismo `carpeta` y estado `pausa` o `activado`.
7. Aviso si un lote tiene menos de 5 o más de 10 anuncios.
8. Por cada lote: `create_container`, subir medios en paralelo, y por cada archivo crear creativo y anuncio.
9. Registra `created["expected"]` con lo que se espera encontrar.
10. `finish_batch`.

Fallos parciales: lo ya creado queda en `PAUSED` y el mensaje dice "Lo que ya se creó quedó en pausa".

### 2.6 Verificación (`verify`)

Relee todo desde Meta:
- Campaña: `name, status, daily_budget, objective, bid_strategy`.
- Conjunto: `name, status, promoted_object, optimization_goal, start_time, bid_amount, targeting`.
- Anuncios: `name, status, effective_status, issues_info, creative{object_story_spec, effective_object_story_id, degrees_of_freedom_spec}`.

Chequeos (cada uno aparece como un `{ok, text}` en la lista de verificación de la UI):
- Campaña en `PAUSED` y presupuesto igual al esperado (solo modo nuevo).
- Conjunto en `PAUSED`.
- `start_time` igual al esperado.
- Si es cost cap: estrategia `COST_CAP` y `bid_amount` esperado.
- Países iguales a los esperados (solo modo nuevo).
- Píxel igual al esperado.
- `optimization_goal == "OFFSITE_CONVERSIONS"`.
- Cantidad de anuncios igual a `n_ads`.
- El link de destino es el mismo en todos los anuncios y la landing responde.
- Título, mensaje y link coinciden con el producto; anuncio en `PAUSED` y sin `issues_info`. En modo clon, en vez de eso, `effective_object_story_id` debe estar en `story_ids`.
- Ningún feature del creativo tiene `enroll_status == "OPT_IN"`.

### 2.7 Activación

`finish_batch` con `dry=True` no crea nada, solo arma el plan. Si no es dry: corre `verify`, llama `hist_add` y, si el estado pedido es `ACTIVE` y todos los chequeos dieron OK, corre `activar_hist` y luego `verify_active`.

`activar_hist(id)`:
- El lote debe estar en estado `pausa` y tener `adset_id`.
- `POST status=ACTIVE` sobre la campaña (si es nueva), el conjunto y cada anuncio, uno por uno.
- Si falla a medias tira "Se activaron X de Y... Volvé a tocar Activar" (no hay rollback; el reintento reactiva todo).
- Si sale bien, `hist_set` a `activado` y `log_accion` con "activar lote".

`verify_active`: relee y exige que campaña (si es nueva), conjunto y todos los anuncios estén en `ACTIVE`. El mensaje distingue "programada" de "corriendo".

`descartar_hist(id)`: exige humano; `POST status=DELETED` sobre el conjunto (modo existente) o la campaña (modo nuevo); el lote pasa a `descartado`.

### 2.8 Flujo de clonado (`run_clone`)

- Mismo `make_ctx` y mismo contenedor.
- Cada anuncio a copiar debe traer `story_id` (`creative.effective_object_story_id` del original). El prefijo de ese `story_id` (antes del `_`) debe coincidir con el `page_id` elegido; si no, error "usa una publicación de otra página". Por eso clonar solo sirve dentro de la misma página (y, en la práctica, del mismo BM).
- Nombres default: campaña "CBO dd-mm ganadores", conjunto `CONJ n`.
- Creativo: `POST {act}/adcreatives` con `name`, `object_story_id`, `degrees_of_freedom_spec.creative_features_spec = all_features_off(tpl)` y `contextual_multi_ads` en `OPT_OUT`. Reutiliza la publicación original, así se conservan likes y comentarios (social proof).
- Anuncio con los mismos `tracking_specs`. Verificación con `story_ids`. Misma activación que en 2.7.
- `campaign_ads` (la fuente de la galería) trae `{campaign}/ads` con fields `name, effective_status, adset{name}, creative{effective_object_story_id, thumbnail_url}` (miniatura 480x480) y cruza con `{campaign}/insights` a nivel `ad`.

### 2.9 Escala y cambios de estado fuera del lote

- `set_campaign_status(bm, id, status)`: `ACTIVE` y `PAUSED` se permiten sin humano; cualquier otro estado exige humano. Registra en `acciones.json`.
- `escalar` (ver 4.4) exige humano.

## 3. Métricas e insights

### 3.1 Campos y rangos

- `INSIGHT_FIELDS = "spend,actions,action_values,purchase_roas"`.
- `range_dates` calcula con "hoy" de Argentina: `last_Nd` es de hoy-N a hoy-1 (excluye hoy), `this_month` es desde el día 1 hasta hoy, `yesterday` es hoy-1.
- `range_params` produce `date_preset` para los presets o `time_range={since, until}` para custom.
- `prev_range` devuelve el período anterior de igual largo (None para `today`).
- No hay ventana de atribución explícita en la consulta; se usa la default de Meta (inferido: lo que devuelva la cuenta).

### 3.2 Compras y ROAS

`_purch` toma `omni_purchase` y, si no existe, `purchase`, tanto de `actions` como de `action_values`. ROAS = valor / gasto redondeado a 2 decimales. CPA = gasto / compras.

### 3.3 Por cuenta (`account_metrics`)

- `GET {act}/insights` con `level=campaign` y fields `campaign_id, campaign_name` más `INSIGHT_FIELDS`.
- Se cruza con `GET {act}/campaigns` (`effective_status`, `daily_budget`). Una campaña que aparece en insights pero no en la lista se marca "ARCHIVADA".
- Se asocia el producto con `product_map` (campaign_id a producto, desde el historial excluyendo `descartado`). De `product_info` salen `be` (ROAS de equilibrio) y `ganancia = valor * margen - gasto`.
- `escalado_hace_h` se muestra si se escaló hace menos de 48 h (de `escalados.json`).
- `protegida` sale de `protegidas.json`.
- Gasto diario con `time_increment=1` y field `spend`, salvo para `today` y `yesterday`.

### 3.4 Agregado (`metricas(rango)`)

Pool de 4 workers por cuenta, más totales del período anterior (`account_totals`). Devuelve `total`, `prev`, `dias`, `productos`, `cuentas`, `desde`, `hasta`, `actualizado`. Caché con clave `met:<rango>` y TTL de 60 s; la lista de cuentas se cachea 300 s.

### 3.5 Otras lecturas

- `winners(...)`: un anuncio es ganador si `roas >= min_roas` y `gasto >= min_spend`.
- `ad_preview`: `GET {ad}/previews` con `ad_format=MOBILE_FEED_STANDARD`; devuelve HTML (iframe) que la UI inyecta.
- `account_top_ads`: `GET {act}/insights` con `level=ad` y fields `ad_id, ad_name, campaign_id, campaign_name` más `INSIGHT_FIELDS`, tope 600. Candidatos: `gasto >= min_gasto` y compras > 0; ordenados por ROAS descendente, 8 por cuenta. Luego `GET {act}/ads` con `filtering` IN sobre id para traer miniatura 320x320, `story_id` y `effective_status`.
- `top_ads`: top global de 16 por ROAS, caché de 180 s. Endpoint `/api/top-anuncios?rango=&gasto=`.
- Salud de cuenta (`account_health`, endpoint `/api/salud`, caché 120 s):
  - `GET {act}` con `account_status, disable_reason, amount_spent, spend_cap, funding_source_details, currency`.
  - `ACCT_ESTADO`: 1 Activa, 2 Deshabilitada, 3 Con deuda sin pagar, 7 En revisión de riesgo, 8 Pago pendiente, 9 En período de gracia, 100 Cierre pendiente, 101 Cerrada, 201 Activa, 202 Cerrada. Solo 1 y 201 cuentan como OK.
  - `disable_reason`: 1 políticas de integridad de anuncios, 2 propiedad intelectual, 3 riesgo en el pago, 4 cierre por actividad sospechosa, 5 actividad inusual, 6 integridad del negocio, 7 cierre permanente, 8 y 9 sin uso, 11 políticas del BM, 12 mal representada, 15 comprometida.
  - Se marca problema si no hay `display_string` de pago o si el gasto llega al 90% de `spend_cap`.
  - Lista hasta 60 anuncios con `effective_status` `DISAPPROVED` o `WITH_ISSUES` (fields `name, effective_status, campaign{id,name}, adset{name}, issues_info, ad_review_feedback`); el motivo sale de `issues_info[0].error_summary` o del texto de `ad_review_feedback`, truncado a 160 caracteres.

### 3.6 Lecturas de cuentas y páginas

- `list_accounts`: `GET me/adaccounts` (fields `name, account_id, account_status, currency`). El nombre del BM sale de `templates.json[bm].nombre`.
- `account_info`: `GET {act}/adspixels` (`id, name, last_fired_time`); páginas por `GET me/assigned_pages` con fallback a `GET {act}/promote_pages` (`id, name`); campañas por `GET {act}/campaigns` (`name, effective_status, daily_budget, objective`) filtradas por `CAMP_STATUS = [ACTIVE, PAUSED, WITH_ISSUES, IN_PROCESS]`, tope 300.
- `page_instagram`: lista `me/assigned_pages` (`id, access_token`), toma el token de la página y llama `GET {page}/instagram_accounts` (`id, username`).
- `reference_info` (`/api/reference`): devuelve conjuntos, píxel, evento, `bid_strategy`, `bid_amount` (dividido 100) y presupuesto (dividido 100).
- `conexion()`: `GET me` (nombre), `GET me/adaccounts`, `GET me/assigned_pages`.
- `graph_all` pagina con `limit=100` siguiendo `paging.next` hasta un tope de 500 resultados.

### 3.7 Errores de Meta (`_meta_error`)

Mensaje = `error_user_msg` o `message`, con `error_user_title` de prefijo y el sufijo "(código N)". Casos especiales:
- Códigos 4, 17, 32, 613: "Meta pide esperar: probá de nuevo en 1 o 2 minutos."
- Código 190: token vencido o revocado, generar uno nuevo.
- Mensaje con "API access blocked": revisar que la app esté en modo Activo y sin alertas, generar token nuevo y reconectar.
- Códigos 200 y 10: falta permiso; revisar que el usuario del sistema tenga asignadas la cuenta o la página.
- Cualquier otro: "Meta respondió con un error (HTTP n)". Errores de red: "No pude conectarme con Meta...".

La capa HTTP convierte `MetaError` en HTTP 400, `KeyError` en 400 "Falta un dato" y cualquier otra excepción en 500.

## 4. Piloto y reglas

El piloto no corre solo en segundo plano: lo dispara una persona desde Ajustes ("Simular ahora" / "Aplicar ahora"), la pestaña Hoy lo simula al cargar, o Claude Code corre `python3 subir.py piloto --aplicar`. Para el piloto solo importan las campañas con estado `ACTIVE` y que no estén protegidas.

### 4.1 Reglas por defecto (`DEFAULT_REGLAS`, guardadas en `reglas.json`)

- `pausar_sin_ventas`: `activa=True`, `gasto_min=15`.
- `pausar_roas_bajo`: `activa=False`, `roas_max=1.0`, `gasto_min=30`.
- `escalar`: `activa=False`, `roas_min=2.5`, `gasto_min=15`, `porcentaje=30`, `horas_entre=4`, `tope_diario=200`.

`save_reglas` solo acepta los campos conocidos y convierte a bool/float.

### 4.2 Evaluación (`piloto(aplicar)`)

Usa `metricas("today")`. Para cada campaña elegible, aplica en este orden (cada regla que dispara hace `continue`):
1. Pausar si la regla 1 está activa, `compras == 0` y `gasto >= gasto_min`.
2. Pausar si la regla 2 está activa, `gasto >= gasto_min` y `roas < roas_max`.
3. Escalar si la regla de escalar está activa, hay presupuesto, `gasto >= gasto_min` y `roas >= roas_min`:
   - Se omite si ya se escaló hace menos de `horas_entre` horas.
   - `nuevo = min(presupuesto * (1 + pct/100), tope_diario)`; se omite si `nuevo <= presupuesto + 0.99`.
   - Si no, acción `escalar` con el porcentaje efectivo.

Cada ítem del plan tiene `accion` (`pausar`, `escalar` u `omitida`), `campana`, `cuenta`, `motivo`, `porcentaje` (si escala) y `resultado` (al aplicar).

### 4.3 Aplicación

- `pausar`: `set_campaign_status` con origen `piloto`.
- `escalar`: exige humano. Desde la CLI el resultado dice "no hecho: subir presupuesto solo lo hace Gonzalo desde la pantalla" (el nombre está escrito a mano en el código).

### 4.4 Escalar a mano (`escalar(bm, id, pct)`)

- `require_human`; `pct` debe estar en (0, 100].
- Lee `daily_budget` de la campaña (error si no es CBO).
- `nuevo = max(actual + 100, round(actual * (1 + pct/100) / 100) * 100)` en centavos (mínimo +US$1).
- `POST {campaña}` con `daily_budget`.
- Escribe `escalados.json[campaign_id] = timestamp` y registra la acción.

### 4.5 Protección y log

- `set_protegida` guarda la lista ordenada de ids en `protegidas.json`; el piloto no toca esas campañas (candado en la UI).
- `log_accion` guarda las últimas 300 entradas en `acciones.json`: `{fecha, origen, accion, bm, id, campana, detalle}`. Orígenes vistos: `piloto`, `claude`, y el de la pantalla (inferido: "app" o similar).

## 5. Productos

Archivo `products.json`: lista de objetos `{id, nombre, link, titulo, texto, descripcion, cta, utm, precio, costo, archivado}`.
- `id` es un uuid hex recortado a 8 caracteres.
- `cta` default `SHOP_NOW`. El editor ofrece `SHOP_NOW`, `LEARN_MORE`, `ORDER_NOW`, `BUY_NOW`, `GET_OFFER`, `SIGN_UP` (etiquetas en español: Comprar, Más información, Pedir ahora, Comprar ahora, Obtener oferta, Registrarte).
- `titulo` va a `title`/`name` del creativo, `texto` a `message`, `descripcion` a `link_description`/`description`, `link` al `link` y al `value.link` del CTA, `utm` a `url_tags`.
- Validaciones del frontend al guardar: obligatorios nombre, link, título y texto; link empieza con `http(s)://` (el backend además exige `https` al subir); nombre único sin distinguir mayúsculas; si hay precio y costo, costo menor a precio.
- Contadores de caracteres: título 40, texto principal 125, descripción 150 ("Meta puede cortarlo").
- UTM estándar del botón: `utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}`.
- `product_info`: si `precio > 0` y `0 <= costo < precio`, entonces `be = round(precio / (precio - costo), 2)` y `margen = (precio - costo) / precio`. El ROAS de equilibrio es el ROAS mínimo para no perder plata; la ganancia estimada de una campaña es `valor_compras * margen - gasto`.
- Endpoints: `GET /api/products`, `POST /api/products` (upsert, devuelve la lista completa), `POST /api/products/delete`. Eliminar no toca campañas ya subidas. Archivar es un flag; los archivados no aparecen al subir.
- El vínculo producto-campaña vive solo en el historial (`producto` por nombre). Las campañas creadas fuera de la app no tienen producto.

## 6. Google Drive y archivos locales

Tres vías para traer medios:
1. ZIP de Descargas (sin instalar nada): `zips_recientes` lista `~/Downloads/*.zip` de los últimos 7 días (hasta 6). `extract_zip` extrae solo videos e imágenes, salta `__MACOSX` y archivos que empiezan con punto, y protege contra zip-slip comparando el `realpath`. Destino `data/descargas/<nombre>-<mtime>` (se reutiliza si ya existe). Si el ZIP no tiene medios, error "El ZIP no tiene videos...". Si todo está dentro de una única carpeta, entra a esa.
2. Carpeta de Drive para escritorio (`drive_roots()`): detecta `~/Library/CloudStorage/GoogleDrive-*` o `~/Google Drive*`, prefiriendo "Mi unidad" o "My Drive". Los archivos solo en la nube se bajan solos al leerlos.
3. Link de carpeta de Drive con OAuth.

### 6.1 OAuth de Google

- Scope: `https://www.googleapis.com/auth/drive.readonly`. Autorización en `https://accounts.google.com/o/oauth2/v2/auth`, token en `https://oauth2.googleapis.com/token`, API en `https://www.googleapis.com/drive/v3`.
- Redirect: `http://127.0.0.1:PORT/api/google/callback`. Parámetros del login: `access_type=offline`, `prompt=consent` y `state` (`token_urlsafe(16)`, vale 900 s, un solo uso, guardado en memoria).
- El callback canjea el `code` y guarda el `refresh_token` en `data/google.json` (chmod 600; valor `[REDACTED]`). El `access_token` se cachea en memoria por `expires_in - 60` s.
- `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` se guardan en `.env` con `update_env`. Guardar credenciales y desconectar requieren humano. El client id debe terminar en `.apps.googleusercontent.com`.
- Setup guiado en la UI: crear proyecto en Google Cloud, habilitar Google Drive API, pantalla de consentimiento Externo con usuario de prueba (y "Publicar app" para que no venza a los 7 días), crear credencial OAuth tipo "Aplicación de escritorio".
- `google_estado` consulta `/about` para mostrar el email.

### 6.2 Lectura y descarga

- `parse_drive_link` acepta `/folders/ID`, `?id=ID` o un ID suelto de 20+ caracteres.
- `drive_folder`: `GET /files/{id}` (`id, name, mimeType`) que debe ser carpeta; `drive_children` consulta `'id' in parents and trashed = false`, fields `nextPageToken,files(id,name,mimeType,size)`, `pageSize=200`, hasta 1000 resultados, con `supportsAllDrives=true` e `includeItemsFromAllDrives`. Baja un nivel de subcarpetas y arma los lotes por tipo.
- `drive_download`: baja a `data/descargas/drive-<id>/` (una subcarpeta por lote si hay varios) usando `files/{id}?alt=media&supportsAllDrives=true`, en streaming a un `.part` que luego se renombra. Salta archivos ya bajados con el mismo tamaño. Loguea porcentaje. Timeout de 300 s. Corre como job (`/api/google/descargar`).
- Errores (`_g_err`): 401 pide reconectar; 403/404 "no encontré la carpeta o no tengo acceso"; 429 esperar.
- `limpiar_descargas(14)` corre al arrancar y borra descargas de más de 14 días.
- `scan_folder` agrega las rutas reales a la whitelist `ALLOWED_DIRS` que usa `/api/file`; las carpetas se ordenan con orden natural; si hay medios sueltos es un solo lote, si no cada subcarpeta con medios es un lote (una CBO cada uno).

Endpoints: `GET /api/drive` (Drive de escritorio y ZIPs recientes), `GET /api/google/estado`, `/api/google/login`, `/api/google/callback`, `/api/google/carpeta?link=`, `POST /api/google/descargar`, `/api/google/credenciales`, `/api/google/desconectar`.

## 7. Guardrails de seguridad

- Escucha solo en `127.0.0.1`. Se valida el header `Host` (debe ser `127.0.0.1:port` o `localhost:port`; defensa contra DNS rebinding).
- Todos los POST necesitan `X-App: 1`; los GET a `/api/*` también, salvo `/api/file`.
- Token humano: `HUMAN_TOKEN = secrets.token_hex(16)` por proceso, embebido en el HTML. Una petición es "humana" si trae `X-Human` correcto y `Sec-Fetch-Site: same-origin`; eso setea un `_ctx.human` por hilo. `require_human(que)` tira `MetaError` si no.
- Acciones que solo hace una persona desde la pantalla: subir presupuesto de una campaña existente (`escalar` y cualquier POST con `daily_budget`/`lifetime_budget` en un edge que no es de creación), borrar o archivar (`status` `DELETED`/`ARCHIVED`, `descartar_hist`), cambiar estados distintos de ACTIVE/PAUSED, guardar un token (`set_token`), guardar credenciales de Google y desconectar Google.
- Claude Code y la CLI pueden subir (siempre en pausa), programar, activar y pausar.
- Todo lo nuevo se crea en pausa y se verifica antes de activar (barrera en `graph()` más `verify`).
- Presupuesto máximo por campaña `MAX_BUDGET_USD` (default 300), validado en `create_container`.
- Cuentas: solo `account_status == 1` y moneda `USD`.
- Tokens solo en `.env` (chmod 600 según la guía). `set_token` valida longitud >= 40 y prefijo `EA`, lo prueba con `GET me`, lo escribe en `.env` y nunca lo devuelve. La UI jamás muestra tokens.
- `/api/file` sirve solo medios dentro de rutas de la whitelist y con soporte de `Range` (para previsualizar videos).
- Headers de respuesta: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`.
- CSV: escape de fórmulas. ZIP: anti zip-slip. OAuth: `state` de un solo uso.
- Backup y restore cubren `BACKUP_FILES` = `products, historial, reglas, acciones, escalados, protegidas`, con formato `{version:1, fecha, archivos:{...}}`. No incluye `.env` ni `google.json`.

## 8. Archivos de datos y formas JSON

Todos en `data/`, con `.bak` del estado previo en cada escritura. Todo en memoria queda fuera (jobs y cachés).

- `templates.json` (no estaba presente en `data/` al inventariar; la forma sale de cómo lo lee el código, inferido). Clave por BM (`BM1`, `BM2`):
  ```
  {
    "nombre": "<nombre visible del BM>",
    "default_pixel": "<id>",
    "default_budget": <numero>,
    "campaign": {"objective": "...", "bid_strategy": "..."},
    "adset": {"optimization_goal": "...", "billing_event": "...", "targeting": {...},
              "attribution_spec": [...], "custom_event_type": "..."},
    "creative": {"call_to_action_type": "...",
                 "degrees_of_freedom_spec": {"creative_features_spec": {...}}}
  }
  ```
  El `custom_event_type` en el template es opcional (default `PURCHASE`).
- `products.json`: lista, ver sección 5.
- `historial.json` (máximo 500 filas, la más nueva primero según la UI): cada fila `{id, fecha, bm, cuenta, account_id, producto, campana, carpeta, conjunto, campaign_id, adset_id, ad_ids, existente, n_ads, inicio, presupuesto, bid_amount, estado}`. `estado` es `error`, `pausa`, `activado` o `descartado`. En memoria el job también lleva `plan`, `checks`, `hid`, `activated`, `descartado`, etc. para la UI.
- `acciones.json` (máximo 300): `{fecha, origen, accion, bm, id, campana, detalle}`.
- `reglas.json`: las tres reglas de la sección 4.1.
- `escalados.json`: `{campaign_id: epoch}`.
- `protegidas.json`: lista ordenada de `campaign_id`.
- `google.json`: `{refresh_token: "[REDACTED]"}`, permisos 600.
- `descargas/`: caché de descargas de Drive y ZIPs extraídos (se limpia a los 14 días).
- Job en memoria (`JOBS`): `{log: [...], done, error, result}`; se evicta cuando hay más de 40 (se tiran 20 terminados). Polling por `GET /api/job?id=`.
- Caché en memoria (`_CACHE`) con TTL (default 60 s); se vacía al cambiar algo.

API completa (todas bajo `/api/`):
- GET: `accounts, account, metricas, anuncios, preview, ganadores, historial, instagram, reference, top-anuncios, google/estado, google/login, google/carpeta, backup, drive, link-check, products, pick_folder, pick_zip, scan, file, salud, reglas, acciones, conexion, job`.
- POST: `upload, dryrun, clonar, clonar_sim, escalar, estado, reglas, piloto, hist/activar, hist/descartar, google/descargar, google/credenciales, google/desconectar, token, proteger, restore, refrescar, products, products/delete`.

## 9. Lecciones y gotchas

- Rate limit de Meta (códigos 4, 17, 32, 613): hay que esperar 1 o 2 minutos; pasa si se piden muchas cosas seguidas sobre la misma cuenta. Conviene cola y reintentos con backoff en la versión nueva.
- Todo se crea en `PAUSED` y se activa recién tras verificar. Es el invariante que más plata evita perder.
- Meta rechaza `standard_enhancements` en `creative_features_spec`; hay que quitarlo. Y para evitar mejoras automáticas se fuerza `OPT_OUT` en cada feature y en `contextual_multi_ads`.
- El targeting copiado de un conjunto existente trae campos que la creación rechaza; por eso `clean_targeting` filtra por lista blanca.
- En modo existente hay que copiar del conjunto más nuevo: `optimization_goal`, `billing_event`, `attribution_spec`, `targeting`, `custom_event_type`, y `bid_amount`/`bid_constraints` según la `bid_strategy` de la campaña.
- `special_ad_categories` siempre `[]`: no hay soporte para categorías especiales (inferido que fallaría con esas cuentas).
- Los videos necesitan miniatura propia (`image_url` en `video_data`), por eso se espera el procesamiento y se consulta `/thumbnails`. El procesamiento puede tardar hasta unos 13 minutos.
- Videos de más de 20 MB: subida resumable por trozos. Más chicos: un POST simple.
- Subida de medios en paralelo con 3 workers (más no, por el rate limit; inferido).
- Los clones reutilizan la publicación (`object_story_id`) para conservar likes y comentarios. Esto solo funciona dentro de la misma página, y la CLI además exige el mismo BM.
- Todo asume cuentas en USD (la subida aborta si no lo son).
- Hora de inicio en Argentina fija a UTC-3 (sin horario de verano, que hoy no aplica en AR).
- Los presupuestos van en centavos; `escalar` siempre sube como mínimo US$1.
- Las campañas ACTIVE sin ventas hoy pueden ser solo ruido de primera hora: la regla `pausar_sin_ventas` mira "hoy" con umbral de gasto 15 (ver 10).
- "Campaña ARCHIVADA" en métricas significa que aparece en insights pero no en la lista de campañas filtrada por `CAMP_STATUS`.
- Tokens: la forma segura es un token de usuario del sistema "Nunca expira" con los cinco permisos listados; si la app no está en modo Activo, Meta responde "API access blocked".
- Si se crea una cuenta publicitaria nueva y no aparece, hay que asignarla al usuario del sistema del BM.
- Resultados de `/me/adaccounts` y demás listas se paginan; `graph_all` corta en 500.

## 10. Debilidades y mejoras obvias

Arquitectura y despliegue:
- Es local y solo para Mac (osascript, `~/Library/CloudStorage`). Para Workers no se traslada: el sistema de archivos, el selector de carpetas y la descarga a disco desaparecen. Subir medios tendría que ser por upload desde el navegador (R2 o directo a Meta) y no por rutas locales.
- Sin autenticación real: solo un token por proceso y host local. En la versión desplegada hace falta login y modelo de usuarios/roles; "humano vs Claude" tendría que ser una política explícita (por ejemplo, tokens de API con alcance limitado) y no un header.
- Tokens de Meta y de Google en texto plano en `.env` y `google.json`. Pasar a secretos de Workers y a un almacén cifrado por usuario/BM.
- Solo BM1 y BM2 fijos en código. Hay que soportar N BMs y N tokens por configuración.
- Jobs y cachés en memoria: se pierden al reiniciar y no hay cola. En Workers usar Durable Objects, Queues o Workflows para subidas largas (la espera de procesamiento de video puede pasar de 10 minutos).
- Archivos JSON sin lock entre procesos: `HIST_LOCK` es solo intra-proceso y la CLI corre en otro proceso, así que hay riesgo de pisadas. Pasar a D1 (o similar) con transacciones.
- Datos en JSON con tope (historial 500, acciones 300): se pierde historia; mejor tablas con retención.

Piloto y reglas:
- El piloto no tiene scheduler: depende de que una persona o Claude lo dispare. Con Cron Triggers puede correr solo, con notificaciones.
- Decide solo con datos de "hoy": al inicio del día hay poca información y puede pausar por ruido; falta mirar ventana más larga, hora del día o presupuesto gastado.
- Umbrales inconsistentes entre capas: el piloto escala con `roas_min=2.5` y la UI de Hoy sugiere "+30%" con `roas >= be*1.2` o 2. Unificar en una sola fuente de reglas.
- No hay regla para bajar presupuesto ni para reactivar. El escalado desde el piloto no se puede aplicar sin humano; falta un flujo de aprobación (por ejemplo, push o mail con botón) en vez de depender de la pantalla.
- Mensajes con el nombre "Gonzalo" escrito a mano en el código; parametrizar.

Subida a Meta:
- `verify` solo comprueba `optimization_goal == "OFFSITE_CONVERSIONS"`; no verifica el tipo de evento, la atribución ni los placements.
- Un solo evento de píxel (default `PURCHASE`) y una sola cuenta por subida; sin soporte multi-cuenta en lote.
- Activar no es atómico: una falla a mitad deja estado mixto, sin rollback (solo reintento).
- Descartar usa `DELETED`; no hay opción de archivar.
- El dry-run solo corre `make_ctx` (lecturas); no valida con Meta lo que se crearía.
- Sin barra de progreso por archivo; solo log de texto. La ruta de carpeta se escribe a mano o se elige por osascript.
- El aviso de 5 a 10 anuncios por lote es solo warning.
- Sin variantes de texto (A/B), sin múltiples creativos por anuncio, sin placements específicos de Reels (inferido: no aparecen en el código).
- `extract_zip` tiene una rama muerta: ambas ramas devuelven `inner`.
- `special_ad_categories` fijo en `[]`.

Métricas:
- Topes por paginación: 300 campañas en `account_info`, 500 en `graph_all`, 600 anuncios en el top de anuncios. Cuentas grandes quedan truncadas sin avisar.
- Sin ventana de atribución explícita en insights ni conversión de moneda; todo asume USD.
- Caché sin scope por token: al reconectar un token se vacía todo.
- `graph_all` sigue URLs `paging.next` que contienen el access token (aceptable en local, a cuidar en un servidor: no loguear URLs).
- `product_map` depende del historial: campañas creadas fuera de la app no tienen producto ni ganancia estimada.
- Los pasos de error de Meta cubren pocos códigos; falta mapeo más completo (por ejemplo, errores de políticas y de creativos).

Otras mejoras evidentes:
- Notificaciones (mail o Slack) para pausas, escalados y cuentas con problemas.
- Auditoría completa de acciones con usuario y origen; hoy el log guarda solo 300 filas con un origen en texto.
- Tests automáticos: no hay (inferido de que no existe un directorio de tests en lo leído).
- Resiliencia de red: reintentos con backoff ante 17/613 y ante timeouts de Meta.
- Compatibilidad con Windows y con ejecución en la nube (hoy se asume Mac local).
