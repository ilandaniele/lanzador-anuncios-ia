# UI/UX Brief — Lanzador

Base: `docs/00-brief.md`, `docs/01-PRD.md`, `docs/03-app-flow.md`. Implementación: React + Tailwind v4 con tokens como CSS custom properties en `@theme`. Este documento no cambia alcance ni pantallas; lo que falta en el flujo va en "Sugerencias para el flujo" al final.

## 1. Dirección visual

**En una frase:** Lanzador es una planilla de contador hecha herramienta: tinta azul sobre papel frío, los números como protagonistas, y la IA escribe a lápiz hasta que vos lo pasás a tinta.

### Idea central: lápiz y tinta

Todo lo que propone la IA (copys, nombres de anuncios, etiquetas, propuestas del piloto, borradores del chat) se dibuja "a lápiz": borde punteado grafito, ícono de lápiz y la palabra "Propuesta". Cuando una persona lo acepta (**Usar**, **Aprobar**, **Guardar**) pasa "a tinta": borde sólido, texto en tinta y registro en auditoría. La diferencia visual entre lo que sugirió la máquina y lo que decidió un humano es el principio de producto ("nada se ejecuta sin aprobación") hecho forma.

El segundo rasgo propio es el **comprobante**: toda acción de riesgo sobre Meta se confirma en un diálogo con forma de comprobante de transferencia (filas etiqueta/valor, antes → después, montos exactos), el formato que cualquier argentino ya lee sin pensar.

Todo lo demás es callado: superficies planas, reglas finas, una sola tipografía, color solo con significado.

### Referencias

| Referencia | Qué tomamos | Qué no tomamos |
|---|---|---|
| Libro diario / cuaderno contable Rivadavia | Reglado horizontal fino, doble línea que separa la columna de concepto de los importes | Papel amarillento, tipografías manuscritas |
| Comprobantes de transferencia (Mercado Pago, homebanking) | Patrón etiqueta/valor, monto destacado, "qué pasa" explícito antes de confirmar | Verde de marca, ilustraciones |
| Planillas de media buyers (Google Sheets) | Densidad, columnas numéricas alineadas a la derecha, encabezado fijo | Grilla gris uniforme sin jerarquía |
| Linear / Superhuman | Teclado primero, foco visible, `Ctrl+K`, velocidad percibida | Gradientes, modo oscuro como identidad |
| Omnibus-Type (Rosario) | Tipografía argentina Archivo con eje de ancho | — |

### Lo que evitamos explícitamente

| Cliché | Por qué no | Reemplazo |
|---|---|---|
| Degradé violeta "IA", brillos, sparkles | Lee genérico y le da protagonismo a la IA, que acá es asistente | IA en grafito punteado ("a lápiz") |
| Glassmorphism, blur de fondo | Baja contraste sobre datos densos | Superficies opacas, overlay con `--color-scrim` |
| Kit de tarjetas iguales con sombra gris | Fragmenta datos que se comparan entre sí | Tablas y listas regladas; tarjetas solo para unidades de decisión (propuesta, alerta) |
| Etiquetas en MAYÚSCULAS con tracking, eyebrows | Ruido tipográfico | Sentence case, peso 500–600 |
| Monoespaciada para datos | Tell de plantilla; Archivo con `tnum` ya alinea | Archivo con cifras tabulares |
| Flechas `→` pegadas en botones | Decoración | Verbo explícito ("Lanzar en pausa") |

## 2. Color

Tokens como CSS custom properties. Nombres semánticos; nunca se usa un hex directo en componentes.

### Paleta claro ("papel")

| Token | Hex | Uso |
|---|---|---|
| `--color-paper` | `#F4F6F5` | Fondo de página (papel frío, levemente verde-gris) |
| `--color-surface` | `#FFFFFF` | Tablas, paneles, inputs, diálogos |
| `--color-surface-sunken` | `#EBEFEE` | Zonas hundidas: dropzone, fila de totales, código de error |
| `--color-ink` | `#15202B` | Texto principal (tinta azul-negra) |
| `--color-ink-muted` | `#465462` | Texto secundario, encabezados de tabla |
| `--color-ink-subtle` | `#5F6B78` | Metadatos, hora de actualización, placeholders |
| `--color-rule` | `#D5DCE1` | Reglas y bordes decorativos (no portan información) |
| `--color-rule-strong` | `#7C8A97` | Borde de inputs, checkboxes, chips (≥ 3:1) |
| `--color-primary` | `#2342C2` | Tinta azul: botón primario, links, foco, paso activo |
| `--color-primary-hover` | `#1A3299` | Hover/pressed del primario |
| `--color-primary-soft` | `#E8ECFB` | Fila seleccionada, chip activo, paso actual |
| `--color-on-primary` | `#FFFFFF` | Texto sobre primario |
| `--color-pencil` | `#4B5563` | IA "a lápiz": borde punteado, ícono, texto de "Propuesta" |
| `--color-gain` | `#0E7146` | Dinero a favor: delta mejor, ROAS sobre equilibrio, listo |
| `--color-gain-soft` | `#E3F4EA` | Fondo de chip/fila positiva |
| `--color-loss` | `#B42318` | Dinero en contra: delta peor, ROAS bajo equilibrio, error |
| `--color-loss-soft` | `#FDE8E6` | Fondo de chip/fila negativa, alerta de error |
| `--color-warn` | `#7A4F00` | Aviso: conexión por vencer, cerca del tope |
| `--color-warn-soft` | `#FFF3D1` | Fondo de aviso |
| `--color-focus` | `#2342C2` | Anillo de foco |
| `--color-scrim` | `#15202B` al 48 % | Fondo detrás de modales y drawers |

### Paleta oscura ("tinta de noche")

No es un negro tintado: es un azul tinta profundo, coherente con la metáfora.

| Token | Hex | Uso |
|---|---|---|
| `--color-paper` | `#0F1B2D` | Fondo de página |
| `--color-surface` | `#16243A` | Tablas, paneles, inputs |
| `--color-surface-sunken` | `#0C1626` | Dropzone, totales |
| `--color-surface-raised` | `#1D2E48` | Diálogos, popovers, toasts |
| `--color-ink` | `#E6ECF3` | Texto principal |
| `--color-ink-muted` | `#B3BCC9` | Secundario, encabezados de tabla |
| `--color-ink-subtle` | `#8494AA` | Metadatos, placeholders |
| `--color-rule` | `#26395A` | Reglas decorativas |
| `--color-rule-strong` | `#6E82A8` | Borde de inputs y controles (≥ 3:1) |
| `--color-primary` | `#9BB0FF` | Primario (botón con texto oscuro), links, foco |
| `--color-primary-hover` | `#B8C8FF` | Hover |
| `--color-primary-soft` | `#22355A` | Fila seleccionada, paso actual |
| `--color-on-primary` | `#0F1B2D` | Texto sobre primario |
| `--color-pencil` | `#B3BCC9` | IA "a lápiz" |
| `--color-gain` | `#5FD39A` | Positivo |
| `--color-gain-soft` | `#133B2E` | Fondo positivo |
| `--color-loss` | `#FF9A8F` | Negativo / error |
| `--color-loss-soft` | `#3D1E27` | Fondo negativo |
| `--color-warn` | `#F2C46B` | Aviso |
| `--color-warn-soft` | `#3A3016` | Fondo de aviso |
| `--color-focus` | `#9BB0FF` | Anillo de foco |
| `--color-scrim` | `#050B14` al 64 % | Fondo de modales |

Modo: sigue `prefers-color-scheme` por defecto; el usuario puede fijar Claro/Oscuro/Sistema en Ajustes › Cuenta (se guarda en `localStorage` y en `data-theme` del `<html>`).

### Contraste verificado (WCAG 2.x, fórmula de luminancia relativa)

AA pide 4,5:1 para texto normal, 3:1 para texto grande (≥ 18,66 px bold o ≥ 24 px) y para bordes de controles y foco.

**Claro**

| Texto / primer plano | Fondo | Ratio | Resultado |
|---|---|---|---|
| `ink` #15202B | `surface` #FFFFFF | 16,49 | AAA |
| `ink` #15202B | `paper` #F4F6F5 | 15,19 | AAA |
| `ink-muted` #465462 | `surface` #FFFFFF | 7,76 | AAA |
| `ink-muted` #465462 | `paper` #F4F6F5 | 7,15 | AAA |
| `ink-muted` #465462 | `primary-soft` #E8ECFB | 6,59 | AA |
| `ink-subtle` #5F6B78 | `surface` #FFFFFF | 5,44 | AA |
| `ink-subtle` #5F6B78 | `paper` #F4F6F5 | 5,01 | AA |
| `ink-subtle` #5F6B78 | `primary-soft` #E8ECFB | 4,62 | AA |
| `on-primary` #FFFFFF | `primary` #2342C2 | 7,99 | AAA |
| `on-primary` #FFFFFF | `primary-hover` #1A3299 | 10,71 | AAA |
| `primary` #2342C2 (link) | `surface` #FFFFFF | 7,99 | AAA |
| `primary` #2342C2 | `paper` #F4F6F5 | 7,36 | AAA |
| `primary` #2342C2 | `primary-soft` #E8ECFB | 6,78 | AA |
| `ink` #15202B | `primary-soft` #E8ECFB | 14,00 | AAA |
| `pencil` #4B5563 | `surface` #FFFFFF | 7,56 | AAA |
| `gain` #0E7146 | `surface` #FFFFFF | 6,05 | AA |
| `gain` #0E7146 | `paper` #F4F6F5 | 5,58 | AA |
| `gain` #0E7146 | `gain-soft` #E3F4EA | 5,30 | AA |
| `ink` #15202B | `gain-soft` #E3F4EA | 14,45 | AAA |
| `loss` #B42318 | `surface` #FFFFFF | 6,57 | AA |
| `loss` #B42318 | `paper` #F4F6F5 | 6,06 | AA |
| `loss` #B42318 | `loss-soft` #FDE8E6 | 5,59 | AA |
| `ink` #15202B | `loss-soft` #FDE8E6 | 14,03 | AAA |
| #FFFFFF (botón peligro) | `loss` #B42318 | 6,57 | AA |
| `warn` #7A4F00 | `surface` #FFFFFF | 7,13 | AAA |
| `warn` #7A4F00 | `warn-soft` #FFF3D1 | 6,45 | AA |
| `ink` #15202B | `warn-soft` #FFF3D1 | 14,92 | AAA |
| `rule-strong` #7C8A97 (borde input) | `surface` #FFFFFF | 3,54 | AA no-texto |
| `rule-strong` #7C8A97 | `paper` #F4F6F5 | 3,26 | AA no-texto |
| `focus` #2342C2 (anillo) | `surface` #FFFFFF | 7,99 | AA no-texto |

**Oscuro**

| Texto / primer plano | Fondo | Ratio | Resultado |
|---|---|---|---|
| `ink` #E6ECF3 | `paper` #0F1B2D | 14,53 | AAA |
| `ink` #E6ECF3 | `surface` #16243A | 13,10 | AAA |
| `ink` #E6ECF3 | `surface-raised` #1D2E48 | 11,49 | AAA |
| `ink` #E6ECF3 | `primary-soft` #22355A | 10,24 | AAA |
| `ink-muted` #B3BCC9 | `surface` #16243A | 8,13 | AAA |
| `ink-subtle` #8494AA | `paper` #0F1B2D | 5,59 | AA |
| `ink-subtle` #8494AA | `surface` #16243A | 5,04 | AA |
| `on-primary` #0F1B2D | `primary` #9BB0FF | 8,27 | AAA |
| `on-primary` #0F1B2D | `primary-hover` #B8C8FF | 10,49 | AAA |
| `primary` #9BB0FF (link) | `paper` #0F1B2D | 8,27 | AAA |
| `primary` #9BB0FF | `surface` #16243A | 7,46 | AAA |
| `primary` #9BB0FF | `primary-soft` #22355A | 5,83 | AA |
| `pencil` #B3BCC9 | `surface` #16243A | 8,13 | AAA |
| `gain` #5FD39A | `paper` #0F1B2D | 9,28 | AAA |
| `gain` #5FD39A | `surface` #16243A | 8,36 | AAA |
| `gain` #5FD39A | `gain-soft` #133B2E | 6,66 | AA |
| `ink` #E6ECF3 | `gain-soft` #133B2E | 10,43 | AAA |
| `loss` #FF9A8F | `paper` #0F1B2D | 8,45 | AAA |
| `loss` #FF9A8F | `surface` #16243A | 7,62 | AAA |
| `loss` #FF9A8F | `loss-soft` #3D1E27 | 7,27 | AAA |
| `ink` #E6ECF3 | `loss-soft` #3D1E27 | 12,49 | AAA |
| #0F1B2D (botón peligro) | `loss` #FF9A8F | 8,45 | AAA |
| `warn` #F2C46B | `surface` #16243A | 9,56 | AAA |
| `warn` #F2C46B | `warn-soft` #3A3016 | 7,98 | AAA |
| `ink` #E6ECF3 | `warn-soft` #3A3016 | 10,94 | AAA |
| `rule-strong` #6E82A8 (borde input) | `surface` #16243A | 4,02 | AA no-texto |
| `rule-strong` #6E82A8 | `paper` #0F1B2D | 4,46 | AA no-texto |
| `focus` #9BB0FF (anillo) | `surface` #16243A | 7,46 | AA no-texto |

`--color-rule` (claro #D5DCE1, oscuro #26395A) queda por debajo de 3:1 a propósito: solo se usa en reglas decorativas que no son el único indicador de un límite de control.

### Semántica del dinero (nunca solo color)

Regla: **la flecha dice hacia dónde se movió el número; el color dice si eso es bueno para la plata.** En CPA y CPM, bajar es bueno.

| Caso | Signo / ícono | Color | Texto accesible (`aria-label` / sr-only) |
|---|---|---|---|
| Gasto, compras, valor, ROAS, CTR suben | `▲ +12,3 %` | `gain` | "sube 12,3 % contra el período anterior, mejor" |
| Esas mismas métricas bajan | `▼ −8,1 %` | `loss` | "baja 8,1 %, peor" |
| CPA o CPM baja | `▼ −5,0 %` | `gain` | "baja 5 %, mejor" |
| CPA o CPM sube | `▲ +5,0 %` | `loss` | "sube 5 %, peor" |
| Gasto sube (neutral: más gasto no es bueno ni malo) | `▲ +20 %` | `ink-muted` | "sube 20 %" |
| Sin cambio (|Δ| < 0,5 %) | `= 0,0 %` | `ink-subtle` | "sin cambio" |
| Sin período anterior | `—` | `ink-subtle` | "sin datos para comparar" |
| ROAS ≥ equilibrio | ícono círculo con tilde + valor + marca "sobre eq." | `gain` | "ROAS 2,45, sobre el equilibrio de 1,67" |
| ROAS < equilibrio | ícono triángulo de aviso + valor + marca "bajo eq." | `loss` | "ROAS 1,20, bajo el equilibrio de 1,67" |
| ROAS sin costo cargado en el producto | valor solo, sin ícono | `ink` | "ROAS 2,45, sin equilibrio definido" |

Las celdas de ROAS en tablas llevan además una **barra de equilibrio** de 40 × 4 px: una marca vertical en el equilibrio y un relleno hasta el valor (tope visual 3× el equilibrio). Se ve en blanco y negro.

Formato numérico es-AR siempre: `US$ 1.234,56`, `2,45`, `+12,3 %`, fechas `dd/mm/aaaa`, hora 24 h. La moneda de cada cuenta se muestra con su código; nunca se convierte.

### Snippet de tokens (Tailwind v4)

```css
@import "tailwindcss";

@theme {
  --color-paper: #F4F6F5;
  --color-surface: #FFFFFF;
  --color-surface-sunken: #EBEFEE;
  --color-surface-raised: #FFFFFF;
  --color-ink: #15202B;
  --color-ink-muted: #465462;
  --color-ink-subtle: #5F6B78;
  --color-rule: #D5DCE1;
  --color-rule-strong: #7C8A97;
  --color-primary: #2342C2;
  --color-primary-hover: #1A3299;
  --color-primary-soft: #E8ECFB;
  --color-on-primary: #FFFFFF;
  --color-pencil: #4B5563;
  --color-gain: #0E7146;
  --color-gain-soft: #E3F4EA;
  --color-loss: #B42318;
  --color-loss-soft: #FDE8E6;
  --color-warn: #7A4F00;
  --color-warn-soft: #FFF3D1;
  --color-focus: #2342C2;

  --font-sans: "Archivo Variable", "Archivo", system-ui, sans-serif;

  --radius-xs: 3px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;

  --ease-out: cubic-bezier(0.2, 0, 0, 1);
  --ease-in: cubic-bezier(0.3, 0, 1, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
}

@layer base {
  [data-theme="dark"] {
    --color-paper: #0F1B2D;
    --color-surface: #16243A;
    --color-surface-sunken: #0C1626;
    --color-surface-raised: #1D2E48;
    --color-ink: #E6ECF3;
    --color-ink-muted: #B3BCC9;
    --color-ink-subtle: #8494AA;
    --color-rule: #26395A;
    --color-rule-strong: #6E82A8;
    --color-primary: #9BB0FF;
    --color-primary-hover: #B8C8FF;
    --color-primary-soft: #22355A;
    --color-on-primary: #0F1B2D;
    --color-pencil: #B3BCC9;
    --color-gain: #5FD39A;
    --color-gain-soft: #133B2E;
    --color-loss: #FF9A8F;
    --color-loss-soft: #3D1E27;
    --color-warn: #F2C46B;
    --color-warn-soft: #3A3016;
    --color-focus: #9BB0FF;
  }
}
```

El mismo bloque oscuro se repite bajo `@media (prefers-color-scheme: dark)` con el selector `:root:not([data-theme="light"])`. `@custom-variant dark` apunta a `[data-theme="dark"]` para usar `dark:` cuando haga falta.

## 3. Tipografía

**Una sola familia: Archivo** (Omnibus-Type, Rosario; licencia OFL), variable con ejes de peso (100–900) y ancho (62–125). Self-hosted con `@fontsource-variable/archivo` (archivo con eje `wdth`), subsets `latin` y `latin-ext`, `font-display: swap`, precarga del woff2 latin. El eje de ancho es el recurso expresivo: ancho para títulos y montos grandes, semi-condensado para tablas densas. No hace falta una segunda familia.

| Rol | Configuración |
|---|---|
| Datos numéricos (tablas, KPIs, montos, %) | `font-variant-numeric: tabular-nums lining-nums; font-feature-settings: "tnum" 1, "lnum" 1;` alineados a la derecha |
| Tablas densas | `font-variation-settings: "wdth" 87` (más columnas por pantalla sin bajar de 13 px) |
| Títulos de pantalla y montos destacados | `"wdth" 112`, peso 650 |
| Cuerpo e interfaz | `"wdth" 100`, peso 400; labels 500; botones 600 |

Se verifica en el setup del front con una prueba visual (columna de `111,11` sobre `888,88`): si `tnum` no alinea, se activa `font-variant-numeric` con la familia de sistema solo para la clase `.num` (`ui-sans-serif`), sin agregar familias web.

### Escala (base 14 px en la app, 16 px en login y onboarding)

| Token | Tamaño / interlineado | Peso / ancho | Uso |
|---|---|---|---|
| `--text-2xs` | 12 / 16 px | 500 / 100 | Meta, hora de actualización, contador de caracteres |
| `--text-xs` | 13 / 18 px | 400 / 87 | Celdas de tabla, chips |
| `--text-sm` | 14 / 20 px | 400 / 100 | Cuerpo de la app, inputs, botones |
| `--text-md` | 16 / 24 px | 400 / 100 | Cuerpo en login/onboarding, mensajes del chat, copys |
| `--text-lg` | 18 / 26 px | 600 / 100 | Títulos de sección, título de diálogo |
| `--text-xl` | 22 / 28 px | 650 / 112 | Título de pantalla |
| `--text-2xl` | 28 / 34 px | 650 / 112 | Monto clave (gasto de hoy por cuenta) |
| `--text-3xl` | 40 / 44 px | 700 / 112 | Monto del comprobante (presupuesto final), total de Hoy |

Reglas: sentence case en todo; nada de mayúsculas sostenidas; tracking 0 salvo `--text-3xl` (−0,01 em); medida máxima de texto corrido 72 caracteres (`max-w-[72ch]`); copys de anuncios se muestran con `--text-md` e interlineado 1,5 para leerlos como los verá el cliente final.

## 4. Espaciado, radios, sombras, grid y breakpoints

### Espaciado (base 4 px, `--spacing: 4px` de Tailwind v4)

| Paso | px | Uso típico |
|---|---|---|
| 1 | 4 | Ícono ↔ texto en chips |
| 2 | 8 | Gap entre controles relacionados |
| 3 | 12 | Padding de celdas, padding vertical de inputs |
| 4 | 16 | Padding de paneles en mobile, gutter mobile |
| 6 | 24 | Padding de paneles en desktop, separación entre grupos |
| 8 | 32 | Separación entre secciones |
| 12 | 48 | Margen superior de estados vacíos |

Densidad (post-MVP; en el MVP la fila es siempre Cómoda): la tabla de Métricas tiene toggle **Compacta** (fila 36 px) / **Cómoda** (fila 44 px, default). En pantallas táctiles siempre Cómoda.

### Radios (por tamaño del elemento, no uno para todo)

| Token | Valor | Elementos |
|---|---|---|
| `--radius-xs` | 3 px | Chips, badges de estado, barras de progreso |
| `--radius-sm` | 6 px | Botones, inputs, selects, celdas de dropzone |
| `--radius-md` | 8 px | Paneles, tarjetas de propuesta, tarjeta del chat |
| `--radius-lg` | 12 px | Diálogos, drawer del chat, hoja inferior en mobile |
| — | 0 | Tablas y listas regladas (bordes rectos, como el libro) |

### Sombras (solo para lo que flota)

| Token | Valor claro | Valor oscuro | Uso |
|---|---|---|---|
| `--shadow-pop` | `0 4px 12px rgb(21 32 43 / 0.12), 0 1px 2px rgb(21 32 43 / 0.08)` | `0 4px 16px rgb(0 0 0 / 0.45)` | Popovers, menús, selects abiertos |
| `--shadow-dialog` | `0 16px 48px rgb(21 32 43 / 0.20)` | `0 16px 48px rgb(0 0 0 / 0.60)` | Diálogos, drawer del chat, toasts |
| `--shadow-sticky` | `0 1px 0 var(--color-rule)` | igual | Borde inferior del encabezado fijo de tablas |

Superficies en reposo no llevan sombra: se separan con `--color-rule`.

### Grid y layout

| Zona | Medida |
|---|---|
| Sidebar desktop | 232 px expandida, 64 px riel colapsado |
| Barra superior | 56 px (selector de workspace, título, **Pedile a la IA**, hora de actualización) |
| Contenido | 12 columnas, gutter 24 px en ≥ lg, 16 px en mobile; ancho máximo 1440 px; tablas usan todo el ancho |
| Formularios | Máximo 640 px de ancho, una columna; grupos de 2 columnas desde md solo para pares cortos (precio/costo) |
| Chat lateral | 400 px |
| Barra inferior mobile | 64 px + `env(safe-area-inset-bottom)` |

### Breakpoints (mobile first)

| Token | Mín. | Navegación | Chat | Tablas |
|---|---|---|---|---|
| base | 0 | Barra inferior (Hoy, Métricas, Piloto, Historial, Más) | Pantalla completa | Lista de filas-tarjeta |
| `sm` | 640 px | Igual | Pantalla completa | Lista |
| `md` | 768 px | Riel lateral 64 px | Drawer superpuesto 400 px | Tabla con scroll horizontal y primera columna fija |
| `lg` | 1024 px | Sidebar 232 px (colapsable) | Drawer superpuesto | Tabla completa |
| `xl` | 1280 px | Sidebar 232 px | Panel acoplado que empuja el contenido | Tabla completa |
| `2xl` | 1536 px | Igual | Acoplado | Columnas extra visibles por defecto (CTR, CPM) |

## 5. Iconografía

Lucide (paquete `lucide-react`, se bundlea, sin CDN), trazo 1,75, tamaños 16 y 20 px. Íconos con significado llevan texto o `aria-label`; los decorativos, `aria-hidden`. Íconos fijos: lápiz = propuesta de IA; tilde en círculo = verificado/sobre equilibrio; triángulo = aviso/bajo equilibrio; cruz en círculo = error; candado = campaña protegida; reloj = programado; pausa/play = estado en Meta.

## 6. Componentes

Estados comunes a todo control: `default`, `hover` (solo con puntero fino), `focus-visible`, `active`, `disabled`, `loading` donde aplique, `error` donde aplique. Foco: anillo de 2 px `--color-focus` con offset 2 px sobre `--color-surface`; nunca se quita.

### Botón

| Variante | Default | Hover | Active | Disabled | Loading |
|---|---|---|---|---|---|
| Primario | Fondo `primary`, texto `on-primary` | `primary-hover` | Igual hover + desplaza 1 px abajo | Fondo `surface-sunken`, texto `ink-subtle`, `aria-disabled` con tooltip que explica por qué | Spinner 16 px a la izquierda, texto cambia a gerundio ("Lanzando…"), ancho fijo, bloquea doble clic |
| Secundario | Borde `rule-strong`, fondo `surface`, texto `ink` | Fondo `paper` | Fondo `surface-sunken` | Borde `rule`, texto `ink-subtle` | Igual primario |
| Fantasma | Sin borde, texto `primary` | Fondo `primary-soft` | — | Texto `ink-subtle` | — |
| Peligro | Fondo `loss`, texto blanco (oscuro: texto `paper`) | 8 % más oscuro | — | Como primario | Igual |
| Ícono | 36 × 36 (44 × 44 en táctil), `aria-label` obligatorio | Fondo `paper` | — | — | — |

Alturas: 36 px (sm, solo en tablas desktop), 40 px (default desktop), 44 px (mínimo en táctil). Un solo primario por vista. Los textos son verbos con objeto: "Lanzar en pausa", "Aprobar y pausar", "Escalar a US$ 156,00".

### Input y textarea

| Estado | Tratamiento |
|---|---|
| Default | Alto 40 px (44 táctil), borde 1 px `rule-strong`, fondo `surface`, label arriba siempre visible (nunca solo placeholder) |
| Hover | Borde `ink-muted` |
| Focus | Borde `primary` + anillo de foco |
| Error | Borde `loss` 2 px, ícono de error, mensaje debajo en `loss` enlazado con `aria-describedby`, `aria-invalid="true"` |
| Disabled | Fondo `surface-sunken`, texto `ink-subtle` |
| Read-only | Sin borde, fondo `paper`, copiable |
| Con contador | Contador `n / límite` a la derecha del label; pasa a `warn` al 90 % del límite recomendado por Meta y a `loss` al superarlo (no bloquea, avisa) |
| Monetario | Prefijo de moneda fijo dentro del campo, cifras tabulares, alineado a la derecha, acepta coma decimal |
| Con placeholders de nombre | Chips `{producto}` `{fecha}` `{hora}` `{n}` insertables y vista previa debajo en `ink-subtle` |

### Select y combobox

Select nativo estilizado para listas cortas (CTA, moneda, rol). Combobox con búsqueda (patrón ARIA combobox + listbox) para cuentas, campañas, productos: abre con flecha abajo, filtra al tipear, `Enter` elige, `Esc` cierra. Estados: igual que input + `open` (`shadow-pop`, opción activa con `primary-soft`), `loading` (skeleton de 3 opciones), `empty` ("No hay campañas activas en esta cuenta"), `error` (mensaje + **Reintentar** dentro del popover). Cuentas con problema muestran el ícono de aviso y el motivo en la opción.

### Chips

| Tipo | Uso | Estados |
|---|---|---|
| Filtro / selección (países, ángulos, etiquetas) | Toggle, `aria-pressed` | Off: borde `rule-strong`; On: fondo `primary-soft`, borde `primary`, tilde; Focus; Disabled |
| Removible (países elegidos) | Texto + botón × con `aria-label="Quitar Uruguay"` | Hover del × |
| Estado (de anuncio, lanzamiento, conexión) | Solo lectura, ícono + texto, radio `xs` | Colores semánticos: listo `gain`, error `loss`, aviso `warn`, en curso `primary`, en pausa `ink-muted`, borrador `pencil` punteado |
| Etiqueta de IA | Borde punteado `pencil` mientras no se confirmó; sólido al editarla o confirmarla | — |

### Card (uso restringido)

Solo para unidades de decisión: alerta en Hoy, propuesta del piloto, cuenta en Hoy, borrador del chat. Fondo `surface`, borde `rule`, radio `md`, padding 16/24. Estados: `default`, `hover` (borde `rule-strong` si es clickeable entera), `focus-within`, `selected` (borde `primary`), `loading` (skeleton con la misma forma). Nunca tarjeta dentro de tarjeta.

### Tarjeta de sugerencia de IA ("a lápiz")

| Parte | Detalle |
|---|---|
| Borde | 1,5 px punteado `pencil`, radio `md` |
| Encabezado | Ícono lápiz + "Propuesta" + ángulo o motivo ("Ángulo: dolor") en `pencil`, `--text-2xs` |
| Contenido | Texto principal, título y descripción con contador de caracteres cada uno |
| Marca de riesgo | Si la IA detecta riesgo de política: franja `warn-soft` con ícono y la frase concreta ("Promete un resultado de salud") |
| Acciones | **Usar** (secundario), **Editar** (fantasma), **Guardar en el producto** (fantasma), estrella favorita (botón ícono `aria-pressed`) |
| Al tocar Usar | Pasa a tinta: borde sólido `primary`, ícono lápiz cambia por tilde, texto "En uso"; `aria-live="polite"` anuncia "Copy agregado" |
| Al tocar Editar | El contenido se vuelve textarea en el lugar; **Listo** confirma y pasa a tinta; `Esc` cancela |
| Loading (generando) | 5 skeletons punteados que se reemplazan todos juntos al llegar la respuesta |
| Error / tope de IA | Mensaje en la zona de las tarjetas, sin botón de reintentar. Tope diario: "Usaste toda la IA de hoy. Se renueva a las 21 h." Tope mensual: "Llegaste al tope de IA del mes. Se renueva el 1/12." Si se agotó el tope global: "IA en pausa hasta las 21 h." |

### Modal y diálogo de confirmación ("comprobante")

Diálogo base: `role="dialog"`, `aria-modal`, foco atrapado, `Esc` y clic en scrim cierran (salvo durante loading), devuelve el foco al disparador. Ancho 480 px (comprobante) o 640 px (formularios como **Crear producto**); en mobile es hoja inferior a pantalla completa con radio `lg` arriba.

**Patrón comprobante** para toda acción que escribe en Meta o es irreversible (activar, pausar desde piloto, escalar, aprobar propuesta, lanzar, reintentar, desconectar Meta, quitar miembro, borrar workspace):

| Fila | Contenido |
|---|---|
| Título | Verbo + objeto: "Escalar presupuesto de campaña" |
| Monto destacado | Cuando hay plata: `--text-3xl`, valor final ("US$ 156,00 por día") |
| Cuenta | Nombre + id de cuenta publicitaria |
| Objeto | Nombre completo + id de Meta, nivel (campaña, conjunto, anuncio) |
| Cambio | Antes → después en cifras tabulares ("US$ 120,00 → US$ 156,00, +30 %") |
| Alcance | "Afecta 18 anuncios en 1 conjunto" |
| Origen | Manual / Piloto (con link a la propuesta) |
| Límite | Tope del workspace y cuánto queda ("Tope por campaña US$ 300,00") |
| Qué pasa | Una frase: "Meta empieza a gastar con el nuevo presupuesto en minutos. Podés volver a bajarlo a mano." |
| Acciones | **Cancelar** (secundario, a la izquierda, recibe el foco inicial) y botón que repite verbo y monto ("Escalar a US$ 156,00") |

Las filas tienen reglado horizontal fino y el borde superior e inferior del comprobante lleva un dentado sutil (máscara CSS de 6 px), único detalle ornamental del sistema. Estados: `idle`, `submitting` (botón en loading, cerrar deshabilitado), `error` (franja `loss-soft` con código de Meta y qué hacer, el diálogo queda abierto), `success` (cierra y toast). Borrar workspace exige tipear el nombre exacto; el botón queda deshabilitado hasta que coincide.

### Toast

Arriba al centro en mobile, abajo a la derecha en desktop (encima del chat si está acoplado). Máximo 3 apilados. Éxito y info: 4 s, `role="status"`. Error: queda hasta cerrarlo, `role="alert"`, incluye **Reintentar** si aplica. Se pausa con hover o foco. Variante con **Deshacer** para pausar/activar optimista (6 s). Estructura: ícono semántico + frase con el mismo verbo de la acción ("Campaña pausada"), botón cerrar 44 × 44 en táctil.

### Tabla de datos

| Aspecto | Especificación |
|---|---|
| Estructura | `<table>` semántica, reglado horizontal `rule`, sin bandas alternadas; doble regla vertical de 3 px (dos líneas de 1 px) entre la columna Nombre y las numéricas, como el libro contable |
| Encabezado fijo | `position: sticky; top: 0`, fondo `surface`, `--shadow-sticky`; primera columna también fija en md–lg |
| Orden | Botón en el `<th>` con ícono de flecha; `aria-sort` en el `<th>`; un clic ascendente, otro descendente, tercero vuelve al orden por gasto |
| Números | Alineados a la derecha, cifras tabulares, ancho 87; delta en línea debajo del valor en `--text-2xs` |
| Acciones de fila | En ≥ lg aparecen al hover o foco de la fila (Pausar/Activar, Escalar, Proteger) y siempre en el menú `⋯` (accesible por teclado); en táctil solo el menú |
| Selección | Checkbox por fila cuando hay acción múltiple (Creativos); fila seleccionada `primary-soft` |
| Virtualización | TanStack Virtual con alto de fila fijo (36/44 px), overscan 10; `aria-rowcount` y `aria-rowindex` correctos; el cliente pide `limit=50` (la API usa 25 por defecto) y se carga la siguiente página al acercarse al final |
| Teclado | Tab entra a la tabla en la primera fila; flechas arriba/abajo mueven entre filas; Enter abre el detalle; `Shift+F10` o tecla menú abre acciones |
| Totales | Fila de totales fija abajo en `surface-sunken`, peso 600 |
| Estados | Loading: 8 filas skeleton con anchos reales; vacío: mensaje en la tabla con acción; error: fila única con mensaje y **Reintentar**; actualizando: barra fina de 2 px `primary` bajo el encabezado, los datos viejos siguen visibles |
| Mobile (< md) | Cada fila es una lista reglada: nombre y estado arriba; gasto, ROAS y CPA en 3 columnas; toque abre hoja con todas las métricas y acciones |

### Wizard stepper (Lanzador)

Barra horizontal de 6 pasos numerados (acá sí es secuencia). En < md se colapsa a "Paso 3 de 6 · Producto y copys" con barra de progreso y menú para saltar a pasos completos.

| Estado del paso | Tratamiento |
|---|---|
| Completo | Círculo con tilde `primary`, label `ink`, clickeable |
| Actual | Círculo relleno `primary` con número, label 600, `aria-current="step"` |
| Pendiente | Círculo con borde `rule-strong`, label `ink-subtle`, no clickeable |
| Bloqueado | Ícono de error `loss` y motivo en tooltip y debajo del label en mobile |

Pie fijo del wizard: **Atrás** (secundario), estado del autoguardado ("Guardado" / "Guardando…" / "Sin conexión") en `--text-2xs`, **Siguiente** (primario) a la derecha.

### Dropzone de subida con progreso por archivo

| Estado | Tratamiento |
|---|---|
| Sin cuenta elegida | Dropzone deshabilitada con el texto "Elegí la cuenta publicitaria para subir" (la subida va directo a esa cuenta de Meta) |
| Idle | Área `surface-sunken`, borde 1,5 px punteado `rule-strong`, alto 160 px, texto "Arrastrá videos o imágenes, o elegí archivos" + botón **Elegir archivos** (el área entera también es botón) y aviso "No cierres esta pestaña mientras sube" |
| Drag over | Borde sólido `primary`, fondo `primary-soft` |
| Rechazo | Borde `loss`, mensaje con el archivo y motivo ("tienda.pdf no es video ni imagen") |
| Por archivo | Fila: miniatura 40 px, nombre (truncado al medio), tamaño, barra de progreso 4 px, `%` y MB subidos, **Cancelar** |
| Reintentando bloque | Texto `warn` "Reintentando bloque 4 de 12" |
| Procesando | "Sacando cuadros" / "Etiquetando con IA" con spinner chico |
| Procesando en Meta | "Procesando en Meta" con spinner chico; el video ya está subido y la fila se actualiza sola (consulta cada 3 s mientras esté en `importing` o `processing`) |
| Listo | Tilde `gain`, etiquetas de IA a lápiz |
| Error | Cruz `loss`, motivo y **Volver a subir**: se manda de nuevo desde tu compu; si cerraste la pestaña, elegí el archivo otra vez. |

Barra de progreso con `role="progressbar"` y `aria-valuenow`; el resumen "7 de 20 subidos" en región `aria-live="polite"` actualizada como máximo cada 5 s.

### Lista de progreso del lanzamiento

Lista reglada, una fila por anuncio: miniatura, nombre, chip de estado con ícono y texto, detalle a la derecha (porcentaje, "esperando a Meta", código de error). Arriba, resumen grande: "14 de 20 listos · 1 con error" con barra segmentada (verde listo, azul en curso, rojo error, gris pendiente) que también tiene texto. Filtro rápido **Solo errores**. Estados de fila: procesando video, creando, verificando, listo, error. Error expande en el lugar con el mensaje de Meta, código y qué hacer. Región `aria-live` anuncia solo cambios de resumen y errores, no cada fila.

### Skeleton

Bloques `surface-sunken` con la forma real (mismo alto de fila, mismos anchos de columna). Pulso de opacidad 1 → 0,6 en 1,2 s; con `prefers-reduced-motion` queda estático. `aria-busy="true"` en el contenedor y texto sr-only "Cargando métricas".

### Estado vacío

Ilustración mínima de una línea (un renglón de libro contable con un ítem faltante, 64 px, trazo `rule-strong`), una frase que dice qué hacer y un botón. Ejemplos: "Todavía no lanzaste nada. Armá tu primer lanzamiento." **Nuevo lanzamiento**. Sin Meta conectado: "Conectá Meta para ver tus cuentas." **Conectar Meta**.

### Navegación

| Elemento | Especificación |
|---|---|
| Sidebar (≥ lg) | Fondo `paper`, ítems de 40 px con ícono + texto; activo con barra izquierda de 3 px `primary` y texto 600, `aria-current="page"`; contador de propuestas pendientes junto a Piloto; selector de workspace arriba; usuario y tema abajo; colapsable a riel con `[` |
| Riel (md) | 64 px, solo íconos con tooltip y `aria-label` |
| Barra inferior (< md) | 5 destinos de 64 px de alto: Hoy, Métricas, Piloto (con contador), Historial, Más; Más abre hoja con Lanzador, Creativos, Productos, Ajustes y **Pedile a la IA** |
| Barra superior | Título de pantalla, hora de actualización de datos ("Datos de las 14:32"), **Pedile a la IA** con atajo `Ctrl+K` visible en desktop |
| Selector de workspace | Combobox; muestra rol del usuario debajo del nombre |

### Panel de chat (IA)

| Parte | Especificación |
|---|---|
| Contenedor | Drawer derecho 400 px (acoplado en ≥ xl), pantalla completa en < md; `role="complementary"` con `aria-label="Chat con la IA"`; `Esc` cierra y devuelve el foco |
| Encabezado | "Pedile a la IA", aviso fijo de una línea: "Arma borradores. No lanza ni cambia presupuestos.", botón nueva conversación, cerrar |
| Mensajes | Usuario: alineado a la derecha, fondo `primary-soft`. IA: a la izquierda, sin burbuja, texto `ink` con borde izquierdo punteado `pencil` |
| Respondiendo | La respuesta llega completa en JSON (sin streaming): indicador de tres puntos mientras espera; el mensaje se anuncia completo al aparecer (`aria-live="polite"` sobre el último mensaje) |
| Borrador listo | Tarjeta a lápiz con resumen (producto, cuenta, creativos, presupuesto, países) y botón primario **Abrir en el lanzador** |
| Compositor | Textarea autoajustable (1–6 líneas), `Enter` envía, `Shift+Enter` salto, botón **Enviar** 44 px; deshabilitado mientras responde |
| Error / tope | Franja `loss-soft` o `warn-soft` con la causa |

## 7. Pantallas: layout y jerarquía

Orden de lectura = orden de tab = orden de importancia. Cada pantalla tiene título (`h1`) y una sola acción primaria.

### Login `/login`

```
┌───────────────────────────────┐
│ Lanzador (wordmark)           │
│                               │
│ Entrá con tu email            │  h1, --text-xl
│ [ email                     ] │
│ [ Enviarme el link          ] │  primario, ancho completo
│ Sin contraseñas. Te mandamos  │  ink-subtle
│ un link que vence en 15 min.  │
└───────────────────────────────┘
```

| Aspecto | Detalle |
|---|---|
| Layout | Columna centrada de 400 px sobre `paper` con reglado horizontal muy suave en el fondo (24 px, `rule` al 40 %), única pantalla con ese fondo |
| Jerarquía | 1 título, 2 email, 3 botón, 4 explicación |
| Estados | Error de formato inline; 429 → franja `warn-soft` "Probá en unos minutos"; enviado → misma columna cambia a "Revisá tu email" con el email en negrita y **Reenviar** con cuenta regresiva visible ("Reenviar en 42 s") |
| Mobile | Igual, gutter 16 px, botón 48 px |

### Verificar `/ingresar/confirmar`

| Aspecto | Detalle |
|---|---|
| Layout | Misma columna que Login; el token viaja en `#t=` |
| Listo | Título "Confirmá tu ingreso" y primario **Entrar como `<email>`**; no hay POST automático al abrir la página |
| Cargando | Botón en loading ("Entrando…") tras el clic |
| Error (vencido o usado) | Título "Link vencido", frase "Los links duran 15 minutos y sirven una vez.", primario **Pedir otro** (lleva a Login con el email precargado si se conoce) |

### Onboarding `/onboarding`

| Aspecto | Detalle |
|---|---|
| Layout | Columna de 560 px, stepper simple de 4 pasos arriba (Nombre, Conectar Meta, Elegir activos, Primer producto) |
| Paso 1 | Input "Nombre del workspace" + **Crear workspace** |
| Lista de espera | Pantalla propia: "Estás en lista de espera" + qué pasa después; sin acciones salvo **Cerrar sesión** |
| Paso 2 | Explicación de qué permisos pide Meta en 3 renglones + **Conectar Meta** (primario, logo de Meta permitido solo como ícono del botón) |
| Paso 3 | Ver "Elegir activos" en Ajustes › Conexiones (mismo componente) |
| Paso 4 | Formulario de producto embebido + **Saltar** (fantasma) |

### Hoy `/w/:id/hoy`

```
┌ Hoy ──────────────── Datos de las 14:32 [Actualizar] ┐
│ Alertas (si hay)  ▸ franja por alerta, ordenadas por  │
│                     gravedad                          │
│ Gasto de hoy  US$ 1.284,50   ▲ +12 % vs ayer          │  --text-3xl
│ ┌ Cuenta A ──────┐ ┌ Cuenta B ──────┐ ┌ Cuenta C ──┐  │  cards de cuenta
│ │US$ 820  ▲ +8 % │ │US$ 310 ▼ −4 %  │ │ ...        │  │
│ └────────────────┘ └────────────────┘ └────────────┘  │
│ Propuestas del piloto (3)          Últimos lanzam.    │
│ [tarjetas a lápiz]                 [lista reglada]    │
└───────────────────────────────────────────────────────┘
```

| Prioridad | Bloque | Detalle |
|---|---|---|
| 1 | Alertas | Franjas de ancho completo: error (`loss-soft`) primero, aviso después; cada una con acción directa (**Reconectar Meta**, **Ver anuncios rechazados**). Sin alertas, el bloque no se muestra |
| 2 | Total de hoy | Gasto total vs ayer con delta semántico |
| 3 | Cuentas | Grilla de cards (1 col mobile, 2 md, 3 xl): nombre, estado, gasto hoy, delta, ROAS de hoy con marca de equilibrio |
| 4 | Propuestas | Hasta 5 tarjetas de propuesta con **Aprobar** / **Descartar**, link **Ver todas en Piloto** |
| 5 | Últimos lanzamientos | 5 filas regladas: fecha, producto, estado; **Activar** en los que están en pausa |
| Actualizar | Botón secundario; deshabilitado con cuenta regresiva "Actualizar en 0:45" |
| Mobile | Una columna en el orden de la tabla; propuestas antes que cuentas si hay pendientes (aprobar es la tarea principal en el teléfono); botones de aprobar a 44 px de alto y ancho completo |

### Lanzador `/w/:id/lanzador/:launchId?paso=n`

`/w/:id/lanzador` crea o reabre el borrador y redirige a esta ruta; el retorno de Google llega a `/w/:id/lanzador/:launchId?google=ok|error`. Layout común: stepper arriba, contenido en columna de 720 px a la izquierda, **resumen vivo** en columna derecha de 320 px desde xl (cuenta, estructura, producto, cantidad de creativos, presupuesto, países; cada dato clickeable lleva al paso). En < xl el resumen va colapsado en un desplegable bajo el stepper. Pie fijo con Atrás / autoguardado / Siguiente.

| Paso | Layout y jerarquía |
|---|---|
| 1 Cuenta y píxel | 4 combobox apilados (cuenta, página, Instagram, píxel). Debajo de cuenta, chip de salud de la cuenta; si está deshabilitada o con problema de pago, franja `loss-soft` con el motivo y **Siguiente** deshabilitado con explicación |
| 2 Estructura | Dos opciones grandes tipo radio-card (**CBO nueva** / **Conjunto nuevo en CBO existente**) con una línea de explicación cada una. Existente: combobox de campañas y, al elegir, bloque reglado "Se copia de CONJ 4": público, evento, límite de costo. Nombres de campaña y conjunto con chips de placeholders y vista previa |
| 3 Producto y copys | Combobox de producto + **Crear producto** (modal). Línea de estado de landing con ícono (verificada / falló con motivo, que bloquea). Lista de copys guardados con checkboxes. **Generar con IA** abre panel inline debajo: chips de ángulo + **Generar**, 5 tarjetas a lápiz. Toggle "Rotar copys entre anuncios / Un copy por anuncio" con explicación |
| 4 Creativos | Pestañas **Subir** / **Google Drive** / **Copiar de otra campaña** (patrón tabs ARIA). Debajo, la lista final ordenable: asa de arrastre (y botones Subir/Bajar para teclado), miniatura, nombre propuesto a lápiz editable, etiquetas, **Quitar**. Contador "20 creativos". Sin conexión de Google, la pestaña **Google Drive** muestra **Conectar Google** y el callback vuelve al mismo borrador (`?google=ok\|error`) |
| 5 Presupuesto y entrega | Input monetario de presupuesto diario (solo CBO nueva) con tope visible debajo ("Tope del workspace: US$ 300,00") y error si lo supera; radio Mayor volumen / Límite de costo + monto; chips de países (AR preseleccionado) con buscador; select de evento; **Programar inicio** colapsable con fecha y hora local y zona horaria escrita |
| 6 Revisión | Comprobante grande en página (no modal) con todo lo que se crea: campaña/conjunto, nombres finales, N anuncios con su copy y link final con UTM, presupuesto, países, programación, "Advantage+ creative: desactivado". Alertas arriba. Acciones: **Simular** (secundario) y **Lanzar en pausa** (primario, abre comprobante de confirmación). Resultado de simular: lista de errores por campo con link al paso, o "Plan válido: se crean 1 campaña, 1 conjunto, 20 anuncios" |
| Vista de progreso | Reemplaza stepper por encabezado "Lanzando: CBO 16-11 Crema X". Lista de progreso del lanzamiento a todo el ancho. Al terminar en verde: bloque de decisión con tres opciones (**Activar ahora** primario, **Programar**, **Dejar en pausa**) y **Ver en Meta**. Con errores: **Reintentar fallidos** primario y filtro "Solo errores" activado |
| Mobile | Funciona, pero el paso 4 sugiere subir desde la compu si hay más de 5 archivos (nota informativa, no bloqueo). Pie fijo sobre la barra inferior |

### Métricas `/w/:id/metricas`

```
┌ Métricas ────────────────────────── [Exportar CSV] ┐
│ [Rango ▾] [Cuenta ▾] [Producto ▾] [Nivel: Cuenta|Camp|Conj|Anun] │
│ Pestañas: Rendimiento · Mejores anuncios · Qué gana  │
│ Resumen: Gasto | Compras | Valor | ROAS | CPA         │  fila de 5 KPIs
│ ┌───────────────╫──────┬──────┬──────┬──────┬────┐   │
│ │ Nombre        ║ Gasto│Compr.│ ROAS │ CPA  │ ⋯  │   │  tabla sticky
│ │ ...           ║      │      │      │      │    │   │
│ └───────────────╨──────┴──────┴──────┴──────┴────┘   │
└──────────────────────────────────────────────────────┘
```

| Aspecto | Detalle |
|---|---|
| Barra de filtros | Fija bajo la barra superior al scrollear; rango (Hoy, Ayer, 7 d, 14 d, 30 d, Este mes, personalizado) y filtros como combobox; segmented control para nivel (Cuenta, Campaña, Conjunto, Anuncio); refleja la URL; chip "Comparando con 1/11–7/11" |
| KPIs | 5 cifras en fila (2 × 3 en mobile, la sexta celda es la hora de actualización), cada una con delta semántico |
| Tabla Rendimiento | Columnas: nombre (+ estado y candado), gasto, compras, valor, ROAS (con barra de equilibrio), CPA, CTR, CPM; delta bajo cada valor. Acciones por fila: Pausar/Activar optimista con toast **Deshacer**, Escalar (comprobante con slider 1–50 % y monto resultante), Proteger |
| Mejores anuncios | Grilla de miniaturas (2 col mobile, 4 lg, 6 2xl) con ROAS grande, gasto y etiquetas; checkbox de selección; barra de acción inferior "3 elegidos · **Usar en un lanzamiento**" |
| Qué gana | Por dimensión de etiqueta (hook, ángulo, formato, idioma): tabla reglada con barra horizontal de ROAS por etiqueta y línea de equilibrio; CPA al lado. Sin gráficos decorativos |
| Mobile | Filtros en hoja "Filtros (3)"; tabla pasa a lista; acciones en la hoja de detalle; solo lectura cómoda es el objetivo |
| Viewer | Mismas vistas, sin columna de acciones |

### Piloto `/w/:id/piloto`

| Aspecto | Detalle |
|---|---|
| Encabezado | Título, "Última corrida: hoy 12:00 · próxima 18:00", **Correr ahora** (secundario, cuenta regresiva si está limitado) |
| Pestañas | **Pendientes** (con contador) / **Reglas** (admin+) / **Historial** |
| Pendientes | Lista de tarjetas de propuesta a lápiz, una columna de 720 px. Cada una: acción en el título con verbo ("Pausar anuncio", "Escalar campaña +20 %", "Duplicar ganador"), objeto con cuenta, bloque de datos que la justifican (3–4 cifras tabulares con equilibrio), explicación de la IA en `--text-md` (máximo 3 renglones con **Ver más**), regla que la disparó. Acciones: **Aprobar** (primario → comprobante con detalle exacto y monto final si escala) y **Descartar** (secundario, pide motivo opcional en un popover) |
| Al aprobar | La tarjeta pasa a tinta (borde sólido, sello "Aprobada 14:35 por Ana") y a los 2 s se colapsa fuera de la lista |
| Reglas | Lista reglada: switch activar/desactivar, descripción en lenguaje natural con umbrales editables inline (inputs numéricos chicos dentro de la frase: "Pausar anuncio con gasto ≥ [2] × CPA objetivo y [0] compras"); **Guardar reglas** fijo abajo cuando hay cambios |
| Historial | Tabla: fecha, propuesta, decisión, quién, resultado en Meta |
| Mobile | Tarjetas a ancho completo, botones de 44 px apilados (Aprobar arriba); el comprobante como hoja inferior |

### Creativos `/w/:id/creativos`

| Aspecto | Detalle |
|---|---|
| Encabezado | Título, filtro por etiqueta (chips por dimensión), orden (ROAS, más usados, recientes), toggle grilla/lista |
| Grilla | Miniaturas 4:5 (formato de feed), debajo: nombre, etiquetas (punteadas si son de IA sin confirmar), "En 6 anuncios", ROAS acumulado con marca de equilibrio. Checkbox arriba a la izquierda visible al hover/foco y siempre en táctil |
| Selección | Barra de acción inferior fija: "4 elegidos · **Usar en lanzamiento**" |
| Detalle | Panel lateral (hoja en mobile) con preview, etiquetas editables, **Re-etiquetar con IA**, anuncios donde se usó |
| Mobile | 2 columnas |

### Productos `/w/:id/productos`

| Aspecto | Detalle |
|---|---|
| Lista | Tabla reglada: nombre, landing (estado con ícono), precio, ROAS de equilibrio, copys guardados, **Lanzar este producto**. Primario de pantalla: **Nuevo producto**. Filtro "Mostrar archivados" |
| Formulario | Página propia de 640 px con pestañas **Datos** / **Copys**. Datos en grupos: Identidad (nombre), Landing (URL + **Probar** con resultado inline), Texto del anuncio (texto, título, descripción con contadores, CTA), UTM (campos + vista previa del link final en una línea copiable), Economía (precio, costo, moneda en 2 columnas desde md) |
| Economía en vivo | Bloque a la derecha (debajo en mobile) con ROAS de equilibrio en `--text-2xl` y ganancia por venta; se actualiza al tipear |
| Copys | Lista de copys guardados con estrella; **Generar con IA** abre las tarjetas a lápiz |
| Acciones | **Guardar** (primario, pie fijo), **Archivar** (secundario en menú, con comprobante simple) |

### Historial `/w/:id/historial`

| Aspecto | Detalle |
|---|---|
| Pestaña Lanzamientos | Tabla: fecha, producto, cuenta, anuncios "18 ok · 2 error", estado (chip), **Activar** en los en pausa. Clic en fila → vista de progreso del lanzamiento |
| Pestaña Acciones | Tabla de auditoría: cuándo, quién, qué (verbo + objeto), objeto de Meta con id, origen (chip Manual / Piloto / Chat), resultado (chip). Filtros por origen y usuario. Fila expandible con el detalle de antes → después |
| Mobile | Listas regladas; detalle en hoja |

### Ajustes `/w/:id/ajustes`

Layout: navegación secundaria a la izquierda (General, Conexiones, Miembros, IA, Cuenta, Peligro) en ≥ lg; en mobile, lista de secciones que abre cada una. Formularios de 640 px. Secciones no permitidas para el rol no aparecen.

| Sección | Layout y jerarquía |
|---|---|
| General | Grupos: Workspace (nombre, zona horaria, moneda de referencia), Límites (tope de presupuesto por campaña, input monetario), Anuncios (switch "Permitir mejoras de Advantage+ creative" con explicación del riesgo), Plantillas de nombres. **Guardar cambios** en pie fijo que aparece solo con cambios |
| Conexiones | Bloque Meta: estado con chip (Conectado / Vence en 5 días / Reconectar), cuentas habilitadas (lista), vencimiento, acciones **Reconectar**, **Elegir activos**, **Desconectar** (peligro, comprobante que avisa "Se van de la biblioteca N creativos de esas cuentas (siguen en Meta)."). Elegir activos: cuatro grupos (cuentas, páginas, Instagram, píxeles) con checkbox "Todos" por grupo, buscador, contador "3 de 7", **Guardar** fijo. Bloque Google: estado + **Conectar** (el callback vuelve a Conexiones con `?google=ok\|error`) / **Desconectar** |
| Miembros | Tabla: email, nombre, rol (select inline), estado (activo / invitación pendiente), **Quitar** (comprobante). Primario **Invitar** abre modal con email + rol y descripción de cada rol |
| IA | Dos barras: hoy y mes, vs tope, con cifras ("1.240 de 2.000 créditos de IA hoy · 8.300 de 30.000 este mes"); cada barra pasa a `warn` al 80 %. Si `globalExhausted`: "IA en pausa hasta las 21 h." |
| Cuenta | Tema (Claro / Oscuro / Sistema), **Cerrar sesión**, **Cerrar todas las sesiones** (comprobante simple) |
| Peligro | Borde `loss` en el bloque, explicación de qué se borra y qué no ("No toca nada en Meta"), **Borrar workspace** abre comprobante con tipeo del nombre |

### Chat lateral (IA)

| Aspecto | Detalle |
|---|---|
| Apertura | `Ctrl+K` o **Pedile a la IA**; foco va al compositor |
| Layout | Ver componente Panel de chat. En ≥ xl acoplado (el contenido se achica, tablas mantienen scroll propio); en md–lg superpuesto con scrim liviano; en < md pantalla completa con botón volver |
| Jerarquía | 1 conversación, 2 borrador listo (tarjeta), 3 compositor; el aviso de límites siempre visible arriba |
| Salida | **Abrir en el lanzador** navega al paso 6 y cierra el panel en < xl; en ≥ xl lo deja abierto |

### Admin `/admin`

| Aspecto | Detalle |
|---|---|
| Layout | Sin sidebar de workspace; barra superior con "Admin" y salir a mis workspaces |
| Tabla | Workspaces: nombre, miembros, último uso, consumo de IA del mes (cifra + barra), estado de conexión Meta (chip), estado (activo / suspendido / en borrado), acciones **Suspender** (comprobante), **Restaurar** (solo en estado "en borrado") y **Editar créditos de IA (día/mes)** |
| Primario | **Invitar beta** abre modal con email |
| Mobile | Lista; no es prioridad |

## 8. Motion

| Token | Duración | Easing | Uso |
|---|---|---|---|
| `--duration-instant` | 80 ms | `--ease-out` | Hover, cambio de color de botones y filas |
| `--duration-fast` | 140 ms | `--ease-out` | Popovers, menús, tooltips, chips toggle |
| `--duration-base` | 200 ms | `--ease-out` entrada / `--ease-in` salida | Modales, toasts, drawer del chat, hojas mobile |
| `--duration-slow` | 280 ms | `--ease-in-out` | "Pasar a tinta" (único momento orquestado) y colapso de tarjeta aprobada |

| Easing | Valor |
|---|---|
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` |
| `--ease-in` | `cubic-bezier(0.3, 0, 1, 1)` |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` |

Reglas:

- **Pasar a tinta:** el borde punteado `pencil` se vuelve sólido `primary` (cross-fade de dos bordes), el ícono lápiz rota a tilde y el texto pasa de `pencil` a `ink`, en 280 ms. Es el único gesto con personalidad; no se agregan entradas animadas de secciones ni hovers con elevación.
- Modales y hojas: entran con opacidad 0 → 1 y desplazamiento 8 px (modal) o 100 % (hoja); salen más rápido (140 ms).
- Barras de progreso: transición de ancho 200 ms; sin rayas animadas.
- Datos nuevos tras **Actualizar**: la celda que cambió destella fondo `primary-soft` 600 ms y vuelve.
- Optimismo: el chip de estado cambia al instante; si la API falla, vuelve con el mismo tiempo y aparece el toast de error.
- `prefers-reduced-motion: reduce`: todas las duraciones a 0 ms salvo opacidad (80 ms); sin desplazamientos, sin rotación, sin pulso de skeleton, sin destello de celdas; scroll suave desactivado.

## 9. Accesibilidad

Objetivo WCAG 2.2 AA en toda la app (el brief lo exige en login, lanzador, métricas y piloto; se aplica igual en el resto).

| Tema | Regla |
|---|---|
| Foco visible | Anillo 2 px `--color-focus` + offset 2 px en todo elemento interactivo vía `:focus-visible`; contraste ≥ 3:1 verificado; nada de `outline: none` sin reemplazo; el foco nunca queda tapado por la barra fija o el pie del wizard (`scroll-padding` de 72 px arriba y abajo) |
| Labels | Todo input con `<label>` visible; campos obligatorios marcados con texto "(obligatorio)", no solo asterisco; errores con `aria-describedby` y resumen de errores al tope del formulario con links a cada campo |
| Orden de tab | Saltar al contenido (primer elemento), barra superior, navegación, contenido en orden visual, pie fijo. En el wizard: contenido del paso → Atrás → Siguiente. Modales atrapan el foco; al cerrar vuelve al disparador |
| Atajos | `Ctrl+K` chat, `[` colapsa sidebar, `?` muestra la lista de atajos; ninguno de una sola letra activo mientras se escribe en un campo |
| Táctil | Objetivos ≥ 44 × 44 px en dispositivos con puntero grueso (`@media (pointer: coarse)`); en desktop mínimo 24 × 24 con espaciado (criterio 2.5.8); acciones de arrastre (ordenar creativos) tienen alternativa con botones |
| Color | Ningún estado se comunica solo con color (ver semántica del dinero y chips con ícono + texto) |
| Contenido dinámico | `aria-live="polite"` para progreso de lanzamiento (resumen, máx. cada 5 s), resultado de simular, mensaje completo del chat; `role="alert"` para errores bloqueantes |
| Tablas | `<th scope>`, `aria-sort`, caption sr-only que describe filtros activos ("Campañas de Cuenta A, últimos 7 días") |
| Zoom y reflow | Usable al 200 % y a 320 px de ancho sin scroll horizontal de página (las tablas scrollean dentro de su contenedor) |
| Idioma | `lang="es-AR"`; números leídos con su formato local |
| Tiempo | Cuentas regresivas (Reenviar, Actualizar, Correr ahora) se muestran en texto; nada expira mientras el usuario completa un formulario (el borrador se autoguarda) |

## 10. Voz y textos de interfaz

| Regla | Ejemplo |
|---|---|
| Voseo, frases cortas, sentence case | "Elegí la cuenta publicitaria" |
| La acción mantiene su nombre de punta a punta | Botón "Lanzar en pausa" → toast "Lanzamiento creado en pausa" |
| Errores: qué pasó y qué hacer, sin disculpas | "Meta limitó las llamadas de esta cuenta (código 17). Reintentamos solos en 2 minutos." |
| Vacíos invitan a actuar | "No hay propuestas pendientes. El piloto corre de nuevo a las 18:00." |
| Lo de la IA se nombra como propuesta | "Propuesta", nunca "La IA decidió" |

## 11. Sugerencias para el flujo

Cosas que `03-app-flow.md` no define y que afectan la UX. No cambian alcance; quedan para que el dueño del flujo decida.

| # | Pantalla | Sugerencia | Por qué |
|---|---|---|---|
| 1 | Lanzador › progreso | **Adoptada en 03/06.** Si el usuario sale de la vista mientras corre, mostrar un indicador persistente en la barra superior ("Lanzando 14/20") y un toast al terminar, sin polling extra (consultar al volver el foco) | Hoy el polling se corta al salir y el usuario no se entera del final |
| 2 | Hoy y Métricas | **Adoptada en 03/06.** **Deshacer** en el toast de Pausar/Activar optimista (6 s) | Pausar por error una campaña que vende es caro; deshacer es más rápido que buscarla |
| 3 | Lanzador | **Adoptada en 03/06.** Indicador de autoguardado visible en el pie ("Guardado", "Guardando…", "Sin conexión") | El borrador se guarda solo, pero el usuario no lo sabe |
| 4 | Métricas | Elegir columnas visibles y densidad (Compacta/Cómoda), recordado por usuario | Sesiones largas con datos densos; distintas pantallas |
| 5 | Global | **Adoptada en 03/06.** Selector de tema Claro/Oscuro/Sistema en Ajustes › Cuenta | Sesiones largas de noche |
| 6 | Piloto en mobile | Desde Hoy, abrir directamente la propuesta en una hoja con el comprobante, sin pasar por Piloto | Aprobar desde el teléfono es el uso principal en mobile |
| 7 | Lanzador › Revisión | Mostrar la vista previa de un anuncio (copy + creativo + CTA) como se verá en el feed | Reduce errores de copy y link antes de lanzar |
| 8 | Chat | Si el workspace llegó al tope de IA, deshabilitar **Pedile a la IA** con el motivo en tooltip, en vez de fallar al enviar | Evita escribir un pedido largo que no se puede procesar |
| 9 | Global | Página `?` de atajos de teclado | Usuarios intensivos de escritorio |
| 10 | Historial › Acciones | Link desde cada acción de piloto a la propuesta original con su explicación | Auditoría completa del "por qué" |
