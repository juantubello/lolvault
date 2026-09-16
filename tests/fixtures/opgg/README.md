# Fixtures de OP.GG MCP

Respuestas reales de `https://mcp-api.op.gg/mcp` capturadas el 2026-09-15 (región LAS).

- `list-20.txt`: texto de `lol_list_summoner_matches` (20 partidas, solo el jugador consultado).
- `detail.txt`: texto de `lol_get_summoner_game_detail` (10 jugadores, `focus_riot_id` = Invocador).
- `profile.txt`: texto de `lol_get_summoner_profile` (rangos con `null` en colas sin rango, campeones de temporada).
- `rpc-*.json`: sobres JSON-RPC (éxito, error "Summoner not found", initialize). La respuesta HTTP
  del initialize trae el header `mcp-session-id`, que hay que reenviar en cada llamada.

**Anonimizado:** todo `Summoner("puuid","game_name","tagline"…)` fue reemplazado. El jugador
consultado es `Invocador#LAS1` (`puuid-invocador`); el resto, `Jugador N#LAS` (`puuid-jugador-N`).
El resto del contenido (ids de partida, campeones, stats) es el original.

Formato del texto: primero líneas `class Nombre: campo1,campo2,…` (orden de los valores), después
un único valor `Nombre(valor, …)` con strings `"…"`, números, `true`/`false`, `null` y listas `[…]`.

## Respuestas con TODOS los campos (2026-09-16)

`profile-campos-completos.txt` y `partidas-campos-completos.txt` son las respuestas **sin**
`desired_output_fields`, o sea todo lo que la fuente expone. Se capturaron para la fase de "Scout
profundo": hoy la app pide un subconjunto recortado y descarta la mayor parte de esto.

Anonimizadas como el resto: nombres, tags, puuid, summoner_id, acct_id y UUIDs reemplazados por
tokens sintéticos estables (`identificador-N`, `Invocador N`). Verificado que no queda ninguna
cadena opaca.

Lo que aparece y hoy no usamos: `previous_seasons` (tabla de temporadas), `lp_histories`,
`ladder_rank`, y sobre todo `ranked_most_champions.my_champion_stats`, con dos bloques por campeón:

- `basic`: kill_participation, damage_participation, cs, gold, vision_score, ward_placed, mvp,
  ace, lane_score, lane_lead, multikills.
- `extend`: damage_taken, heal, shield_to_team, daño físico/mágico, daño a objetivos y torres,
  cc_score, solo_kill, jungle_cs_10_minute, lane_cs_10_minute, turret_plate.

### Dos trampas verificadas con datos reales

1. **Son sumas por partida, no promedios.** Hay que dividir por `play`. Un `kill_participation`
   de 26,48 en 55 partidas es 48 %, no 26 %. Verificado en los 10 campeones: KP 43-52 %,
   participación de daño 24-28 %, OP Score 5,4-6,4 y CS 189-248 por partida. Todos plausibles.
2. **`true_damage_to_champion` trae el daño total**, no el verdadero: sumar físico + mágico +
   verdadero da ~1,95× el total, en los 10 campeones por igual. El daño verdadero se calcula como
   total − físico − mágico. `damage_to_building` también repite `damage_to_turret`.
