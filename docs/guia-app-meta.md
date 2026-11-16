# Guía: crear la app de Meta para Lanzador

Esta guía la seguís vos con tu cuenta de Facebook. Nadie más puede hacer estos pasos, porque Meta exige el login y la aprobación del dueño. Tiempo estimado: 20–30 minutos para tener la app en modo desarrollo; la verificación del negocio y el App Review tardan días o semanas y se hacen después.

En esta guía, `<APP_ORIGIN>` es la URL de la app en Cloudflare, por ejemplo `https://lanzador.<tu-subdominio>.workers.dev`. Queda definida en la Fase 4 (infraestructura); hasta entonces podés completar los pasos 1 a 4 y dejar las URLs para después.

## Antes de empezar

- Una cuenta de Facebook con acceso de administrador al Business Manager (portfolio comercial) donde están tus cuentas publicitarias.
- Cuenta de desarrollador en https://developers.facebook.com (si no la tenés, Meta te pide registrarte la primera vez: aceptar términos y verificar teléfono).

## 1. Crear la app

1. Entrá a https://developers.facebook.com/apps y tocá **Crear app**.
2. Caso de uso: elegí **Otro** y después tipo de app **Negocios** (Business).
3. Nombre: `Lanzador` (o el que prefieras). Email de contacto: el tuyo.
4. Portfolio comercial: elegí tu Business Manager. Esto es necesario para la verificación del negocio y para los tokens de usuario del sistema.
5. Creá la app. Meta puede pedirte la contraseña de Facebook: escribila vos.

## 2. Agregar productos

En el panel de la app, sección **Agregar productos**:

1. **Marketing API** → Configurar.
2. **Inicio de sesión con Facebook para empresas** (Facebook Login for Business) → Configurar.

## 3. Crear la configuración de Facebook Login for Business

1. En **Facebook Login for Business › Configuraciones**, tocá **Crear configuración**.
2. Nombre: `Lanzador conexión`.
3. Tipo de inicio de sesión / variación: **General**.
4. Tipo de token de acceso: **Token de acceso del usuario del sistema** (System-user access token). Vencimiento: **Nunca**.
5. Activos: marcá **Cuentas publicitarias**, **Páginas**, **Cuentas de Instagram** y **Píxeles**.
6. Permisos: marcá exactamente estos siete y ninguno más:
   - `ads_management`
   - `ads_read`
   - `business_management`
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_ads`
   - `instagram_basic`
7. Guardá. Copiá el **ID de configuración** (`config_id`): es el valor de `META_LOGIN_CONFIG_ID`.

## 4. Datos básicos de la app

En **Configuración de la app › Básica**:

1. Copiá el **Identificador de la app** (App ID): es `META_APP_ID`. No es secreto.
2. La **Clave secreta de la app** (App Secret) **sí es secreta**. No la pegues en el chat, en un archivo ni en un email. La vas a cargar vos mismo con un comando (paso 6).
3. Categoría: **Negocios y páginas**.
4. Cuando tengas `<APP_ORIGIN>` (Fase 4), completá:
   - Dominios de la app: el host de `<APP_ORIGIN>` (sin `https://`).
   - URL de la política de privacidad: `<APP_ORIGIN>/privacidad`
   - URL de las condiciones del servicio: `<APP_ORIGIN>/terminos`
   - URL de instrucciones para eliminar datos: elegí la opción **URL de devolución de llamada para eliminación de datos** y poné `<APP_ORIGIN>/api/meta/data-deletion`
5. Ícono de la app (1024×1024): opcional ahora, obligatorio para App Review.

## 5. URLs de Facebook Login for Business

En **Facebook Login for Business › Configuración**:

1. **URI de redireccionamiento de OAuth válidos**: `<APP_ORIGIN>/api/meta/oauth/callback`
2. Activá **Inicio de sesión con OAuth web** y **Forzar HTTPS**. Dejá **Modo estricto para URI de redireccionamiento** activado.
3. **URL de devolución de llamada para cancelar autorización** (Deauthorize callback): `<APP_ORIGIN>/api/meta/deauthorize`

Si después usás el entorno de preview (`lanzador-preview`), agregá también su callback como segundo URI de redireccionamiento.

## 6. Cargar el secreto

Cuando el proyecto tenga la configuración de Wrangler (Fase 4), corré en la carpeta del proyecto:

```bash
npx wrangler secret put META_APP_SECRET
```

El comando te pide el valor y lo guarda cifrado en Cloudflare. Pegalo ahí, nunca en el chat. Para el entorno de preview, repetí con `--env preview` si la Fase 4 lo define así.

El App ID y el `config_id` me los podés pasar por el chat: no son secretos.

## 7. Testers (mientras no haya App Review)

La app queda en **modo desarrollo**. En ese modo solo pueden conectar Meta las personas con un rol en la app.

1. **Roles de la app › Roles › Agregar personas**: elegí **Tester** e ingresá el usuario de Facebook de cada cliente beta.
2. Cada tester acepta la invitación en https://developers.facebook.com/requests.
3. Vos, como administrador de la app, ya podés conectar sin hacer nada más.

## 8. Verificación del negocio y App Review (empezar pronto)

Para que cualquier cliente pueda conectar sin ser tester, Meta exige **Acceso avanzado** a `ads_management` y `business_management`. Eso pide:

1. **Verificación del negocio** en el Business Manager (Configuración del negocio › Centro de seguridad › Iniciar verificación). Pide datos legales del negocio y documentación. Tarda de días a semanas.
2. **App Review**: por cada permiso, una descripción del uso y un screencast del flujo real (conectar Meta, elegir cuentas, lanzar en pausa, ver métricas). El screencast se graba cuando la app esté funcionando (Fase 8).
3. Cambiar la app a **modo activo** (Live) cuando la política de privacidad esté publicada.

Riesgo: Meta puede pedir cambios o rechazar. Mientras tanto, la beta funciona con testers.

## Qué me tenés que pasar

| Dato | Cómo |
|---|---|
| `META_APP_ID` | Por el chat |
| `META_LOGIN_CONFIG_ID` | Por el chat |
| `META_APP_SECRET` | Solo con `npx wrangler secret put META_APP_SECRET` |
| Usuarios tester | Los agregás vos en Roles de la app |
