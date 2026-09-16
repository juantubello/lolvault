import { OPGG_REGION } from '@/config';
import {
  isMatchProviderError,
  MatchProviderError,
  type MatchDetail,
  type MatchParticipant,
  type MatchProvider,
  type PlayerMatchSummary,
  type RankEntry,
  type RiotId,
  type SeasonChampionStat,
  type SummonerProfile,
} from '@/features/matches/types';

import { parseCompact } from './compact-format';
import { createOpggClient } from './opgg-client';

const LIST_FIELDS = [
  'data.game_history[].{created_at,game_length_second,game_type,id}',
  'data.game_history[].participants[].{champion_id,champion_name,position,team_key}',
  'data.game_history[].participants[].stats.{assist,champion_level,death,kill,minion_kill,neutral_minion_kill,op_score,op_score_rank,result,total_damage_dealt_to_champions,total_damage_taken}',
  'data.game_history[].participants[].summoner.{game_name,puuid,tagline}',
  'data.game_history[].teams[].game_stat.{champion_kill,is_win}',
  'data.game_history[].teams[].key',
];

const DETAIL_FIELDS = [
  'data.game_detail.{created_at,game_length_second,game_type,id}',
  'data.game_detail.teams[].key',
  'data.game_detail.teams[].game_stat.{champion_kill,gold_earned,is_win}',
  'data.game_detail.teams[].participants[].{champion_id,champion_name,is_target,position,team_key}',
  'data.game_detail.teams[].participants[].stats.{assist,champion_level,death,gold_earned,kill,largest_killing_spree,largest_multi_kill,minion_kill,neutral_minion_kill,op_score,op_score_rank,result,total_damage_dealt_to_champions,total_damage_taken,vision_wards_bought_in_game,ward_place}',
  'data.game_detail.teams[].participants[].summoner.{game_name,puuid,tagline}',
];

const PROFILE_FIELDS = [
  'data.summoner.{game_name,level,profile_image_url,puuid,tagline,updated_at}',
  'data.summoner.league_stats[].{game_type,lose,win}',
  'data.summoner.league_stats[].tier_info.{division,lp,tier,tier_image_url}',
  'data.summoner.most_champions.{game_type,lose,play,season_id,win}',
  'data.summoner.most_champions.champion_stats[].{assist,champion_name,damage_dealt_to_champions,death,id,kill,lose,op_score,play,win}',
];

type JsonObject = Record<string, unknown>;

class ResponseShapeError extends Error {}

function objectAt(value: unknown, path: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ResponseShapeError(`${path} debe ser un objeto`);
  }
  return value as JsonObject;
}

function valueAt(object: JsonObject, key: string, path: string): unknown {
  if (!Object.hasOwn(object, key)) throw new ResponseShapeError(`Falta ${path}.${key}`);
  return object[key];
}

function objectField(object: JsonObject, key: string, path: string): JsonObject {
  return objectAt(valueAt(object, key, path), `${path}.${key}`);
}

function arrayField(object: JsonObject, key: string, path: string): unknown[] {
  const value = valueAt(object, key, path);
  if (!Array.isArray(value)) throw new ResponseShapeError(`${path}.${key} debe ser una lista`);
  return value;
}

function stringField(object: JsonObject, key: string, path: string): string {
  const value = valueAt(object, key, path);
  if (typeof value !== 'string') throw new ResponseShapeError(`${path}.${key} debe ser texto`);
  return value;
}

function numberField(object: JsonObject, key: string, path: string): number {
  const value = valueAt(object, key, path);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ResponseShapeError(`${path}.${key} debe ser un número`);
  }
  return value;
}

function booleanField(object: JsonObject, key: string, path: string): boolean {
  const value = valueAt(object, key, path);
  if (typeof value !== 'boolean') throw new ResponseShapeError(`${path}.${key} debe ser booleano`);
  return value;
}

function nullableStringField(object: JsonObject, key: string, path: string): string | null {
  const value = valueAt(object, key, path);
  if (value === null) return null;
  if (typeof value !== 'string') throw new ResponseShapeError(`${path}.${key} debe ser texto o null`);
  return value;
}

function nullableNumberField(object: JsonObject, key: string, path: string): number | null {
  const value = valueAt(object, key, path);
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ResponseShapeError(`${path}.${key} debe ser un número o null`);
  }
  return value;
}

function optionalNumberField(object: JsonObject, key: string, path: string): number | undefined {
  if (!Object.hasOwn(object, key) || object[key] === null) return undefined;
  const value = object[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ResponseShapeError(`${path}.${key} debe ser un número`);
  }
  return value;
}

function dateField(object: JsonObject, key: string, path: string): Date {
  const rawDate = stringField(object, key, path);
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) throw new ResponseShapeError(`${path}.${key} no es una fecha válida`);
  return date;
}

function rootData(parsed: unknown): JsonObject {
  return objectField(objectAt(parsed, 'raíz'), 'data', 'raíz');
}

function nullablePosition(participant: JsonObject, path: string): string | null {
  const position = nullableStringField(participant, 'position', path);
  return position === '' ? null : position;
}

function mapSummary(value: unknown, index: number): PlayerMatchSummary {
  const path = `data.game_history[${index}]`;
  const game = objectAt(value, path);
  const participants = arrayField(game, 'participants', path);
  if (participants.length !== 1) {
    throw new ResponseShapeError(`${path}.participants debe tener exactamente un jugador`);
  }
  const participantPath = `${path}.participants[0]`;
  const participant = objectAt(participants[0], participantPath);
  const stats = objectField(participant, 'stats', participantPath);
  const summoner = objectField(participant, 'summoner', participantPath);
  const teamKey = stringField(participant, 'team_key', participantPath);
  const teams = arrayField(game, 'teams', path).map((team, teamIndex) => {
    const teamPath = `${path}.teams[${teamIndex}]`;
    const teamObject = objectAt(team, teamPath);
    return {
      key: stringField(teamObject, 'key', teamPath),
      gameStat: objectField(teamObject, 'game_stat', teamPath),
      path: teamPath,
    };
  });
  const ownTeam = teams.find((team) => team.key === teamKey);
  if (!ownTeam) throw new ResponseShapeError(`${path} no contiene el equipo ${teamKey}`);

  return {
    matchId: stringField(game, 'id', path),
    playedAt: dateField(game, 'created_at', path),
    queue: stringField(game, 'game_type', path),
    durationSeconds: numberField(game, 'game_length_second', path),
    puuid: stringField(summoner, 'puuid', `${participantPath}.summoner`),
    championId: numberField(participant, 'champion_id', participantPath),
    championName: stringField(participant, 'champion_name', participantPath),
    position: nullablePosition(participant, participantPath),
    teamKey,
    kills: numberField(stats, 'kill', `${participantPath}.stats`),
    deaths: numberField(stats, 'death', `${participantPath}.stats`),
    assists: numberField(stats, 'assist', `${participantPath}.stats`),
    championLevel: numberField(stats, 'champion_level', `${participantPath}.stats`),
    cs: numberField(stats, 'minion_kill', `${participantPath}.stats`)
      + numberField(stats, 'neutral_minion_kill', `${participantPath}.stats`),
    damageDealt: numberField(stats, 'total_damage_dealt_to_champions', `${participantPath}.stats`),
    damageTaken: numberField(stats, 'total_damage_taken', `${participantPath}.stats`),
    teamKills: numberField(ownTeam.gameStat, 'champion_kill', `${ownTeam.path}.game_stat`),
    win: booleanField(ownTeam.gameStat, 'is_win', `${ownTeam.path}.game_stat`),
    result: stringField(stats, 'result', `${participantPath}.stats`),
    opScore: nullableNumberField(stats, 'op_score', `${participantPath}.stats`),
    opScoreRank: nullableNumberField(stats, 'op_score_rank', `${participantPath}.stats`),
  };
}

function mapParticipant(value: unknown, path: string): MatchParticipant {
  const participant = objectAt(value, path);
  const summoner = objectField(participant, 'summoner', path);
  const stats = objectField(participant, 'stats', path);
  const goldValue = Object.hasOwn(stats, 'gold_earned') ? stats.gold_earned : 0;
  if (typeof goldValue !== 'number' || !Number.isFinite(goldValue)) {
    throw new ResponseShapeError(`${path}.stats.gold_earned debe ser un número`);
  }

  return {
    puuid: stringField(summoner, 'puuid', `${path}.summoner`),
    gameName: stringField(summoner, 'game_name', `${path}.summoner`),
    tagLine: stringField(summoner, 'tagline', `${path}.summoner`),
    championId: numberField(participant, 'champion_id', path),
    championName: stringField(participant, 'champion_name', path),
    teamKey: stringField(participant, 'team_key', path),
    position: nullablePosition(participant, path),
    kills: numberField(stats, 'kill', `${path}.stats`),
    deaths: numberField(stats, 'death', `${path}.stats`),
    assists: numberField(stats, 'assist', `${path}.stats`),
    championLevel: numberField(stats, 'champion_level', `${path}.stats`),
    cs: numberField(stats, 'minion_kill', `${path}.stats`)
      + numberField(stats, 'neutral_minion_kill', `${path}.stats`),
    damageDealt: numberField(stats, 'total_damage_dealt_to_champions', `${path}.stats`),
    damageTaken: numberField(stats, 'total_damage_taken', `${path}.stats`),
    goldEarned: goldValue,
    controlWardsBought: optionalNumberField(stats, 'vision_wards_bought_in_game', `${path}.stats`),
    wardsPlaced: optionalNumberField(stats, 'ward_place', `${path}.stats`),
    largestMultiKill: optionalNumberField(stats, 'largest_multi_kill', `${path}.stats`),
    largestKillingSpree: optionalNumberField(stats, 'largest_killing_spree', `${path}.stats`),
    result: stringField(stats, 'result', `${path}.stats`),
    opScore: nullableNumberField(stats, 'op_score', `${path}.stats`),
    opScoreRank: nullableNumberField(stats, 'op_score_rank', `${path}.stats`),
    isTarget: booleanField(participant, 'is_target', path),
  };
}

function mapDetail(parsed: unknown): MatchDetail {
  const detail = objectField(rootData(parsed), 'game_detail', 'data');
  const teams = arrayField(detail, 'teams', 'data.game_detail').map((value, index) => {
    const path = `data.game_detail.teams[${index}]`;
    const team = objectAt(value, path);
    const gameStat = objectField(team, 'game_stat', path);
    return {
      key: stringField(team, 'key', path),
      win: booleanField(gameStat, 'is_win', `${path}.game_stat`),
      kills: numberField(gameStat, 'champion_kill', `${path}.game_stat`),
      goldEarned: numberField(gameStat, 'gold_earned', `${path}.game_stat`),
      participants: arrayField(team, 'participants', path).map((participant, participantIndex) => (
        mapParticipant(participant, `${path}.participants[${participantIndex}]`)
      )),
    };
  });

  return {
    matchId: stringField(detail, 'id', 'data.game_detail'),
    playedAt: dateField(detail, 'created_at', 'data.game_detail').toISOString(),
    queue: stringField(detail, 'game_type', 'data.game_detail'),
    durationSeconds: numberField(detail, 'game_length_second', 'data.game_detail'),
    teams,
  };
}

function nullableCount(object: JsonObject, key: string, path: string): number {
  return nullableNumberField(object, key, path) ?? 0;
}

function mapRank(value: unknown, index: number): RankEntry {
  const path = `data.summoner.league_stats[${index}]`;
  const rank = objectAt(value, path);
  const tierInfo = objectField(rank, 'tier_info', path);
  return {
    queue: stringField(rank, 'game_type', path),
    tier: nullableStringField(tierInfo, 'tier', `${path}.tier_info`),
    division: nullableNumberField(tierInfo, 'division', `${path}.tier_info`),
    lp: nullableNumberField(tierInfo, 'lp', `${path}.tier_info`),
    wins: nullableCount(rank, 'win', path),
    losses: nullableCount(rank, 'lose', path),
    tierImageUrl: nullableStringField(tierInfo, 'tier_image_url', `${path}.tier_info`),
  };
}

function mapChampion(value: unknown, index: number): SeasonChampionStat {
  const path = `data.summoner.most_champions.champion_stats[${index}]`;
  const champion = objectAt(value, path);
  return {
    championId: numberField(champion, 'id', path),
    championName: stringField(champion, 'champion_name', path),
    games: numberField(champion, 'play', path),
    wins: numberField(champion, 'win', path),
    losses: numberField(champion, 'lose', path),
    kills: numberField(champion, 'kill', path),
    deaths: numberField(champion, 'death', path),
    assists: numberField(champion, 'assist', path),
    damageDealt: nullableNumberField(champion, 'damage_dealt_to_champions', path),
    opScore: nullableNumberField(champion, 'op_score', path),
  };
}

function mapProfile(parsed: unknown): SummonerProfile {
  const summoner = objectField(rootData(parsed), 'summoner', 'data');
  const mostChampions = objectField(summoner, 'most_champions', 'data.summoner');
  return {
    puuid: stringField(summoner, 'puuid', 'data.summoner'),
    gameName: stringField(summoner, 'game_name', 'data.summoner'),
    tagLine: stringField(summoner, 'tagline', 'data.summoner'),
    level: nullableNumberField(summoner, 'level', 'data.summoner'),
    profileImageUrl: nullableStringField(summoner, 'profile_image_url', 'data.summoner'),
    ranks: arrayField(summoner, 'league_stats', 'data.summoner').map(mapRank),
    seasonChampions: arrayField(mostChampions, 'champion_stats', 'data.summoner.most_champions')
      .map(mapChampion),
  };
}

function parseProviderResponse<T>(text: string, mapper: (parsed: unknown) => T): T {
  try {
    return mapper(parseCompact(text));
  } catch (error) {
    if (isMatchProviderError(error)) throw error;
    const detail = error instanceof Error ? `: ${error.message}` : '';
    throw new MatchProviderError(`Respuesta compacta de OP.GG inválida${detail}`, 'invalid-response');
  }
}

function clampedLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 20;
  return Math.min(20, Math.max(5, Math.trunc(limit)));
}

export function createOpggProvider(options: {
  client?: ReturnType<typeof createOpggClient>;
  region?: string;
} = {}): MatchProvider {
  const client = options.client ?? createOpggClient();
  const region = options.region ?? OPGG_REGION;

  return {
    name: 'opgg',

    async listMatches(riotId: RiotId, limit: number): Promise<PlayerMatchSummary[]> {
      const text = await client.callTool('lol_list_summoner_matches', {
        game_name: riotId.gameName,
        tag_line: riotId.tagLine,
        region,
        lang: 'en_US',
        limit: clampedLimit(limit),
        desired_output_fields: LIST_FIELDS,
      });
      return parseProviderResponse(text, (parsed) => {
        const data = rootData(parsed);
        return arrayField(data, 'game_history', 'data').map(mapSummary);
      });
    },

    async getMatchDetail(matchId: string, playedAt: Date, focus: RiotId): Promise<MatchDetail> {
      const text = await client.callTool('lol_get_summoner_game_detail', {
        region,
        lang: 'en_US',
        game_id: matchId,
        created_at: playedAt.toISOString(),
        focus_riot_id: `${focus.gameName}#${focus.tagLine}`,
        desired_output_fields: DETAIL_FIELDS,
      });
      return parseProviderResponse(text, mapDetail);
    },

    async getProfile(riotId: RiotId): Promise<SummonerProfile> {
      const text = await client.callTool('lol_get_summoner_profile', {
        game_name: riotId.gameName,
        tag_line: riotId.tagLine,
        region,
        lang: 'en_US',
        desired_output_fields: PROFILE_FIELDS,
      });
      return parseProviderResponse(text, mapProfile);
    },
  };
}
