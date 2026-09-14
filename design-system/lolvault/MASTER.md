# LolVault — Design System (MASTER)

> Fuente de verdad visual. Un override por página iría en `pages/<pagina>.md` (hoy no hay).

**Dirección: iOS clásico** (Apple HIG, pre-Liquid Glass). Listas agrupadas, fuente del
sistema, tab bar abajo, sheets, colores de sistema. Debe sentirse como una app nativa de
iPhone y escalar a desktop como una app de iPad/macOS.

> **Origen:** `ui-ux-pro-max --design-system` no devolvió un resultado compatible con "iOS
> clásico" en dos intentos (propuso landings de marketing con paletas rosa/violeta). **Estos
> tokens son una alternativa propia** basada en los colores de sistema de iOS, con el contraste
> WCAG **medido** y ajustado donde el color de Apple no llega a AA. Las reglas de UX sí salen
> de la skill (`references/pro-rules.md`, `quick-reference.md`).

---

## 1. Color (tokens semánticos)

Nunca usar hex sueltos en componentes: siempre el token. El modo oscuro sigue a
`prefers-color-scheme` (el iPhone ya lo maneja por sistema).

| Token | Light | Dark | Uso |
|---|---|---|---|
| `--bg-grouped` | `#F2F2F7` | `#000000` | Fondo de pantalla (listas agrupadas) |
| `--bg-cell` | `#FFFFFF` | `#1C1C1E` | Celdas, cards, sheets |
| `--bg-cell-2` | `#F2F2F7` | `#2C2C2E` | Campos de búsqueda, controles dentro de celdas |
| `--fill-pressed` | `rgba(0,0,0,.08)` | `rgba(255,255,255,.10)` | Estado presionado de celda |
| `--label` | `#000000` | `#FFFFFF` | Texto principal |
| `--label-2` | `#6C6C70` | `#AEAEB2` | Texto secundario (5.2:1 / 7.7:1) |
| `--label-3` | `#8E8E93` | `#8E8E93` | **Solo** placeholders e íconos decorativos, nunca texto informativo |
| `--separator` | `#C6C6C8` | `#38383A` | Hairlines entre celdas (decorativo) |
| `--tint` | `#0066D6` | `#0A84FF` | Links, íconos activos, tab seleccionado (5.4:1 / 4.7:1) |
| `--tint-fill` | `#0066D6` | `#0066D6` | Fondo de botón primario (label blanco, 5.4:1 en ambos) |
| `--on-tint` | `#FFFFFF` | `#FFFFFF` | Texto sobre `--tint-fill` |
| `--danger` | `#D70015` | `#FF453A` | Votar en contra, cancelar, errores (5.4:1 / 5.0:1) |
| `--success` | `#248A3D` | `#30D158` | Aprobado: **ícono/punto + texto en `--label`** (4.4:1 light, no apto para texto chico) |
| `--warning` | `#C93400` | `#FF9F0A` | Votación por vencer (5.3:1 / 8.3:1) |
| `--vault` | `#8A6D1F` | `#C8AA6E` | Acento "oro Hextech": badge **VAULTEADO**, contador de días (4.9:1 / 7.6:1) |

Por qué no `#007AFF`: sobre blanco da **4.0:1** y sobre `#F2F2F7` **3.6:1**, así que no pasa AA
para texto de 17px. `#0A84FF` con label blanco da 3.65:1, y por eso el botón primario usa
`#0066D6` también en oscuro.

**El color nunca es el único indicador**: estados con ícono + texto ("Aprobado", "Faltan 2 votos").

## 2. Tipografía

**Fuente del sistema, sin webfonts:**
`font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;`
En iPhone/Mac renderiza SF Pro nativa, en el resto cae a la del sistema. Cero peso de carga.
Números en contadores: `font-variant-numeric: tabular-nums`.

Escala (px, tamaño/line-height/peso), calcada de los text styles de iOS:

| Token | Tamaño | LH | Peso | Uso |
|---|---|---|---|---|
| `large-title` | 34 | 41 | 700 | Título de pantalla (nav bar grande) |
| `title-2` | 22 | 28 | 700 | Título de sheet, secciones en desktop |
| `title-3` | 20 | 25 | 600 | Nombre del campeón en detalle |
| `headline` | 17 | 22 | 600 | Título de celda, botones |
| `body` | 17 | 22 | 400 | Texto general, **inputs** (≥16 evita el zoom de iOS) |
| `subhead` | 15 | 20 | 400 | Subtítulo de celda |
| `footnote` | 13 | 18 | 400 | Header/footer de sección agrupada (uppercase no; iOS moderno usa sentence case) |
| `caption` | 12 | 16 | 400 | Metadata ("hace 2 h") |
| `tab-label` | 11 | 13 | 500 | **Solo** labels del tab bar |

Usar `rem` (base 16px) para respetar el tamaño de texto del usuario. Probar con zoom al 200%.

## 3. Espaciado, radios, tamaños

- Ritmo 4/8: `4, 8, 12, 16, 20, 24, 32, 44`.
- Gutter de pantalla: **16px** en teléfono, **20px** desde 768px.
- Celda: alto mínimo **44px** (con subtítulo ~60px), padding horizontal 16px.
- **Touch targets ≥ 44×44px** (expandir el área si el ícono es chico).
- Radios: grupo de celdas `10px`, botón `12px`, sheet `16px` arriba, tile de campeón `12px`,
  avatar circular.
- Hairline: `border-width: 0.5px` (Safari lo soporta); en desktop, 1px.

## 4. Materiales y elevación

- **Nav bar y tab bar translúcidos:** `background: color-mix(in srgb, var(--bg-cell) 82%, transparent); backdrop-filter: saturate(180%) blur(20px);`
  con hairline `--separator` en el borde.
  - `@media (prefers-reduced-transparency: reduce)` → fondo opaco `--bg-cell`.
- Sin sombras en celdas (el contraste de fondo grouped/cell alcanza). Sombra solo en
  sheets/modales en desktop: `0 10px 40px rgba(0,0,0,.18)`.
- Scrim de sheet: `rgba(0,0,0,.4)` light y `rgba(0,0,0,.6)` dark.

## 5. Iconos

- **Lucide** (`lucide-react`), trazo **2px**, tamaños `20` (en celdas) y `24` (tab bar/nav).
  Una sola familia y un solo estilo: outline, con el tab activo en el mismo ícono y color `--tint`.
- **No usar SF Symbols** (su licencia limita el uso a plataformas Apple) **ni emojis como íconos**.
- Íconos junto a texto visible: `aria-hidden="true"`. Botón con solo ícono: `aria-label`.
- Fotos de campeones: las oficiales de Data Dragon, sin recolorear ni deformar (`object-fit: cover`).

## 6. Movimiento

| Interacción | Duración | Easing |
|---|---|---|
| Tap feedback (celda/botón) | 100ms | fondo `--fill-pressed` / opacidad .6, **sin mover el layout** |
| Sheet entra | 350ms | `cubic-bezier(0.32, 0.72, 0, 1)` |
| Sheet sale | 250ms | mismo (salir es más rápido que entrar) |
| Cambio de voto / contador | 200ms | `ease-out`, animar `transform`/`opacity`, nunca `width`/`height` |

`prefers-reduced-motion: reduce` → solo cross-fade de 150ms. No hay animaciones de scroll/GSAP.
Sin hover-only: en desktop el hover es un extra (`@media (hover: hover)`).

## 7. Layout adaptativo

| Ancho | Navegación | Contenido |
|---|---|---|
| < 768 | **Tab bar** abajo (49px + `env(safe-area-inset-bottom)`) | Una columna, gutter 16 |
| 768–1023 | Tab bar | Columna centrada `max-width: 680px` |
| ≥ 1024 | **Sidebar** izquierda 260px (estilo iPadOS, lista agrupada) | Columna `max-width: 720px`; grilla de campeones más ancha |
| ≥ 1440 | Sidebar | Contenido + panel de detalle a la derecha (split view) en Amigos/Vaults |

- Sheet (teléfono) → modal centrado `max-width: 480px` (desktop).
- Grilla de campeones: `repeat(auto-fill, minmax(72px, 1fr))` en teléfono y `minmax(96px, 1fr)` en desktop.
- Nunca scroll horizontal en el body.

## 8. PWA / iOS

- `viewport`: `width=device-width, initial-scale=1, viewport-fit=cover` (**sin** `maximum-scale`).
- `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style: default`,
  `apple-touch-icon` 180px, manifest con `display: standalone` y `theme_color` por esquema.
- Safe areas: nav bar con `padding-top: env(safe-area-inset-top)`, tab bar y botones fijos con
  `env(safe-area-inset-bottom)`. El contenido scrolleable lleva padding inferior igual al tab bar.
- `-webkit-tap-highlight-color: transparent` (el feedback lo da §6), `overscroll-behavior-y: none` en el shell.
- No deshabilitar zoom ni selección de texto de forma global.

## 9. Componentes clave

- **Celda de votación:** foto del campeón 44px + "Juan — Yasuo" (headline) + "7 días · propuesto por Cami" (subhead, `--label-2`) + a la derecha, progreso **"2/3"** con 3 puntos (llenos `--tint`) y tiempo restante (`caption`, `--warning` si faltan < 6 h).
- **Botones de voto:** dos botones de ancho completo: **"A favor"** (`--tint-fill`) y **"En contra"** (tinted: fondo `--bg-cell-2`, texto `--danger`). El elegido queda marcado con ícono de check + texto "Votaste a favor". Si sos el acusado: celda informativa "No podés votar tu propio vault".
- **Badge VAULTEADO:** ícono de candado + "Vaulteado · quedan 3 días", texto `--vault` sobre `--bg-cell-2`, radio 6px, `caption` 600.
- **Tile de campeón:** imagen cuadrada con radio 12 y nombre `caption` debajo (una línea, `text-overflow: ellipsis`). Si el jugador ya lo tiene vaulteado, overlay oscuro + candado y deshabilitado.
- **Segmented control** (Activos / Historial): iOS, fondo `--bg-cell-2` y segmento seleccionado `--bg-cell`.
- **Estados vacíos** escritos a propósito: "Nadie jugó tan mal todavía. Por ahora.", en vez de una lista vacía.

## 10. Anti-patrones (evitar)

Ripples de Material · FABs · gradientes violetas "de IA" · glassmorphism en el contenido (el vidrio
es solo para las barras) · webfonts · emojis como íconos · texto informativo en `--label-3` ·
`#007AFF` como color de texto · hover-only · animar `width/height` · `maximum-scale=1`.

## 11. Checklist antes de entregar UI

Aplicar el **Pre-Delivery Checklist** de
`.claude/skills/ui-ux-pro-max/references/pro-rules.md` completo. Lo más importante acá:
- [ ] 375px portrait + landscape, 768, 1024, 1440
- [ ] Light **y** dark revisados por separado
- [ ] Targets ≥ 44px, safe areas en nav bar / tab bar / sheet
- [ ] Texto al 200% sin romper celdas ni contadores
- [ ] `prefers-reduced-motion` y `prefers-reduced-transparency`
- [ ] Foco visible con teclado en desktop, y sticky bars que no tapan el foco
