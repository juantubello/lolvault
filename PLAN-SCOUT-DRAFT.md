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

**Medido de nuevo el 2026-09-17, antes de arrancar la fase.** La fuente sigue viva y sale más
barata de lo previsto, porque se puede reusar el filtro de rol de §1.5.3 y pedir sólo los pares
(campeón, rol) que se juegan de verdad:

| | Estimado en el plan | Medido |
|---|---|---|
| Requests por sync | 855 | **389** |
| Tráfico | 153 MB | **76 MB** |
| Por request | — | 200 KB · 0,39 s |

**La regla del formato, que era "la parte frágil", quedó especificada y no adivinada:** todo
string que aparece adentro de un contenedor de `_objs` es un puntero en base 36, y **un solo
salto** llega al literal. No hay prefijos: los literales viven como entradas directas de `_objs`.
Verificado con un caso que no deja dudas: `{"annie": "1"}` → `_objs[1] === "Annie"`. La serie
está en el **único** objeto con `time` y `timeWin` a la vez (uno solo en los tres campeones
probados), así que se encuentra buscándola, sin depender de un índice fijo.

**Validación de que el dato significa lo que creemos.** Tres campeones, tres formas de curva, y
cada una es la que se espera:

| Campeón | Tramo 3 (~20-25 min) | Tramo 6 (~35-40 min) | Lectura |
|---|---|---|---|
| Kayle top | 40,89 % | **61,25 %** | escalado de manual |
| Ahri mid | 52,44 % | 52,57 % | pico de media partida |
| Thresh support | 54,15 % | 52,89 % | campeón de early |

Y los 7 tramos de Ahri suman 52,78 %, contra el 52,79 % que ya teníamos guardado para ahri/mid:
la serie cubre **todas** las partidas, no un subconjunto.

**Los tramos no vienen rotulados** — son 1..7 y el JSON no dice la duración. La inferencia es
**<15, 15-20, 20-25, 25-30, 30-35, 35-40 y 40+**, apoyada en dos cosas: el primer tramo es apenas
el 0,95 % de las partidas de Ahri y el 0,97 % de las de Kayle, que es lo que se espera de los
remakes dado que no se puede rendir antes de los 15 minutos (si el primer tramo fuera "<20" sería
~8-10 %); y los 7 tramos se pliegan exactamente en los 5 que muestra DraftGap (1+2 → 0-20,
6+7 → 35+). Es una inferencia, no un dato de la fuente, y hay que tratarla como tal.

**Interpretación implementada de “team winrate normalized”.** La fórmula exacta de DraftGap no
está expuesta. En la captura de referencia, las dos líneas dan 53,18 % y 48,75 % en el mismo tramo:
suman 101,93 %, así que no son probabilidades complementarias de una partida entre ambos drafts.
La lectura que mejor explica que ambas ronden 50 % es tratarlas como curvas independientes. Para
cada campeón, el win rate del tramo se encoge hacia su propio win rate general con el prior del
riesgo elegido; su aporte es `rating(tramo ajustado) − rating(general)`, y la curva del equipo es
`ratingToWinrate` de la suma de los cinco aportes. Así se mide cuánto mejor o peor que su propio
promedio rinde la composición a esa duración, y un equipo vacío queda neutral en 50,00 %.

**Casos borde medidos:**

- Un combo raro (sivir/support) devuelve **200 con serie real pero inservible**: 157 partidas en
  tramos de 8 a 50. No alcanza con que haya datos; hay que exigir volumen.
- Un campeón inexistente devuelve **404 con un cuerpo que igual parsea como JSON**. O sea que
  "parseó bien" **no** es validación: hay que mirar el status y que el contenedor exista.

### 1.3.2 Casos borde verificados (el parser tiene que aguantarlos)

Probados contra el endpoint real, con las respuestas guardadas para usar de fixtures:

| Caso | Qué devuelve |
|---|---|
| Campeón que no se juega en esa lane (Leona mid) | **200** con `counters: []`. Es un caso legítimo, no un fallo: no abortar el sync. |
| `build-team` de una lane sin datos | **200** con filas igual, pero de muestra chica. Filtrar por `n` mínimo antes de guardar. |
| Campeón inexistente | **200** con `{"status":404}` **en el cuerpo**. |
| Endpoint mal escrito | **200** con el texto plano `invalid end point`, que no es JSON. |

**La regla que sale de esto:** el status HTTP no alcanza para decidir si la respuesta sirve.
Hay que validar la forma del cuerpo siempre, como ya hace `opgg-provider.ts` con su
`ResponseShapeError`, y envolver todo `JSON.parse`.

### 1.3.3 Usar la ventana de 30 días, no el parche exacto

El parámetro `patch` acepta una ventana móvil en días además del número de parche. Medido con
ahri/middle:

| `patch` | Partidas analizadas | Filas de matchup |
|---|---|---|
| 7 (última semana) | 12,2 M | 78 |
| 16.18 (parche actual) | 12,4 M | 78 |
| 16.17 (parche anterior) | 29,1 M | 104 |
| **30 (últimos 30 días)** | **57,1 M** | **130** |

El parche recién salido tiene un quinto de las partidas y **52 matchups menos**. Con esa muestra
el prior bayesiano aplasta todo contra 50 % y las sugerencias quedan grises e inútiles.

**Decisión:** default `patch=30`. Resuelve el problema del parche recién salido sin necesidad de
lógica de fallback al parche anterior, y da más cobertura. En la UI se muestra "últimos 30 días",
no un número de parche, que sería mentira. El parche exacto queda como opción configurable.

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

### 1.5.1 Las duplas NO se calculan como los matchups

Es la trampa más fácil de invertir, y si se invierte el resultado sigue pareciendo razonable:

| | Matchup (se enfrentan) | Dupla (mismo equipo) |
|---|---|---|
| Rating esperado | `rating(A) − rating(B)` (**resta**) | `rating(A) + rating(B)` (**suma**) |
| Simetrización | promedio de A-vs-B con el **inverso** de B-vs-A (las derrotas del rival cuentan como victorias propias) | promedio simple de A-con-B y B-con-A |

El resto es igual en los dos casos: se le suma el prior bayesiano con el win rate esperado, y el
rating final es `ratingReal − ratingEsperado`, o sea cuánto se despega la pareja (o el
enfrentamiento) de lo que se esperaría por la fuerza individual de cada campeón.

Las duplas recorren **pares no ordenados** (i < j) de los roles ya elegidos: con cinco campeones
son diez parejas por equipo.

### 1.5.2 La simetrización no es opcional: el sesgo está medido

Con la matriz ya ingestada (173 campeones, 140.266 matchups, 237.480 sinergias) medí si las dos
direcciones de un matchup son complementarias. **No lo son**, y el desvío es sistemático.

Sobre **6.828 pares** de mismo carril con al menos 500 partidas en ambas direcciones, sumando el
win rate de A-contra-B con el de B-contra-A (el ideal sería 100 %):

| | Suma de winrates |
|---|---|
| Mínimo | 99,6 % |
| Percentil 25 | 102,7 % |
| **Mediana** | **103,4 %** |
| Percentil 75 | 104,2 % |
| Máximo | 109,9 % |
| Fuera del rango 95-110 | **0 pares** |

La cantidad de partidas entre direcciones también coincide: 1,21 % de diferencia mediana, con el
peor caso en 11,8 %.

**Qué significa.** El desvío es parejo, no errático: si hubiera un error de mapeo entre `wins` y
`games` se verían pares disparatados (sumas de 150 %, de 40 %) mezclados con otros correctos, y no
hay ninguno. Lolalytics reporta cada dirección con un sesgo positivo de ~3,4 puntos, casi seguro
porque `vsWr` ya viene ajustado por su cuenta y no es un win rate crudo cabeza a cabeza.

Las sinergias tienen el **mismo sesgo**: con 200+ partidas el promedio es 51,3 % en vez de 50 %.

**Consecuencia para la Fase C:** promediar A-vs-B con el inverso de B-vs-A **no es un refinamiento,
es lo que cancela este sesgo**. Sin simetrizar, cada matchup entra inflado ~1,7 puntos, y una comp
de cinco contra cinco acumula eso en veinticinco cruces.

`getSuggestions` prueba cada campeón libre en cada rol libre, corre `analyzeDraft` y ordena por
win rate.

### 1.5.3 Sin filtro de rol, el que no tiene datos gana

Apareció al verificar la Fase D1, y es el defecto más grave que tuvo la pantalla.

Un campeón sin partidas en un rol recibe rating **0**, que es exactamente neutral. Un campeón real
con matchups malos recibe un rating **negativo**. Entonces, en un draft que vas perdiendo, **no
tener datos le gana a tener datos malos**: la lista recomendaba Sivir support (0 partidas) por
encima de Thresh (846.206). Los primeros veinte puestos eran Sivir, Draven, Aphelios, Kassadin y
compañía, todos empatados en el mismo número — que era, literalmente, el win rate del draft *sin*
elegir support.

El sesgo es asimétrico y pega donde más duele: del lado que va ganando, neutral es un mal puesto y
la lista sale bien; del lado que va perdiendo, neutral es el mejor puesto y la lista se vuelve
inútil. Justo el lado que necesita la sugerencia.

**Umbral, medido sobre la matriz.** Un campeón juega un rol si tiene **≥ 1.000 partidas** en él
**y** el rol es **≥ 2 % de sus propias partidas**. La proporción es la que separa de verdad:

| Campeón en support | Partidas | % de sus partidas | ¿Entra? |
|---|---|---|---|
| Thresh | 846.206 | 100 % | sí |
| Ivern | 8.692 | 10,7 % | sí |
| Sion | 10.975 | 5,1 % | sí |
| Sett | 9.692 | 2,9 % | sí |
| Syndra | 10.017 | 1,6 % | no |
| Ahri | 5.466 | 1,0 % | no |
| Akali | 100 | 0,02 % | no |
| Sivir | 0 | 0 % | no |

El corte deja entre 40 y 95 candidatos por rol (support: 71 de 173). El mínimo absoluto de 1.000
partidas no descarta nada que la proporción ya no descarte en esta ventana de 30 días: está como
red de seguridad para un parche recién salido, con la matriz todavía flaca.

Los descartados **siguen siendo elegibles** — se buscan por nombre y se pueden poner en cualquier
casillero — pero van al fondo y **sin número**, porque su estimación no significaría nada.

**Se ranquea la lista entera, no un top.** Con el filtro puesto quedan ~70 candidatos y calcularlos
todos cuesta 6-9 ms, así que toda la grilla habla en la misma unidad (el win rate estimado de la
composición) en vez de mezclar un top estimado con una segunda tanda midiendo el win rate propio
del campeón.

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
| **Ripeados** | segmentado **Vaults / Black list**. El estado del segmento va en la URL (`?tipo=vaults`), nunca solo en el cliente. `/vaults` y `/black-list` siguen andando y redirigen, para no romper links ni notificaciones push ya mandadas. |
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
| Scaling | Fase E: dos curvas independientes en SVG y tabla accesible. Si falta una serie, **no se muestra el bloque** (nunca un placeholder). |

- Las tablas de matchups y duos llevan el rótulo **"win rates normalizados"**: el número ya
  tiene descontada la fuerza base de cada campeón (§1.5), que es lo que las hace comparables.
- Con el draft vacío todo da 50,00: es correcto y es lo que hace DraftGap.
- Mobile-first de verdad: en iPhone ni las dos comps ni una tabla de 6 columnas entran a lo
  ancho. El panel va apilado, cada tabla en su `overflow-x` o replegada a lista. Revisar con la
  skill `ui-ux-pro-max` antes de maquetar.

### Fase E — Scaling (opcional)

Implementada el 2026-09-17. Ingesta de `q-data.json` (§1.3.1) para la serie por duración de
partida, con su resolver de punteros Qwik aislado y probado contra las cuatro fixtures guardadas.

- Son 389 pares campeón/rol medidos, ~76 MB por sync. Corre **después** del sync principal con
  cursor y estado propios; si falla, no invalida nada de lo anterior.
- La UI calcula dos curvas independientes con la interpretación documentada en §1.3.1, las muestra
  en SVG más una tabla accesible y no renderiza el bloque si falta cualquier serie elegida.
- Es la parte más frágil del proyecto: si Lolalytics cambia la serialización, se apaga este
  bloque y las fases A-D siguen intactas.

---

### Fase F — Registro de drafts: qué predijimos contra qué pasó

Pedido por los amigos de Juan (2026-09-17). Se guarda un draft y después se le adjunta la
partida que salió de ahí, igual que hoy se le adjunta una partida a una propuesta de vault.

Además de ser lo que pidieron, es **lo único que puede decirnos si el análisis sirve**. Todo lo
anterior es el modelo hablando de sí mismo; esto lo contrasta con la realidad.

**Reglas que hacen que el registro signifique algo:**

1. **La predicción se congela al guardar.** Se guardan el win rate estimado, el nivel de riesgo,
   la ventana de parche y el id de la corrida de sync. La matriz cambia todas las noches:
   recalcular después daría otro número, y ese no sería el que predijimos. Sin esto el registro
   no vale nada.
2. **La partida tiene que ser la del draft.** Al adjuntar se exige que los diez campeones de la
   partida coincidan con los diez del draft, cinco por lado. Si no coinciden, se rechaza con un
   mensaje claro. Así no se puede pegar una partida cualquiera para inflar el registro.
3. **De qué lado jugamos sale de los datos, no de un campo.** Se compara el equipo aliado del
   draft contra los `teams` del `MatchDetail`; el `win` de ese equipo es el resultado.
4. **Un draft guardado después de que terminó la partida no es una predicción.** Se guarda
   `savedAt` y se compara contra el `playedAt` de la partida: si el draft se guardó después,
   la fila queda marcada y **no cuenta** para la calibración. El registro es tan honesto como el
   flujo, y esto es lo único que podemos verificar del flujo.
5. La identidad sale del JWT de Access, nunca del cliente (§8.1 del plan técnico).

**La vista.** Primero el registro en sí: la lista de drafts con lo que predijimos y lo que pasó.
Después, un resumen de calibración por bandas de predicción (predijimos 60-70 % → ganamos X de Y).

**Y acá hay que ser honestos con el tamaño de la muestra.** Son 5-6 amigos: van a pasar meses
antes de que haya suficientes partidas para decir nada sobre la calibración. La vista **siempre**
muestra el n al lado de cualquier porcentaje, y con pocas partidas dice explícitamente que no
alcanza para concluir, en vez de mostrar un "73 % de acierto" que no significa nada. Un número de
acierto sin su n es exactamente el tipo de dato sin contexto que ya rechazamos dos veces.

### Fase G — Quién juega cada slot, y cómo le va con ese campeón

Pedido por Juan (2026-09-17): asignar a cada casillero aliado un miembro del grupo y, al elegir
campeón, ver **cómo le va a esa persona con ese campeón**.

**Decisión tomada: el dato personal NO toca el win rate estimado del draft.** Va al lado, como
señal propia. El motivo está medido: el backtest del §1.6 muestra que el modelo global —con
millones de partidas detrás— todavía no le gana a una moneda en la muestra disponible. Meterle un
término estimado con 3 a 25 partidas lo ensucia en vez de mejorarlo, y además rompe la propiedad
de que el número mida una sola cosa y se pueda explicar.

**La fuente son las estadísticas de temporada, no las partidas cacheadas.** Medido sobre el perfil
real de Juan:

| Fuente | Partidas del campeón más jugado |
|---|---|
| Las 20 partidas cacheadas (`player_matches`) | **7** |
| `rankedSeason.champions` del perfil de OP.GG | **25** |

La temporada tiene 112 partidas y devuelve **sólo los 10 campeones más jugados**: 25, 17, 16, 13,
11, 5, 3, 3, 3, 3. O sea que para la mayoría de los picks **no va a haber dato**, y eso se dice con
todas las letras en vez de insinuar algo.

**Normalización.** La pregunta no es "¿gana con Malphite?" sino "¿le va mejor o peor con Malphite
que a él mismo en general?". Se encoge el win rate del campeón hacia el win rate de temporada de
esa misma persona, con el mismo prior bayesiano que usa todo el resto. Con 3 partidas colapsa a
cero solo, que es lo correcto.

**Reglas de presentación**, las mismas de siempre y por los mismos motivos: el n siempre al lado
del porcentaje, nunca un win rate de 3 partidas presentado como un hecho, y "no lo jugó esta
temporada" cuando no hay dato.

### Fase H — Contar los casilleros que el enemigo todavía no llenó

Pedido por Juan (2026-09-17). Hoy la sugerencia ignora los slots enemigos vacíos: los trata como
si no existieran. Pero vos pickeás sabiendo que a ellos les faltan picks, y eso cambia qué
conviene.

**Por qué esto no es redundante, que es la pregunta obvia.** Un enemigo desconocido aporta rating
0, o sea neutral, y neutral **es** el promedio sobre *todos* los campeones: por construcción, el
rating de matchup promediado sobre el universo entero da cero. Si rellenáramos con ese promedio no
cambiaría nada.

Lo que lo hace valer es que **no se piquea el universo entero**. El promedio sobre los campeones
*populares* de un rol no es cero: es un subconjunto sesgado. Un campeón puede tener matchups
neutros contra los 170 y ser malo contra los seis que la gente realmente juega en ese carril. Esa
diferencia es la que queremos ver, y es la misma idea que ya nos obligó a filtrar por rol en
§1.5.3.

**Cómo se calcula.** Para cada rol enemigo vacío R, con los campeones elegibles de R (§1.5.3)
pesados por sus partidas en R:

- Matchup esperado de un campeón C contra R = Σ (peso del enemigo E) × (rating del cruce C vs E).
- Fuerza base esperada del enemigo en R = Σ (peso de E) × (rating de E).
- **Las duplas del enemigo con un campeón desconocido se saltean**, no se estiman: son de segundo
  orden y estimarlas agregaría ruido sin agregar señal. Que el código lo diga.

**Qué se muestra.** Con slots enemigos vacíos, el número de la grilla pasa a contar los picks que
faltan y **la pantalla lo dice**: es otra cosa que "el win rate de lo que ya está en el tablero",
no el mismo número mejorado. Sin slots vacíos, es exactamente lo de hoy.

**Y el riesgo de contrapick**, que para una persona drafteando es lo más útil: además del valor
esperado, cuánto puede empeorar si el rival contrapickea bien. O sea el peor cruce que te pueden
hacer entre los más jugados de ese rol. Un pick de valor esperado alto pero con un piso muy malo
es una apuesta distinta a uno parejo, y eso hoy no se ve.

`analyzeDraft` **no se toca**: está verificado contra cálculo a mano y es el número explicable de
"lo que ya está en el tablero". Esto es una capa aparte encima.

### Fase I — Traer el draft desde la partida en vivo

Pedido por Juan (2026-09-17). Las dos vías conviven: se sigue cargando a mano como hasta ahora, y
además hay un atajo que llena los diez casilleros desde la partida en curso.

**No hay fuente alternativa.** La página de OP.GG dice textualmente que el dato sale de la API
oficial de Riot, y lo sirve por Server Actions de Next.js — un POST a la propia URL, con un id de
acción que es un hash del build. No es consumible. El único camino es **Spectator-v5**, que
necesita key.

**Lo que Spectator-v5 NO da, y hay que resolver:**

1. **No existe endpoint de champ select.** Sólo devuelve partidas ya arrancadas, así que esto no
   sirve para decidir el pick. Para eso hace falta el cliente local de League, que es lo que hace
   DraftGap con su botón "Sync with League Client" — y a eso una PWA en el teléfono no llega.
   Sirve para ver el análisis de la partida que ya empezó, y para el registro automático.
2. **No trae los roles.** Devuelve campeones y equipos, nada de carriles. Se infieren con los datos
   que ya tenemos: para cada una de las 120 permutaciones de cinco campeones en cinco roles, sumar
   las partidas de cada campeón en el rol asignado (`draft_champion_stats`) y quedarse con la
   combinación de mayor suma. Es un problema de asignación chico y la fuerza bruta alcanza de
   sobra. **La inferencia puede errar, así que los casilleros quedan editables a mano después.**

**La colisión con la regla del Registro, y cómo se resuelve.** Hoy un draft guardado después del
inicio de la partida se marca "no cuenta". Una captura en vivo ocurre necesariamente después de que
arrancó, así que con esa regla **todas** las capturas automáticas quedarían descartadas, que es
exactamente al revés de lo que se busca.

La regla está bien pensada pero mide lo que puede, no lo que importa. Lo que importa es que **el
resultado todavía no exista**, y Spectator-v5 lo garantiza por construcción: sólo devuelve partidas
en curso. Un registro capturado en vivo se marca como tal y **sí cuenta**, con una garantía más
fuerte que la del reloj.

Eso convierte al Registro en algo que se llena solo, que es la única forma realista de juntar la
muestra que hoy no tenemos (§1.6: 41 partidas no alcanzan para nada).

**Reglas duras:** la key va del lado servidor y nunca al cliente; se llama a Riot sólo cuando el
usuario lo pide, nunca en cada render; y sin key configurada la app sigue andando igual que hoy,
con el atajo apagado y diciendo por qué.

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
