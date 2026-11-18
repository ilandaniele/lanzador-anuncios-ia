# Meta App Review: textos por permiso

App: Lanzador Anuncios IA (1483234463762919). Producción: https://lanzador.ilandaniele.workers.dev

Los textos van en inglés (los revisores de Meta lo prefieren). Pegar cada bloque en "Tell us how your app uses this permission". Cada permiso necesita su screencast: seguir los pasos de "Screencast".

## App overview (campo general / "App details")

Lanzador Anuncios IA is a B2B tool for agencies and businesses that run Meta Ads. A user signs in with an email magic link, connects their Meta account through Facebook Login for Business, and picks the ad account, Page, Instagram account and pixel they want to work with. They upload creatives, write or generate ad copy, and launch campaigns. Every campaign, ad set and ad is created PAUSED: nothing is published or spends money until the user explicitly activates it inside our app. The app then reads performance metrics so the user can monitor results and decide what to scale or pause. All actions are taken only on assets the user owns or manages and explicitly selected.

## ads_management

**How we use it**
We use ads_management to create and manage ads on the ad accounts the user selects. When the user launches from our launcher, we upload the image or video to the ad account (/adimages, /advideos), create the ad creative (/adcreatives), and create the campaign, ad set and ads (/campaigns, /adsets, /ads), always with status PAUSED. Later the user can activate, pause or change the daily budget of those campaigns from our dashboard, and we write only that change. We never activate anything without an explicit click and confirmation by the user.

**Value for the user**
It turns a manual, error-prone process in Ads Manager (many campaigns, ad sets and ads with the same settings) into one guided flow with a review step, while the user keeps full control because everything starts paused.

**Screencast**
1. Log in to the app and open Lanzador.
2. Choose ad account, Page and pixel; choose the structure (new CBO campaign).
3. Pick the product and copy, add a creative, set budget and country.
4. Click Simular, then Lanzar en pausa and confirm in the dialog that says the status on creation is Paused.
5. Show the progress screen, then open Ads Manager and show the new campaign with status Off.

## ads_read

**How we use it**
We use ads_read to read the user's ad accounts (name, currency, timezone, status), their pixels, existing campaigns and ads, and insights (spend, results, CPA, ROAS) via /insights. After a launch we read back the created objects to verify they match what the user configured (paused status, budget, countries, pixel, event, link). Metrics are shown in our Métricas and Hoy screens and are used by the optional autopilot to suggest pausing or scaling, which the user must approve.

**Value for the user**
One place to see what each campaign is spending and returning, and an automatic check that every launch was created exactly as reviewed.

**Screencast**
1. Open Ajustes > Conexiones and show the connected ad accounts read from Meta.
2. Open Métricas and show campaign spend and results.
3. Open a launch in Historial and show the verification checks (campaign paused, budget matches, pixel, event).

## business_management

**How we use it**
Agencies manage client ad accounts and Pages through a Business Manager. We use business_management to identify the business the user granted during Facebook Login for Business and to list the ad accounts and Pages assigned to the user through that business (me/adaccounts with business{id,name}, me/assigned_pages). We only read assets; we do not create businesses, add users or change business settings.

**Value for the user**
Agency users can see and select the client assets their business gives them access to, not only personal ones.

**Screencast**
1. Click Conectar Meta, go through Facebook Login for Business and choose the business and assets.
2. Back in the app, show the list of ad accounts and Pages from that business in Ajustes > Conexiones.

## pages_show_list

**How we use it**
We call me/accounts to list the Facebook Pages the user manages, so they can choose which Page will be the identity of their ads. We store only the Page id and name.

**Value for the user**
The user picks the advertising Page from a list instead of typing ids.

**Screencast**
1. Open Lanzador, step Cuenta y píxel.
2. Open the Página selector and show the Pages listed from the user's account; select one.

## pages_read_engagement

**How we use it**
We read basic Page data (id, name and the linked Instagram business account) and the Page posts used by existing ads (effective_object_story_id), so the user can reuse a top-performing existing post as a new ad instead of creating a new one. We do not read or store comments, messages or follower data.

**Value for the user**
The user can relaunch proven posts in new campaigns, keeping their social proof.

**Screencast**
1. Open Lanzador, step Cuenta y píxel, and show the Page with its linked Instagram account.
2. Step Creativos: add an ad copied from another campaign ("Copiado de otra campaña") and show the existing post being selected.

## pages_manage_ads

**How we use it**
The ad creatives we create use the user's selected Page as the identity (object_story_spec.page_id). Meta requires pages_manage_ads for an app to create ads on behalf of a Page. We use it only when the user launches from our launcher, and ads are created paused.

**Value for the user**
Ads are published under the brand's own Page.

**Screencast**
Same flow as ads_management: select the Page in step Cuenta y píxel, launch paused, then show in Ads Manager that the ad identity is that Page.

## instagram_basic

**How we use it**
We read the Instagram business account linked to the selected Page (instagram_business_account{id,username}) so the user can choose it as the Instagram identity of their ads, and we set that id in the creative. We do not read Instagram media, comments or insights.

**Value for the user**
Ads also run on Instagram under the brand's account, chosen from a list.

**Screencast**
1. Open Lanzador, step Cuenta y píxel.
2. Show the Instagram account shown for the selected Page and select it.

## Acceso para el revisor (obligatorio)

El login normal es por magic link y `onboarding@resend.dev` solo entrega al dueño de la cuenta Resend. Para el revisor existe `/revisor`: un código secreto entra como un único usuario fijo. Sin configurar responde 404.

Preparar antes de enviar:

1. Elegir un email para el revisor (no el del superadmin), por ejemplo `meta-reviewer@<tu-dominio>`.
2. En Admin, crear una invitación beta para ese email. Si va a usar un workspace con datos, invitarlo también a ese workspace.
3. Poner `REVIEWER_EMAIL` en `vars` de `wrangler.jsonc` (top-level).
4. Generar un código de 32 a 128 caracteres y cargarlo como secreto (nunca en git ni chat). Si `REVIEWER_EMAIL` es igual a `SUPERADMIN_EMAIL`, el acceso queda apagado. Ese email tampoco recibe magic links públicos: solo entra por `/revisor`.
   - `npx wrangler secret put REVIEWER_CODE`
5. `npx wrangler deploy`.
6. Probar `/revisor` con el código.

Al terminar la revisión:

1. `npx wrangler secret delete REVIEWER_CODE`. Eso impide sesiones nuevas.
2. Deshabilitar el usuario revisor. Eso corta sus sesiones abiertas, que si no duran hasta 7 días sin uso (30 como máximo). Admin no tiene botón para esto; el comando cambia datos de producción:
   - `npx wrangler d1 execute DB --remote --command "UPDATE users SET status = 'disabled' WHERE email = '<REVIEWER_EMAIL>'"`
3. Desconectar la cuenta de Meta que haya conectado el revisor.

Texto para "Testing instructions" (pegar el código solo en el formulario de Meta):

> Go to https://lanzador.ilandaniele.workers.dev/revisor and enter this access code: <CODE>. You will be signed in as the reviewer user. To test Facebook Login for Business, open Ajustes > Conexiones and click Conectar Meta, then follow the screencast steps. All campaigns are created paused; please do not activate them.

## Nota del screencast

El anuncio falla mientras la app está en modo Development: "Ads creative post was created by an app that is in development mode". La campaña y el conjunto sí se crean pausados. En el video, mostrar esos dos objetos y aclarar en el texto que el anuncio no se puede crear hasta que la app pase a Live.
