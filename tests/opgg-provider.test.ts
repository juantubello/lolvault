import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { createOpggProvider } from '@/features/matches/opgg/opgg-provider';

const fixture = (name: string): string => readFileSync(
  new URL(`./fixtures/opgg/${name}`, import.meta.url),
  'utf8',
);

/** La captura completa incluye un `Player(...)` ajeno a los campos pedidos con una serializacion
 * rota de OP.GG. El recorte real no trae ese bloque; lo reparamos aca solo para poder usar todos
 * los datos de la fixture como prueba del mapeo solicitado. */
const completeProfileFixture = (): string => fixture('profile-campos-completos.txt').replace(
  'Player(null,null,null,null,null,null,null,null,null)","https://esports.op.gg/players/1836"',
  'Player(null,null,null,null,null,null,"https://esports.op.gg/players/1836"',
);

const completeMatchesFixture = (): string => fixture('partidas-campos-completos.txt').replaceAll(
  'Player(null,null,null,null,null,null,null,null,null)","https://esports.op.gg/players/1836"',
  'Player(null,null,"https://esports.op.gg/players/1836"',
);

const riotId = { gameName: 'Invocador', tagLine: 'LAS1' };

const listFields = [
  'data.game_history[].{created_at,game_length_second,game_type,id}',
  'data.game_history[].participants[].{champion_id,champion_name,position,team_key}',
  'data.game_history[].participants[].stats.{assist,champion_level,death,kill,minion_kill,neutral_minion_kill,op_score,op_score_rank,result,total_damage_dealt_to_champions,total_damage_taken}',
  'data.game_history[].participants[].summoner.{game_name,puuid,tagline}',
  'data.game_history[].teams[].game_stat.{champion_kill,is_win}',
  'data.game_history[].teams[].key',
];

const detailFields = [
  'data.game_detail.{created_at,game_length_second,game_type,id}',
  'data.game_detail.teams[].key',
  'data.game_detail.teams[].game_stat.{champion_kill,gold_earned,is_win}',
  'data.game_detail.teams[].participants[].{champion_id,champion_name,is_target,position,team_key}',
  'data.game_detail.teams[].participants[].stats.{assist,champion_level,death,gold_earned,kill,largest_killing_spree,largest_multi_kill,minion_kill,neutral_minion_kill,op_score,op_score_rank,result,total_damage_dealt_to_champions,total_damage_taken,vision_wards_bought_in_game,ward_place}',
  'data.game_detail.teams[].participants[].summoner.{game_name,puuid,tagline}',
];

const profileFields = [
  'data.summoner.{game_name,level,profile_image_url,puuid,tagline,updated_at}',
  'data.summoner.league_stats[].{game_type,lose,win}',
  'data.summoner.league_stats[].tier_info.{division,lp,tier,tier_image_url}',
  'data.summoner.most_champions.{game_type,lose,play,season_id,win}',
  'data.summoner.most_champions.champion_stats[].{assist,champion_name,damage_dealt_to_champions,death,id,kill,lose,op_score,play,win}',
  'data.summoner.previous_seasons[].{season_id}',
  'data.summoner.previous_seasons[].tier_info.{division,lp,tier}',
  'data.summoner.ladder_rank.{rank,total}',
  'data.summoner.ranked_most_champions.{game_type,lose,play,season_id,win}',
  'data.summoner.ranked_most_champions.my_champion_stats[].{champion_name,game_second,id,lose,play,win}',
  'data.summoner.ranked_most_champions.my_champion_stats[].basic.{ace,assist,cs,damage_distribution,damage_participation,damage_to_champion,death,double_kill,double_kill_play,gold,kill,kill_participation,lane_lead,lane_score,lane_score_count,mvp,op_score,op_score_rank,penta_kill,penta_kill_play,quadra_kill,quadra_kill_play,triple_kill,triple_kill_play,vision_score,vision_ward,ward_kill,ward_placed}',
  'data.summoner.ranked_most_champions.my_champion_stats[].extend.{buff_steal,cc,cc_make_kill,cc_score,damage_self_mitigated,damage_taken,damage_to_building,damage_to_objective,damage_to_turret,enemy_jungle_monster_kill,epic_monster_kill_near_enemy_jungler,epic_monster_steal_no_smite,evolution_first,evolution_none,evolution_second,faster_support_quest,heal,heal_to_team,initial_crab_kill,inhibitor_kill,invade_kill,invade_kill_play,invade_play,jungle_cs_10_minute,lane_advantage_7_minute,lane_cs_10_minute,magic_damage_to_champion,make_solo_kill,neutral_cs,object_steal,physical_damage_to_champion,save_ally,shield_to_team,solo_kill,true_damage_to_champion,turret_kill,turret_plate,ward_guard}',
];

describe('proveedor de partidas OP.GG', () => {
  it('mapea las 20 partidas desde el punto de vista del invocador', async () => {
    const callTool = vi.fn(async () => fixture('list-20.txt'));
    const provider = createOpggProvider({ client: { callTool }, region: 'LAS' });

    const matches = await provider.listMatches(riotId, 99);

    expect(provider.name).toBe('opgg');
    expect(matches).toHaveLength(20);
    expect(matches[0]).toMatchObject({
      matchId: 'P9o6vts4cwlSlUT6WTBHhHFmIFOsPV-tUqaGTvDIV9Q=',
      championName: 'Malzahar',
      kills: 7,
      deaths: 6,
      assists: 5,
      damageDealt: 24108,
      damageTaken: 19354,
      cs: 267,
      teamKills: 26,
      win: true,
      puuid: 'puuid-invocador',
    });
    expect(matches[0]?.playedAt.toISOString()).toBe('2026-09-14T21:51:50.000Z');
    expect(callTool).toHaveBeenCalledWith('lol_list_summoner_matches', {
      game_name: 'Invocador',
      tag_line: 'LAS1',
      region: 'LAS',
      lang: 'en_US',
      limit: 20,
      desired_output_fields: listFields,
    });
  });

  it('mapea la respuesta de partidas con todos los campos siguiendo sus declaraciones', async () => {
    const callTool = vi.fn(async () => completeMatchesFixture());
    const provider = createOpggProvider({ client: { callTool }, region: 'KR' });

    const matches = await provider.listMatches({ gameName: 'Invocador 3', tagLine: 'TAG3' }, 5);

    expect(matches).toHaveLength(5);
    expect(matches[0]).toMatchObject({
      championName: 'Yone',
      position: 'MID',
      teamKey: 'RED',
      kills: 13,
      assists: 11,
      cs: 346,
      teamKills: 43,
      win: true,
    });
    expect(matches[1]).toMatchObject({
      championName: 'Kindred',
      position: null,
      teamKey: 'SCUTTLE',
      win: true,
    });
  });

  it('mapea el detalle completo y envía la fecha UTC y el foco', async () => {
    const callTool = vi.fn(async () => fixture('detail.txt'));
    const provider = createOpggProvider({ client: { callTool } });
    const playedAt = new Date('2026-09-15T06:51:50+09:00');

    const detail = await provider.getMatchDetail('match-id', playedAt, riotId);

    expect(detail.teams).toHaveLength(2);
    expect(detail.teams.map((team) => team.participants)).toSatisfy(
      (teams: unknown[][]) => teams.every((participants) => participants.length === 5),
    );
    const participants = detail.teams.flatMap((team) => team.participants);
    expect(participants.filter((participant) => participant.isTarget)).toHaveLength(1);
    expect(participants.find((participant) => participant.isTarget)?.gameName).toBe('Invocador');
    expect(detail.teams.find((team) => team.key === 'BLUE')?.participants)
      .toEqual(expect.arrayContaining([expect.objectContaining({ championName: 'Darius' })]));
    expect(detail.playedAt).toBe('2026-09-14T21:51:50.000Z');
    expect(participants.find((participant) => participant.isTarget)).toMatchObject({
      goldEarned: 14099,
      controlWardsBought: 0,
      wardsPlaced: 11,
      largestMultiKill: 2,
      largestKillingSpree: 3,
    });
    expect(callTool).toHaveBeenCalledWith('lol_get_summoner_game_detail', {
      region: 'LAS',
      lang: 'en_US',
      game_id: 'match-id',
      created_at: '2026-09-14T21:51:50.000Z',
      focus_riot_id: 'Invocador#LAS1',
      desired_output_fields: detailFields,
    });
  });

  it('mapea rangos, temporadas, ladder y los bloques completos por campeon', async () => {
    const callTool = vi.fn(async () => completeProfileFixture());
    const provider = createOpggProvider({ client: { callTool } });

    const profile = await provider.getProfile(riotId);

    expect(profile.ranks.find((rank) => rank.queue === 'SOLORANKED')).toMatchObject({
      tier: 'CHALLENGER',
      division: 1,
      lp: 2089,
      wins: 390,
      losses: 318,
    });
    expect(profile.ranks.find((rank) => rank.queue === 'FLEXRANKED')).toMatchObject({
      tier: null,
      division: null,
      lp: null,
      wins: 0,
      losses: 0,
    });
    expect(profile.seasonChampions[0]).toMatchObject({
      championName: 'Aurora',
      games: 55,
      wins: 32,
      losses: 23,
    });
    expect(profile.previousSeasons?.[0]).toEqual({
      seasonId: 31,
      tier: 'MASTER',
      division: 1,
      lp: 285,
    });
    expect(profile.ladder).toEqual({ rank: 127, total: 3021069 });
    expect(profile.rankedSeason).toMatchObject({ seasonId: 33, games: 707, wins: 390, losses: 317 });
    expect(profile.rankedSeason?.champions[0]).toMatchObject({
      championName: 'Aurora',
      games: 55,
      durationSeconds: 88724,
      basic: {
        killParticipation: 26.48,
        damageParticipation: 15.28,
        cs: 12664,
        opScore: 329.49,
      },
      extend: {
        physicalDamageToChampion: 128807,
        magicDamageToChampion: 1382313,
        totalDamageToChampion: 1598662,
        damageToTurret: 438923,
        damageToBuildingDuplicate: 438923,
      },
    });
    expect(callTool).toHaveBeenCalledWith('lol_get_summoner_profile', {
      game_name: 'Invocador',
      tag_line: 'LAS1',
      region: 'LAS',
      lang: 'en_US',
      desired_output_fields: profileFields,
    });
  });

  it('clasifica una estructura inesperada como invalid-response', async () => {
    const callTool = vi.fn(async () => 'class Root: unexpected\nRoot(1)');
    const provider = createOpggProvider({ client: { callTool } });

    await expect(provider.listMatches(riotId, 5))
      .rejects.toMatchObject({ kind: 'invalid-response' });
  });
});
