# Fixtures de Lolalytics

Respuestas **reales**, capturadas el 2026-09-16 con requests verificados. Son datos públicos
de campeones: no hay nada personal que anonimizar (a diferencia de `../opgg/`, que sí lo tiene).

Están acá porque el sandbox donde se implementa no tiene salida a internet: los tests del
parser corren contra estos archivos, no contra la red.

## Endpoints

Host `https://a1.lolalytics.com/mega/`, params comunes:
`v=1&tier=emerald_plus&queue=ranked&region=all&patch=<ventana>&c=<championId>`

| Archivo | Request | Para qué |
|---|---|---|
| `counter-ahri-middle-vs-middle.json` | `ep=counter&lane=middle&vslane=middle` | Matchups, mismo carril |
| `counter-ahri-middle-vs-jungle.json` | `ep=counter&lane=middle&vslane=jungle` | Matchups entre lanes distintas |
| `counter-ahri-middle-vs-top.json` | `ep=counter&lane=middle&vslane=top` | ídem |
| `counter-ahri-middle-vs-bottom.json` | `ep=counter&lane=middle&vslane=bottom` | ídem |
| `build-team-ahri-middle.json` | `ep=build-team&lane=middle` | Sinergias por lane |
| `build-team-leona-middle.json` | `ep=build-team&lane=middle` (Leona) | Sinergias de muestra chica |
| `counter-leona-middle-vacio.json` | `ep=counter` de una lane que no se juega | **Borde:** `counters: []` |
| `counter-campeon-inexistente.json` | `ep=counter&c=noexiste` | **Borde:** 200 con `{"status":404}` |
| `invalid-end-point.txt` | `ep=endpoint-que-no-existe` | **Borde:** 200 con texto plano, no JSON |

## Formas

- counters: `{cid, vsWr, n, d1, d2, allWr, defaultLane}` — `cid` es la key numérica de Riot,
  la misma de la tabla `champions`. `vsWr` es el win rate contra ese campeón y `n` las partidas.
- build-team: `{team_h: ["id","wr","d1","d2","pr","n"], team: {top: [...], jungle: [...], ...}}`
  (las filas siguen el orden de `team_h`).

## Casos borde verificados — el parser tiene que aguantarlos

1. Campeón que no se juega en esa lane → **200** con `counters: []`. Es legítimo, no un fallo.
2. Campeón inexistente → **200** con `{"status":404}` **en el cuerpo**.
3. Endpoint mal escrito → **200** con el texto plano `invalid end point`, que no es JSON.

**Regla:** el status HTTP no alcanza para saber si la respuesta sirve. Validar siempre la forma
del cuerpo, como hace `opgg-provider.ts` con su `ResponseShapeError`, y envolver todo `JSON.parse`.

## `qdata-*.json` — la serie por duración (Fase E)

De `https://lolalytics.com/lol/<champ>/build/q-data.json?tier=emerald_plus&region=all&patch=30&lane=<rol>`,
capturadas el 2026-09-17. Son datos públicos de campeones: no hay nada personal.

El formato es el de Qwik, con *string interning*. La regla, verificada sobre las tres
capturas: **todo string que aparece adentro de un contenedor de `_objs` es un puntero en
base 36, y un solo salto llega al valor literal**. No hay prefijos ni marcas: los literales
viven como entradas directas de `_objs` y los contenedores sólo guardan índices. Ejemplo
real: `{"annie": "1"}` → `_objs[1] === "Annie"`.

La serie vive en el único objeto de `_objs` que tiene `time` y `timeWin` a la vez — uno solo
en cada una de las tres capturas. `time` son las partidas por tramo de duración y `timeWin`
las victorias, ambos indexados 1..7.

| Archivo | Qué aporta |
|---|---|
| `qdata-ahri-middle.min.json` | Curva que sube y se estabiliza (campeón de media partida). |
| `qdata-kayle-top.min.json` | Escalado fuerte: 40,89 % a los 20-25 min → 61,25 % pasados los 35. |
| `qdata-thresh-support.min.json` | Curva que decae (campeón de early). |
| `qdata-ahri-middle.full.json` | La captura **sin recortar**, 9.466 entradas en `_objs`. |

Las `.min` se armaron reindexando `_objs` para conservar sólo lo alcanzable desde la serie:
195 KB → 299 bytes, resolviendo a valores idénticos al original. Son datos reales en formato
real, pero **demasiado limpias**: un parser ingenuo que asuma un índice fijo pasaría igual.
Por eso está también la captura completa, que es la que prueba que el buscador encuentra la
serie entre los 9.466 objetos de verdad.

**Los 7 tramos no vienen rotulados.** Están numerados 1..7 y el JSON no dice a qué duración
corresponde cada uno. Ver la inferencia y su evidencia en PLAN-SCOUT-DRAFT.md §1.3.1.
