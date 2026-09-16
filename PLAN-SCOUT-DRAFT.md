# LolVault — Plan de Scout y Draft (2026-09-16)

Dos funciones nuevas pedidas por Juan:

1. **Scout** — buscar a un jugador puntual por `nombre#tag` y ver, de un vistazo, qué tan bien
   juega esa posición y ese campeón. "Soy analista, necesito datos rápidos del oponente."
2. **Draft** — un clon de [draftgap.com](https://draftgap.com): armar el draft de las dos
   composiciones y que te diga qué conviene pickear.

Complementa a [`PLAN-TECNICO.md`](./PLAN-TECNICO.md), que sigue siendo la fuente de verdad del
resto de la app. Las reglas duras del §8 de ese plan valen acá sin excepción.

---

## 1. Investigación (hecha el 2026-09-16, verificada con requests reales)

### 1.1 No hay partida en vivo

Revisé las **29 herramientas** del MCP de OP.GG: no existe ninguna de *spectator* / partida en
curso. Las de LoL son perfil, historial, detalle de partida, análisis de campeón, sinergias,
matchup de lane, meta por lane, leaderboards, ítems y esports. Nada en vivo.

La única vía legítima es **Spectator-v5 de Riot** (`/lol/spectator/v5/active-games/by-summoner/{puuid}`),
que necesita la Personal API Key que quedó pendiente en septiembre (ver `docs/APIS-LOL.md` §3).

**Decisión:** Scout sale ahora con búsqueda a mano. Se deja un `LiveGameProvider` sin
implementar detrás de una interfaz, para enchufar la partida en vivo el día que llegue la key
sin rehacer la pantalla.

### 1.2 OP.GG no alcanza para el draft

`lol_get_champion_analysis` devuelve **solo 3 counters fuertes y 3 débiles** por campeón. Lo
forcé con `desired_output_fields` pidiendo la lista entera y devuelve los mismos 3. Con eso no
se puede puntuar 170 campeones contra una composición completa, que es exactamente lo que hace
DraftGap.

Lo que **sí** sirve de OP.GG: `lol_list_lane_meta_champions` da la tier list completa por lane
(win rate, pick rate, ban rate, tier, rank de todos los campeones de esa lane).

### 1.3 De dónde saca los datos DraftGap

El repo ([vigovlugt/draftgap](https://github.com/vigovlugt/draftgap), MIT, último commit
2026-08-30) arma su dataset desde **Lolalytics** y lo publica en su propio bucket S3
(`bucket.draftgap.com/datasets/v5/*.json`).

**No vamos a usar su bucket**: es su ancho de banda y no nos autorizó. Vamos a la fuente, igual
que ellos.

Ojo: el código del repo apunta a `ax.lolalytics.com/mega/?ep=champion`, que **hoy da 404**.
Migraron a scrapear el HTML de `lolalytics.com/lol/<champ>/build/` y parsear el estado
serializado de Qwik — 628 KB por página, ~855 páginas por sync, ~530 MB diarios y un parser
frágil atado a cómo Qwik serializa.

**Encontré una salida mejor.** Probando endpoints contra `a1.lolalytics.com/mega/` (el host que
usa el sitio hoy) aparecieron dos que devuelven JSON limpio:

| Dato | Endpoint | Medido |
|---|---|---|
| **Matchups** | `ep=counter` + `lane` + `vslane` | 200 · ~7 KB · 0,25 s |
| **Sinergias** | `ep=build-team` + `lane` | 200 · 19 KB · 0,26 s |

Parámetros comunes: `v=1&tier=emerald_plus&queue=ranked&region=all&patch=<x.y>&c=<championId>`.
El `patch` sale de Data Dragon (`versions.json` → `16.18.1` → `16.18`).

`ep=counter` acepta `vslane`, así que cubre **matchups entre lanes distintas** (mid contra
jungla, etc.), que es justo lo que necesita el análisis completo:

```
c=ahri&lane=middle&vslane=middle  → 78 filas
c=ahri&lane=middle&vslane=jungle  → 71 filas
c=ahri&lane=middle&vslane=top     → 90 filas
c=ahri&lane=middle&vslane=bottom  → 46 filas
```

Cada fila: `{cid, vsWr, n, d1, d2, allWr, defaultLane}` — `cid` es la key numérica de Riot (la
misma de nuestra tabla `champions`), `vsWr` el win rate contra ese campeón, `n` la cantidad de
partidas.

`ep=build-team` devuelve `{team_h: ["id","wr","d1","d2","pr","n"], team: {top: [...], jungle: [...], ...}}`.

**Costo real del sync completo:**

| | Requests | Tamaño |
|---|---|---|
| Matchups (171 campeones × 5 lanes × 5 vslanes) | 4.275 | ~30 MB |
| Sinergias (171 × 5 lanes) | 855 | ~16 MB |
| **Total** | **~5.130** | **~46 MB** |

Con una espera prudente entre requests son ~30-45 minutos, una vez por día, de noche. Para un
homelab de 2 núcleos es despreciable. **Muy por debajo** de los 530 MB del scraping de HTML.

### 1.3.1 Scaling: `q-data.json` en vez del HTML

El panel de DraftGap tiene una fila **Scaling** (cómo le va al equipo según cuánto dura la
partida). Ese dato no está en `ep=counter` ni en `ep=build-team`, y probé quince nombres más de
endpoint sin suerte.

Pero Lolalytics es una app Qwik, y Qwik publica el estado de cada página como JSON:

```
https://lolalytics.com/lol/<champ>/build/q-data.json?tier=emerald_plus&region=all&patch=16.18&lane=<role>
```

Verificado en dos campeones: **200, ~183 KB, 0,35 s**, y adentro está `sidebar.time` /
`timeWin`, que es exactamente la serie que usa DraftGap. Son 183 KB contra los 628 KB del HTML,
y es JSON en vez de regex sobre una página.

La contra: el formato usa *string interning* (`{"time":"2ax","timeWin":"2b5"}` son índices al
array `_objs`), así que hace falta un resolver de punteros. Es la parte frágil de todo esto.

**Por eso Scaling va en una fase aparte (Fase E) y opcional.** Las fases A a D no dependen de
este parser: si Lolalytics cambia la serialización de Qwik, se cae Scaling y nada más.

### 1.4 Riesgo, y cómo lo acotamos

Estos endpoints de Lolalytics **no están documentados ni tienen términos publicados**. Pueden
cambiar, cortarse o bloquearnos sin aviso. Juan decidió avanzar igual sabiendo esto. Mitigación:

- **Una sola pasada por día**, de noche, con espera entre requests. Nunca un request por
  pantalla que abre un usuario.
- **Todo cacheado en SQLite.** Si Lolalytics se cae o nos bloquea, el draft sigue funcionando
  con lo último que bajamos, y la UI dice de cuándo son los datos.
- **User-Agent que identifica la app** (`LolVault/1.0 (private app)`), como ya hace el cliente
  de OP.GG. Nada de disfrazarse de navegador.
- Detrás de una interfaz `DraftDataSource`, para poder cambiar de fuente sin tocar la UI —
  igual que `MatchProvider`.
- Si un sync falla, se reintenta a la noche siguiente. Nunca se borra lo que ya está.

### 1.5 La matemática de DraftGap (para clonar, no inventar)

De `packages/core/src` (MIT — hay que acreditarlo en el README y en el Acerca de):

```ts
ratingToWinrate(d) = 1 / (1 + 10^(-d/400))      // Elo clásico
winrateToRating(w) = -400 * log10(1/w - 1)
```

`analyzeDraft` suma y resta ratings:

```
total = ratingAliados + duosAliados + matchups − ratingEnemigos − duosEnemigos
winrate = ratingToWinrate(total)
```

Dos detalles que **no** hay que perderse:

1. **Los matchups se simetrizan**: se promedia el matchup A-vs-B con el inverso de B-vs-A
   (`wins = (matchupStats.wins + enemyLosses) / 2`), y se le resta el rating *esperado* por la
   diferencia de win rate base de cada campeón. Así el número mide el matchup en sí, no que uno
   de los dos sea mejor campeón.
2. **Prior bayesiano contra el ruido**: a cada estadística se le suman `priorGames` partidas
   ficticias con el win rate esperado (`very-low: 3000 … very-high: 250`). Sin eso, un matchup
   con 12 partidas jugadas domina el ranking.

`getSuggestions` prueba cada campeón libre en cada rol libre, corre `analyzeDraft` y ordena por
win rate.

---

## 2. Decisiones tomadas (Juan, 2026-09-16)

| Tema | Decisión |
|---|---|
| Datos del draft | **Lolalytics completo, paridad real** con DraftGap. Matriz pairwise entera, sync diario cacheado. |
| Partida en vivo | **Búsqueda a mano ahora**, con `LiveGameProvider` preparado para cuando llegue la key de Riot. |
| Navegación | **Fusionar Vaults y Black list** en una tab con segmentado, y usar el lugar libre para Scout. Quedan 5 tabs. |

---

## 3. Navegación nueva

Hoy: `Votaciones · Vaults · Black list · Amigos · Perfil` (5, el máximo de iOS).

Queda:

| Tab | Contenido |
|---|---|
| Votaciones | igual |
| **Castigos** | segmentado **Vaults / Black list**. El estado del segmento va en la URL (`?tipo=vaults`), nunca solo en el cliente. `/vaults` y `/black-list` siguen andando y redirigen, para no romper links ni notificaciones push ya mandadas. |
| **Scout** | segmentado **Jugador / Draft**. |
| Amigos | igual |
| Perfil | igual |

---

## 4. Fases

### Fase A — Scout de jugador

Pantalla `/scout`: input `nombre#tag` → perfil del rival con los datos que pide Juan.

- Reusa `getMatchProvider()`: `getProfile()` + `listMatches()`. **Cero código nuevo de red.**
- Cachea en las tablas que ya existen (`player_matches`, `match_details`, `player_stats_sync`),
  con la misma ventana de 10 minutos. Un rival buscado es un jugador más en el caché.
- **Qué mostrar** (esto es lo que pidió: datos rápidos, de analista):
  - Rango por cola, nivel, win rate.
  - **Por posición**: partidas, win rate y KDA en cada lane de las últimas 20 partidas, para
    responder "¿qué tan bien juega esta posición?".
  - **Por campeón**: los campeones de la temporada (`seasonChampions` ya viene en
    `SummonerProfile`) más los de las últimas 20 partidas, con partidas / win rate / KDA.
  - Últimas partidas, con link al detalle que ya existe (`/partidas/[matchId]`).
  - Si el jugador está en la black list: **badge bien visible**. Es información de analista.
- Botón **"Proponer para la black list"** con el nombre precargado. Cierra el círculo con lo
  que ya existe.
- `LiveGameProvider` declarado en `features/scout/live-game.ts`, con una única implementación
  `unavailable` que devuelve `null`, y la UI preparada para mostrar los 5 rivales cuando exista.

### Fase B — Ingesta de Lolalytics

- `features/draft/lolalytics/` con el cliente (los dos endpoints), el parser y sus tests contra
  fixtures guardadas.
- Tablas nuevas (migration versionada, **nunca `drizzle-kit push`**):
  - `draft_champion_stats` — (championKey, role) → games, wins, patch, updatedAt.
  - `draft_matchups` — (championKey, role, enemyChampionKey, enemyRole) → games, wins.
  - `draft_synergies` — (championKey, role, allyChampionKey, allyRole) → games, wins.
  - `draft_sync_runs` — cuándo corrió, qué parche, cuántos requests, si falló y por qué.
- Job de sync: **no un cron del sistema**. Un endpoint interno que dispara el sync si pasaron
  más de N horas, más un comando `npm run draft:sync` para correrlo a mano. Throttling
  explícito entre requests y tope total de tiempo.
- Si el parche nuevo tiene pocas partidas (`analysed` bajo), caer al parche anterior.
- **Criterio de aceptación:** un sync completo termina, la base queda con la matriz, y una
  segunda corrida no duplica filas.

### Fase C — Motor de análisis

- `features/draft/analysis.ts`: puerto directo de la matemática del §1.5. **Funciones puras,
  sin tocar la base**, como `vault-rules.ts`.
- Tests con números a mano: un matchup simétrico da 0, un campeón con 12 partidas no domina el
  ranking (prior), el total de una comp espejo da 50 %.

### Fase D — Pantalla de draft y panel de análisis

`/scout?tipo=draft`: dos columnas (tu equipo / enemigo), 5 slots cada una, grilla de campeones
con la búsqueda sin tildes que ya existe.

Dos solapas, como DraftGap: **Draft** (armar y ver sugerencias) y **Draft Analysis** (el
desglose completo). Juan pidió explícitamente el panel entero, no solo la sugerencia de pick.

**Solapa Draft**
- Win rate estimado de la comp y, para cada rol libre, los mejores picks ordenados, con el
  desglose (cuánto viene del matchup, cuánto de la sinergia).
- Selector de riesgo (el prior de DraftGap).
- Encabezado: parche y **de cuándo son los datos** ("actualizado hace 2 horas").

**Solapa Draft Analysis** — todo sale del mismo `analyzeDraft`, que ya devuelve cada pieza
(`allyChampionRating`, `enemyChampionRating`, `allyDuoRating`, `enemyDuoRating`,
`matchupRating`, `totalRating`, `winrate`). Es capa de presentación, no cálculo nuevo:

| Bloque | Contenido |
|---|---|
| Resumen por lado | Champions · Matchups · Duos · **Winrate**, para aliados y para enemigos. |
| Ally / Opponent overview | Tabla por rol: Champion, **Base**, **Matchup**, **Duo**, **Total**, con la fila de totales. |
| Ally / Opponent champions | Rol, campeón y win rate base. |
| Matchups | Rol, aliado, win rate, **ganador**, rol, oponente. Con selector **Head to head / All** (head to head = solo mismo rol; all = los 25 cruces). |
| Ally / Opponent duos | Los 10 duos por lado con su win rate. |
| Scaling | Fase E. Hasta entonces **no se muestra el bloque** (nunca un placeholder con 50,00). |

- Las tablas de matchups y duos llevan el rótulo **"win rates normalizados"**: el número ya
  tiene descontada la fuerza base de cada campeón (§1.5), que es lo que las hace comparables.
- Con el draft vacío todo da 50,00: es correcto y es lo que hace DraftGap.
- Mobile-first de verdad: en iPhone ni las dos comps ni una tabla de 6 columnas entran a lo
  ancho. El panel va apilado, cada tabla en su `overflow-x` o replegada a lista. Revisar con la
  skill `ui-ux-pro-max` antes de maquetar.

### Fase E — Scaling (opcional)

Ingesta de `q-data.json` (§1.3.1) para la serie por duración de partida, con su resolver de
punteros Qwik aislado en un módulo propio y tests contra una fixture guardada.

- +855 requests y ~153 MB por sync. Corre **después** del sync principal y, si falla, no
  invalida nada de lo anterior.
- Es la parte más frágil del proyecto: si Lolalytics cambia la serialización, se apaga este
  bloque y las fases A-D siguen intactas.

---

## 5. Reglas para esta feature

Además de las del §8 del plan técnico:

1. **Nunca** llamar a Lolalytics desde el render de una página. Solo el job de sync.
2. La ingesta corre **del lado servidor**, nunca desde el cliente.
3. Acreditar a DraftGap (MIT) y a Lolalytics en el Acerca de, junto al aviso de Riot que ya está.
4. Las fixtures de Lolalytics son datos públicos de campeones: no hay nada personal que
   anonimizar, pero se guardan recortadas (2-3 campeones, no las 5.130 respuestas).
5. Scout no inventa una fuente nueva: usa `MatchProvider`, que ya está cacheado y probado.
6. El `puuid` y el Riot ID de un rival buscado se guardan igual que los de un amigo — y valen
   las mismas reglas: **no commitear IDs reales en fixtures**.
