# APIs de League of Legends — investigación (2026-09-14)

Qué usar para **campeones + imágenes** y para **historial de partidas**, todo gratis.
Las URLs de este documento están **verificadas con requests reales** ese día.

## Resumen

| Necesidad | Usar | Key | Estado |
|---|---|---|---|
| Lista de campeones, nombres, títulos | **Data Dragon** (oficial Riot) | No | ✅ Decidido |
| Fotos (cuadrada, splash, loading) | **Data Dragon** | No | ✅ Decidido |
| Assets extra (íconos por id numérico, ficha completa) | CommunityDragon (comunitario) | No | Complemento opcional |
| Historial de partidas | **Riot API** (account-v1 + match-v5) | Sí, gratis | ✅ Decidido: key de dev ya, Personal Key a registrar |
| Historial sin key | OP.GG MCP (oficial de OP.GG, para agentes de IA) | No | ⚠️ Solo experimento, no como base |
| OP.GG / U.GG como API REST | No existe API pública oficial; los "OP.GG API" de terceros son scrapers | — | ❌ Descartado (viola términos) |

## 1. Campeones e imágenes: Data Dragon

CDN oficial de Riot, sin key, sin rate limit documentado. Riot lo actualiza a mano después de
cada parche, así que puede tardar un poco en reflejar un parche nuevo.

- Versiones (la primera es la última): `https://ddragon.leagueoflegends.com/api/versions.json` → hoy `16.18.1`
- Lista en español: `https://ddragon.leagueoflegends.com/cdn/{version}/data/es_AR/champion.json` (171 campeones)
- Ficha de un campeón (skins, habilidades): `https://ddragon.leagueoflegends.com/cdn/{version}/data/es_AR/champion/{id}.json`

| Imagen | URL | Verificado |
|---|---|---|
| Cuadrada 120px (tiles, avatar) | `https://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{id}.png` | 200 · 28 KB |
| Splash (fondo del detalle de un vault) | `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/{id}_{skinNum}.jpg` | 200 · 158 KB |
| Loading (vertical, cards) | `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/{id}_{skinNum}.jpg` | 200 · 58 KB |

`{id}` es el `id` de `champion.json` (ej. `Ahri`, `MonkeyKing` para Wukong), **no** el nombre
visible. `skinNum` 0 = skin base. Splash y loading no llevan versión en la URL.

## 2. CommunityDragon (complemento)

Mirror comunitario de **todos** los archivos del cliente. No es de Riot, no tiene SLA y su sitio
de documentación estaba caído ese día (HTTP 522), aunque los archivos respondían bien.

- Lista: `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json`
  (incluye `roles` y variantes que no están en Data Dragon)
- Ícono por id numérico: `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/{key}.png` → 200
- Ficha en español: `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/es_ar/v1/champions/{key}.json` → 200

Útil si más adelante hacen falta cosas que Data Dragon no trae. Para el MVP no hace falta.

## 3. Historial de partidas: Riot API (oficial)

Flujo para cada amigo:

1. `GET https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}` → `puuid`
2. `GET https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?count=5` → ids de partidas
3. `GET https://americas.api.riotgames.com/lol/match/v5/matches/{matchId}` → detalle (campeón, KDA, win, cola)

- LAS usa el routing regional **`americas`** (match-v5 y account-v1 van por región, no por `la2`).
- Sin key responde **401** (verificado). La key va en el header `X-Riot-Token`, **solo del lado servidor**.
- Con `by-puuid` (paso 3 del flujo del perfil) se obtiene el Riot ID actual: sirve para refrescar
  nombres cuando alguien se lo cambia.

### Keys

| Key | Cómo | Vence | Límite | Para qué |
|---|---|---|---|---|
| **Development** | Automática al entrar a developer.riotgames.com | **Cada 24 h** | 20 req/s · 100 req/2 min | Prototipar ya |
| **Personal** | "Register Project" → Personal API Key, con descripción del producto | No vence | Igual que dev | LolVault en el homelab (comunidad privada chica) |
| Production | Aprobación formal | No vence | 500 req/10 s · 30 000 req/10 min | No hace falta |

- La aprobación de la Personal Key **puede tardar semanas**: hay pedidos de marzo de 2026 que
  seguían pendientes a las 3 semanas. **Conviene registrarla ya.**
- Riot pide registrar cualquier producto que sirva a jugadores, aunque use otras fuentes.
- Una Personal Key no se puede usar en una app pública. LolVault queda cerrada por Cloudflare
  Access, así que no lo es.
- Con 6 amigos, cachear partidas en la DB queda muy lejos del rate limit.
- Hay que poner el aviso legal que pide Riot (en Perfil → Acerca de).
- (Un blog de terceros dice que las Personal Keys vencen cada 24 h. La doc oficial de Riot dice
  que **no**. Gana la doc oficial.)

## 4. OP.GG MCP (probado, no recomendado como base)

Servidor MCP **oficial de OP.GG** (repo `opgginc/opgg-mcp`, licencia MIT).

- Endpoint: `https://mcp-api.op.gg/mcp` (Streamable HTTP, JSON-RPC).
- **Verificado:** `initialize` responde 200 **sin auth**, 29 herramientas. La relevante es
  `lol_list_summoner_matches(game_name, tag_line, region, lang, limit, desired_output_fields)`.
  También están `lol_get_summoner_game_detail` y `lol_get_summoner_profile`.
- `region` se describe como "Server region code" (ejemplos `KR`, `BR`, `EUNE`). **No probé** `LAS`.

Por qué no como base:
- Está pensado para **agentes de IA**, no para apps. El README no documenta términos, rate
  limits ni garantías, y puede cambiar o cortarse sin aviso.
- No reemplaza el registro en Riot, y los datos de fondo igual salen de la API de Riot.

Uso razonable: **experimento mientras se aprueba la Personal Key**, detrás de la misma interfaz
(`riot-client.ts`), para poder cambiar la fuente sin tocar la UI.

## Fuentes

- Riot Developer Portal, LoL (Data Dragon, account-v1, match-v5, políticas): https://developer.riotgames.com/docs/lol
- Riot Developer Portal, keys y rate limits: https://developer.riotgames.com/docs/portal
- Personal Key pendiente por semanas: https://github.com/riotgames/developer-relations/issues/1150
- OP.GG MCP: https://github.com/opgginc/opgg-mcp
- Qué está permitido en apps de terceros en 2026 (blog, no oficial): https://buildzcrank.com/en/blog/riot-api-and-third-party-apps-what-is-allowed/
