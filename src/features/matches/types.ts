/**
 * Contrato de historial de partidas, independiente de la fuente. Hoy la implementa OP.GG
 * (`opgg/`); más adelante la API oficial de Riot. La UI y el caché solo conocen estos tipos.
 */

export type RiotId = { gameName: string; tagLine: string };

/** Una partida desde el punto de vista de un jugador (fila de su historial). */
export type PlayerMatchSummary = {
  matchId: string;
  playedAt: Date;
  /** SOLORANKED, FLEXRANKED, NORMAL, ARAM, … tal como lo da la fuente. */
  queue: string;
  durationSeconds: number;
  puuid: string;
  championId: number;
  championName: string;
  position: string | null;
  teamKey: string;
  kills: number;
  deaths: number;
  assists: number;
  championLevel: number;
  /** Minions + monstruos neutrales. */
  cs: number;
  damageDealt: number;
  damageTaken: number;
  /** Kills totales de su equipo (para la participación en kills). */
  teamKills: number;
  win: boolean;
  /** WIN, LOSE, … (remakes pueden venir distinto). */
  result: string;
  opScore: number | null;
  /** Puesto 1–10 por OP Score dentro de la partida. */
  opScoreRank: number | null;
};

export type MatchParticipant = {
  puuid: string;
  gameName: string;
  tagLine: string;
  championId: number;
  championName: string;
  teamKey: string;
  position: string | null;
  kills: number;
  deaths: number;
  assists: number;
  championLevel: number;
  cs: number;
  damageDealt: number;
  damageTaken: number;
  goldEarned: number;
  /** Centinelas de control comprados; ausente en snapshots guardados con el formato anterior. */
  controlWardsBought?: number;
  /** Centinelas colocados; ausente en snapshots guardados con el formato anterior. */
  wardsPlaced?: number;
  /** Mayor cantidad de kills en un multikill. */
  largestMultiKill?: number;
  /** Mayor racha de kills sin morir. */
  largestKillingSpree?: number;
  result: string;
  opScore: number | null;
  opScoreRank: number | null;
  /** Es el jugador por el que se pidió el detalle. */
  isTarget: boolean;
};

/** Detalle completo de una partida ("la foto"). Serializable a JSON: las fechas van en ISO UTC. */
export type MatchDetail = {
  matchId: string;
  playedAt: string;
  queue: string;
  durationSeconds: number;
  teams: {
    key: string;
    win: boolean;
    kills: number;
    goldEarned: number;
    participants: MatchParticipant[];
  }[];
};

export type RankEntry = {
  /** SOLORANKED, FLEXRANKED, … */
  queue: string;
  tier: string | null;
  division: number | null;
  lp: number | null;
  wins: number;
  losses: number;
  tierImageUrl: string | null;
};

export type SeasonChampionStat = {
  championId: number;
  championName: string;
  games: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  damageDealt: number | null;
  opScore: number | null;
};

export type PreviousSeasonRank = {
  seasonId: number;
  tier: string | null;
  division: number | null;
  lp: number | null;
};

export type LadderStanding = {
  rank: number;
  total: number;
};

/** Sumas que OP.GG acumula por partida para un campeon de la temporada. */
export type RankedChampionBasic = {
  kills: number;
  deaths: number;
  assists: number;
  killParticipation: number;
  damageToChampion: number;
  damageParticipation: number;
  damageDistribution: number;
  cs: number;
  gold: number;
  visionScore: number;
  controlWards: number;
  wardsPlaced: number;
  wardsKilled: number;
  opScore: number;
  opScoreRank: number;
  mvp: number;
  ace: number;
  laneScore: number;
  laneScoreCount: number;
  laneLead: number;
  doubleKills: number;
  doubleKillGames: number;
  tripleKills: number;
  tripleKillGames: number;
  quadraKills: number;
  quadraKillGames: number;
  pentaKills: number;
  pentaKillGames: number;
};

/** Sumas extendidas. `totalDamageToChampion` viene bajo la clave engañosa true_damage_to_champion. */
export type RankedChampionExtend = {
  damageTaken: number;
  damageSelfMitigated: number;
  heal: number;
  healToTeam: number;
  shieldToTeam: number;
  physicalDamageToChampion: number;
  magicDamageToChampion: number;
  totalDamageToChampion: number;
  damageToObjective: number;
  damageToTurret: number;
  /** Duplicado crudo de damageToTurret en la fuente; no se presenta como otra metrica. */
  damageToBuildingDuplicate: number;
  turretKills: number;
  inhibitorKills: number;
  objectiveSteals: number;
  ccScore: number;
  soloKills: number;
  soloKillGames: number;
  invadeKills: number;
  invadeKillGames: number;
  invadeGames: number;
  neutralCs: number;
  buffSteals: number;
  enemyJungleMonsterKills: number;
  epicMonsterKillsNearEnemyJungler: number;
  epicMonsterStealsWithoutSmite: number;
  initialCrabKills: number;
  jungleCsAt10: number;
  laneAdvantagesAt7: number;
  laneCsAt10: number;
  turretPlates: number;
  crowdControls: number;
  crowdControlKills: number;
  alliesSaved: number;
  wardsGuarded: number;
  fasterSupportQuests: number;
  evolutionNone: number;
  evolutionFirst: number;
  evolutionSecond: number;
};

export type RankedSeasonChampion = {
  championId: number;
  championName: string;
  games: number;
  wins: number;
  losses: number;
  /** Suma de la duracion de todas las partidas con el campeon. */
  durationSeconds: number;
  basic: RankedChampionBasic;
  extend: RankedChampionExtend;
};

export type RankedSeason = {
  queue: string;
  seasonId: number;
  games: number;
  wins: number;
  losses: number;
  champions: RankedSeasonChampion[];
};

/** Perfil del jugador en la fuente. Serializable a JSON. */
export type SummonerProfile = {
  puuid: string;
  gameName: string;
  tagLine: string;
  level: number | null;
  profileImageUrl: string | null;
  ranks: RankEntry[];
  seasonChampions: SeasonChampionStat[];
  /** Opcionales para poder leer perfiles guardados antes de Scout profundo. */
  previousSeasons?: PreviousSeasonRank[];
  ladder?: LadderStanding | null;
  rankedSeason?: RankedSeason | null;
};

export type MatchProviderErrorKind =
  /** El Riot ID no existe en la fuente. */
  | 'not-found'
  /** Caída, timeout, rate limit o bloqueo: vale reintentar más tarde y mostrar el caché. */
  | 'unavailable'
  /** Respondió algo que no sabemos leer (cambió el formato). */
  | 'invalid-response';

export class MatchProviderError extends Error {
  readonly isMatchProviderError = true;

  constructor(
    message: string,
    readonly kind: MatchProviderErrorKind,
  ) {
    super(message);
    this.name = 'MatchProviderError';
  }
}

const MATCH_PROVIDER_ERROR_KINDS = new Set<MatchProviderErrorKind>([
  'not-found',
  'unavailable',
  'invalid-response',
]);

/**
 * Reconoce errores de la fuente aunque el bundler haya cargado más de una copia de este módulo.
 * La marca explícita evita depender de la identidad de la clase en runtime.
 */
export function isMatchProviderError(error: unknown): error is MatchProviderError {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as Partial<MatchProviderError>;
  return candidate.isMatchProviderError === true
    && candidate.name === 'MatchProviderError'
    && typeof candidate.message === 'string'
    && MATCH_PROVIDER_ERROR_KINDS.has(candidate.kind as MatchProviderErrorKind);
}

export type MatchProvider = {
  /** Identificador guardado junto a cada dato cacheado ('opgg', 'riot'). */
  readonly name: string;
  listMatches(riotId: RiotId, limit: number): Promise<PlayerMatchSummary[]>;
  getMatchDetail(matchId: string, playedAt: Date, focus: RiotId): Promise<MatchDetail>;
  getProfile(riotId: RiotId): Promise<SummonerProfile>;
};
