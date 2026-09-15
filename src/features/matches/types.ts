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

/** Perfil del jugador en la fuente. Serializable a JSON. */
export type SummonerProfile = {
  puuid: string;
  gameName: string;
  tagLine: string;
  level: number | null;
  profileImageUrl: string | null;
  ranks: RankEntry[];
  seasonChampions: SeasonChampionStat[];
};

export type MatchProviderErrorKind =
  /** El Riot ID no existe en la fuente. */
  | 'not-found'
  /** Caída, timeout, rate limit o bloqueo: vale reintentar más tarde y mostrar el caché. */
  | 'unavailable'
  /** Respondió algo que no sabemos leer (cambió el formato). */
  | 'invalid-response';

export class MatchProviderError extends Error {
  constructor(
    message: string,
    readonly kind: MatchProviderErrorKind,
  ) {
    super(message);
    this.name = 'MatchProviderError';
  }
}

export type MatchProvider = {
  /** Identificador guardado junto a cada dato cacheado ('opgg', 'riot'). */
  readonly name: string;
  listMatches(riotId: RiotId, limit: number): Promise<PlayerMatchSummary[]>;
  getMatchDetail(matchId: string, playedAt: Date, focus: RiotId): Promise<MatchDetail>;
  getProfile(riotId: RiotId): Promise<SummonerProfile>;
};
