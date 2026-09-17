import { APP_TIME_ZONE } from '@/config';
import { positionLabel, queueLabel } from '@/features/matches/format';
import { isRemake, summarizeMatchesByChampion } from '@/features/matches/player-summary';
import type {
  MatchDetail,
  MatchParticipant,
  PlayerMatchSummary,
  RankedSeason,
} from '@/features/matches/types';

export const DEFAULT_ROLE_REFERENCE_MIN_SAMPLE = 20;
export const MIN_PLAYER_COMPARISON_GAMES = 3;
export const MIN_LANE_COMPARISON_GAMES = 3;

export type AnalystMetrics = {
  csPerMinute: number;
  damagePerMinute: number;
  kda: number;
  killParticipation: number;
  goldPerMinute: number;
  deathsPerGame: number;
};

export type RoleQueueReference = {
  queue: string;
  position: string;
  sampleSize: number;
  minimumSample: number;
  sufficient: boolean;
  medians: AnalystMetrics | null;
};

export type LaneDifferential = {
  games: number;
  ahead: number;
  behind: number;
  tied: number;
  medianCsDifference: number;
};

export type AnalystSignal = {
  id: string;
  text: string;
};

export type AnalystReport = {
  strengths: AnalystSignal[];
  weaknesses: AnalystSignal[];
  context: {
    queue: string;
    position: string;
    playerGames: number;
    referenceSample: number;
  } | null;
  note: string;
};

type RankedSignal = AnalystSignal & { rank: number };
type MetricSample = AnalystMetrics & {
  matchId: string;
  playedAt: string;
  queue: string;
  position: string;
  puuid: string;
};

const KNOWN_POSITIONS = new Set(['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT']);

function ratio(part: number, total: number): number {
  return total > 0 ? part / total : 0;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function metricMedian(samples: AnalystMetrics[]): AnalystMetrics {
  return {
    csPerMinute: median(samples.map((sample) => sample.csPerMinute)),
    damagePerMinute: median(samples.map((sample) => sample.damagePerMinute)),
    kda: median(samples.map((sample) => sample.kda)),
    killParticipation: median(samples.map((sample) => sample.killParticipation)),
    goldPerMinute: median(samples.map((sample) => sample.goldPerMinute)),
    deathsPerGame: median(samples.map((sample) => sample.deathsPerGame)),
  };
}

function participantSample(
  detail: MatchDetail,
  participant: MatchParticipant,
  teamKills: number,
): MetricSample | null {
  if (
    detail.durationSeconds <= 0
    || detail.durationSeconds < 5 * 60
    || !participant.position
    || !KNOWN_POSITIONS.has(participant.position)
  ) return null;

  const minutes = detail.durationSeconds / 60;
  return {
    matchId: detail.matchId,
    playedAt: detail.playedAt,
    queue: detail.queue,
    position: participant.position,
    puuid: participant.puuid,
    csPerMinute: participant.cs / minutes,
    damagePerMinute: participant.damageDealt / minutes,
    kda: (participant.kills + participant.assists) / Math.max(participant.deaths, 1),
    killParticipation: ratio(participant.kills + participant.assists, teamKills),
    goldPerMinute: participant.goldEarned / minutes,
    deathsPerGame: participant.deaths,
  };
}

function participantSamples(details: MatchDetail[]): MetricSample[] {
  return details.flatMap((detail) => detail.teams.flatMap((team) => (
    team.participants.flatMap((participant) => {
      const sample = participantSample(detail, participant, team.kills);
      return sample ? [sample] : [];
    })
  )));
}

/**
 * Calcula el valor típico por rol y cola sobre snapshots completos. Las partidas sin posición
 * (Arena) quedan afuera y los grupos chicos conservan su conteo, pero no publican una referencia.
 */
export function buildRoleQueueReferences(
  details: MatchDetail[],
  minimumSample = DEFAULT_ROLE_REFERENCE_MIN_SAMPLE,
): RoleQueueReference[] {
  const required = Math.max(1, Math.trunc(minimumSample));
  const groups = new Map<string, MetricSample[]>();

  for (const sample of participantSamples(details)) {
    const key = `${sample.queue}\u0000${sample.position}`;
    groups.set(key, [...(groups.get(key) ?? []), sample]);
  }

  return [...groups.values()]
    .map((samples) => {
      const first = samples[0]!;
      const sufficient = samples.length >= required;
      return {
        queue: first.queue,
        position: first.position,
        sampleSize: samples.length,
        minimumSample: required,
        sufficient,
        medians: sufficient ? metricMedian(samples) : null,
      };
    })
    .sort((a, b) => a.queue.localeCompare(b.queue) || a.position.localeCompare(b.position));
}

function roleForSentence(position: string): string {
  return position === 'ADC' ? 'ADC' : positionLabel(position).toLocaleLowerCase('es-AR');
}

function decimal(value: number): string {
  return value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function whole(value: number): string {
  return Math.round(value).toLocaleString('es-AR');
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function dominantContext(matches: PlayerMatchSummary[]): {
  queue: string;
  position: string;
  matches: PlayerMatchSummary[];
} | null {
  const groups = new Map<string, PlayerMatchSummary[]>();
  for (const match of matches) {
    if (isRemake(match) || !match.position || !KNOWN_POSITIONS.has(match.position)) continue;
    const key = `${match.queue}\u0000${match.position}`;
    groups.set(key, [...(groups.get(key) ?? []), match]);
  }
  const selected = [...groups.values()].sort((a, b) => (
    b.length - a.length || b[0]!.playedAt.getTime() - a[0]!.playedAt.getTime()
  ))[0];
  return selected ? { queue: selected[0]!.queue, position: selected[0]!.position!, matches: selected } : null;
}

function metricsFromSummaries(matches: PlayerMatchSummary[]): Omit<AnalystMetrics, 'goldPerMinute'> {
  const durationMinutes = matches.reduce((sum, match) => sum + match.durationSeconds, 0) / 60;
  const kills = matches.reduce((sum, match) => sum + match.kills, 0);
  const deaths = matches.reduce((sum, match) => sum + match.deaths, 0);
  const assists = matches.reduce((sum, match) => sum + match.assists, 0);
  const teamKills = matches.reduce((sum, match) => sum + match.teamKills, 0);
  return {
    csPerMinute: ratio(matches.reduce((sum, match) => sum + match.cs, 0), durationMinutes),
    damagePerMinute: ratio(matches.reduce((sum, match) => sum + match.damageDealt, 0), durationMinutes),
    kda: ratio(kills + assists, Math.max(deaths, 1)),
    killParticipation: ratio(kills + assists, teamKills),
    deathsPerGame: ratio(deaths, matches.length),
  };
}

function targetGoldPerMinute(
  details: MatchDetail[],
  puuid: string,
  matchIds: ReadonlySet<string>,
  queue: string,
  position: string,
): { value: number; games: number } | null {
  const samples = participantSamples(details).filter((sample) => (
    sample.puuid === puuid
    && matchIds.has(sample.matchId)
    && sample.queue === queue
    && sample.position === position
  ));
  return samples.length >= MIN_PLAYER_COMPARISON_GAMES
    ? { value: median(samples.map((sample) => sample.goldPerMinute)), games: samples.length }
    : null;
}

/** Compara las últimas seis partidas que tienen un rival del mismo rol en el otro equipo. */
export function deriveLaneDifferential(
  details: MatchDetail[],
  puuid: string,
  matchIds?: ReadonlySet<string>,
  limit = 6,
): LaneDifferential | null {
  const differences = details
    .flatMap((detail) => {
      if (matchIds && !matchIds.has(detail.matchId)) return [];
      let target: MatchParticipant | undefined;
      let targetTeam: string | undefined;
      for (const team of detail.teams) {
        const found = team.participants.find((participant) => participant.puuid === puuid);
        if (found) {
          target = found;
          targetTeam = team.key;
          break;
        }
      }
      if (!target?.position || !KNOWN_POSITIONS.has(target.position)) return [];
      const opponent = detail.teams
        .filter((team) => team.key !== targetTeam)
        .flatMap((team) => team.participants)
        .find((participant) => participant.position === target!.position);
      if (!opponent) return [];
      return [{ playedAt: detail.playedAt, difference: target.cs - opponent.cs }];
    })
    .sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime())
    .slice(0, Math.max(1, limit));

  if (differences.length === 0) return null;
  const values = differences.map((entry) => entry.difference);
  return {
    games: values.length,
    ahead: values.filter((value) => value > 0).length,
    behind: values.filter((value) => value < 0).length,
    tied: values.filter((value) => value === 0).length,
    medianCsDifference: median(values),
  };
}

function metricSignals(
  player: AnalystMetrics,
  typical: AnalystMetrics,
  comparison: string,
): { strengths: RankedSignal[]; weaknesses: RankedSignal[] } {
  const strengths: RankedSignal[] = [];
  const weaknesses: RankedSignal[] = [];
  const add = (
    id: string,
    value: number,
    baseline: number,
    threshold: number,
    positiveText: string,
    negativeText: string,
    format: (number: number) => string,
    lowerIsBetter = false,
  ) => {
    if (baseline <= 0) return;
    const delta = (value - baseline) / baseline;
    const directed = lowerIsBetter ? -delta : delta;
    const text = `${directed > 0 ? positiveText : negativeText}: ${format(value)}, contra ${format(baseline)}, ${comparison}.`;
    const signal = { id, text, rank: Math.abs(directed) / threshold };
    if (directed >= threshold) strengths.push(signal);
    if (directed <= -threshold) weaknesses.push(signal);
  };

  add('cs', player.csPerMinute, typical.csPerMinute, 0.12, 'Farmea más', 'Farmea poco', (value) => `${decimal(value)} CS/min`);
  add('damage', player.damagePerMinute, typical.damagePerMinute, 0.15, 'Hace mucho daño', 'Hace poco daño', (value) => `${whole(value)} daño/min`);
  add('kda', player.kda, typical.kda, 0.2, 'Sostiene un KDA alto', 'Su KDA queda corto', (value) => `${decimal(value)} KDA`);
  add('kp', player.killParticipation, typical.killParticipation, 0.15, 'Participa mucho en las bajas', 'Participa poco en las bajas', percent);
  add('gold', player.goldPerMinute, typical.goldPerMinute, 0.1, 'Genera más oro', 'Genera poco oro', (value) => `${whole(value)} oro/min`);
  add('deaths', player.deathsPerGame, typical.deathsPerGame, 0.18, 'Se expone poco', 'Muere demasiado', (value) => `${decimal(value)} muertes/partida`, true);
  return { strengths, weaknesses };
}

export function buildOpponentAnalystReport({
  details,
  matches,
  minimumReferenceSample = DEFAULT_ROLE_REFERENCE_MIN_SAMPLE,
}: {
  details: MatchDetail[];
  matches: PlayerMatchSummary[];
  minimumReferenceSample?: number;
}): AnalystReport {
  const context = dominantContext(matches);
  const targetPuuid = matches[0]?.puuid;
  const matchIds = new Set(matches.map((match) => match.matchId));
  const strengths: RankedSignal[] = [];
  const weaknesses: RankedSignal[] = [];
  let note = 'Hay pocas partidas comparables para afirmar algo con respaldo.';
  let reportContext: AnalystReport['context'] = null;

  if (context) {
    const references = buildRoleQueueReferences(details, minimumReferenceSample);
    const reference = references.find((candidate) => (
      candidate.queue === context.queue && candidate.position === context.position
    ));
    const referenceSample = reference?.sampleSize ?? 0;
    reportContext = {
      queue: context.queue,
      position: context.position,
      playerGames: context.matches.length,
      referenceSample,
    };

    if (!reference?.sufficient || !reference.medians) {
      note = `No hay referencia suficiente de ${roleForSentence(context.position)} en ${queueLabel(context.queue)}: ${referenceSample} de ${Math.max(1, Math.trunc(minimumReferenceSample))} participantes necesarios.`;
    } else if (context.matches.length < MIN_PLAYER_COMPARISON_GAMES) {
      note = `Hay ${context.matches.length} ${context.matches.length === 1 ? 'partida comparable' : 'partidas comparables'} de este jugador; hacen falta ${MIN_PLAYER_COMPARISON_GAMES} para contrastar su rendimiento.`;
    } else {
      const summaryMetrics = metricsFromSummaries(context.matches);
      const gold = targetPuuid
        ? targetGoldPerMinute(details, targetPuuid, matchIds, context.queue, context.position)
        : null;
      const playerMetrics: AnalystMetrics = {
        ...summaryMetrics,
        goldPerMinute: gold?.value ?? reference.medians.goldPerMinute,
      };
      const comparison = `típico de ${roleForSentence(context.position)} en ${queueLabel(context.queue)}`;
      const signals = metricSignals(playerMetrics, reference.medians, comparison);
      strengths.push(...signals.strengths.filter((signal) => signal.id !== 'gold' || gold));
      weaknesses.push(...signals.weaknesses.filter((signal) => signal.id !== 'gold' || gold));
      note = `Comparación por medianas: ${context.matches.length} partidas del jugador contra ${reference.sampleSize} participantes del mismo rol y cola.`;
    }
  }

  if (targetPuuid) {
    const lane = deriveLaneDifferential(details, targetPuuid, matchIds);
    if (lane && lane.games >= MIN_LANE_COMPARISON_GAMES) {
      const enoughAhead = lane.ahead / lane.games >= 0.6;
      const enoughBehind = lane.behind / lane.games >= 0.6;
      if (lane.medianCsDifference >= 10 && enoughAhead) {
        strengths.push({
          id: 'lane',
          rank: 1_000 + lane.ahead / lane.games,
          text: `Saca ventaja directa: +${decimal(lane.medianCsDifference)} CS de mediana contra su rival; terminó arriba en ${lane.ahead} de ${lane.games} partidas.`,
        });
      }
      if (lane.medianCsDifference <= -10 && enoughBehind) {
        weaknesses.push({
          id: 'lane',
          rank: 1_000 + lane.behind / lane.games,
          text: `Cede contra su rival directo: ${decimal(lane.medianCsDifference)} CS de mediana; quedó abajo en ${lane.behind} de ${lane.games} partidas.`,
        });
      }
    }
  }

  return {
    strengths: strengths.sort((a, b) => b.rank - a.rank).slice(0, 3).map(({ id, text }) => ({ id, text })),
    weaknesses: weaknesses.sort((a, b) => b.rank - a.rank).slice(0, 3).map(({ id, text }) => ({ id, text })),
    context: reportContext,
    note,
  };
}

function summaryMetrics(matches: PlayerMatchSummary[]): Omit<AnalystMetrics, 'goldPerMinute'> {
  return metricsFromSummaries(matches.filter((match) => !isRemake(match)));
}

function selfTrendSignals(recent: PlayerMatchSummary[], previous: PlayerMatchSummary[]): {
  strengths: RankedSignal[];
  weaknesses: RankedSignal[];
} {
  const current = summaryMetrics(recent);
  const baseline = summaryMetrics(previous);
  const strengths: RankedSignal[] = [];
  const weaknesses: RankedSignal[] = [];
  const add = (
    id: string,
    value: number,
    typical: number,
    threshold: number,
    up: string,
    down: string,
    format: (number: number) => string,
    lowerIsBetter = false,
  ) => {
    if (typical <= 0) return;
    const delta = (value - typical) / typical;
    const directed = lowerIsBetter ? -delta : delta;
    if (Math.abs(directed) < threshold) return;
    const signal = {
      id,
      rank: 100 + Math.abs(directed) / threshold,
      text: `${directed > 0 ? up : down}: ${format(value)} en tus últimas ${recent.length}, contra ${format(typical)} en las ${previous.length} anteriores.`,
    };
    (directed > 0 ? strengths : weaknesses).push(signal);
  };

  add('self-cs', current.csPerMinute, baseline.csPerMinute, 0.12, 'Venís farmeando más', 'Venís farmeando menos', (value) => `${decimal(value)} CS/min`);
  add('self-damage', current.damagePerMinute, baseline.damagePerMinute, 0.15, 'Subiste tu daño', 'Bajaste tu daño', (value) => `${whole(value)} daño/min`);
  add('self-kda', current.kda, baseline.kda, 0.2, 'Mejoraste tu KDA', 'Bajó tu KDA', (value) => `${decimal(value)} KDA`);
  add('self-kp', current.killParticipation, baseline.killParticipation, 0.15, 'Participás más en las bajas', 'Participás menos en las bajas', percent);
  add('self-deaths', current.deathsPerGame, baseline.deathsPerGame, 0.18, 'Te estás exponiendo menos', 'Te estás muriendo más', (value) => `${decimal(value)} muertes/partida`, true);
  return { strengths, weaknesses };
}

function localHour(date: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(date).find((part) => part.type === 'hour')?.value;
  return Number(hour ?? 0);
}

const DAY_PARTS = [
  { key: 'madrugada', label: 'la madrugada', start: 0 },
  { key: 'mañana', label: 'la mañana', start: 6 },
  { key: 'tarde', label: 'la tarde', start: 12 },
  { key: 'noche', label: 'la noche', start: 18 },
] as const;

/** Perfil propio: compara tramos del historial de la persona, nunca contra desconocidos. */
export function buildSelfAnalystReport({
  matches,
  season,
  timeZone = APP_TIME_ZONE,
}: {
  matches: PlayerMatchSummary[];
  season?: RankedSeason | null;
  timeZone?: string;
}): AnalystReport {
  const counted = matches
    .filter((match) => !isRemake(match))
    .sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
  const strengths: RankedSignal[] = [];
  const weaknesses: RankedSignal[] = [];
  const overallWins = counted.filter((match) => match.win).length;
  const overallWinRate = ratio(overallWins, counted.length);

  if (counted.length >= 10) {
    const trends = selfTrendSignals(counted.slice(0, 5), counted.slice(5));
    strengths.push(...trends.strengths);
    weaknesses.push(...trends.weaknesses);
  }

  if (season && season.games >= 20 && counted.length >= 5) {
    const seasonWinRate = ratio(season.wins, season.games);
    const delta = overallWinRate - seasonWinRate;
    if (Math.abs(delta) >= 0.1) {
      const signal = {
        id: 'self-form',
        rank: 280 + Math.abs(delta),
        text: `Tu forma reciente está ${delta > 0 ? 'mejor' : 'peor'}: ${percent(overallWinRate)} en ${counted.length} partidas, contra ${percent(seasonWinRate)} en ${season.games} de temporada.`,
      };
      (delta > 0 ? strengths : weaknesses).push(signal);
    }
  }

  const champions = summarizeMatchesByChampion(counted).filter((champion) => champion.games >= 2);
  if (champions.length >= 2) {
    const byPerformance = [...champions].sort((a, b) => (
      b.winRate - a.winRate || b.games - a.games || a.championName.localeCompare(b.championName)
    ));
    const best = byPerformance[0]!;
    const worst = byPerformance[byPerformance.length - 1]!;
    if (best.winRate - overallWinRate >= 0.15) {
      strengths.push({
        id: 'self-best-champion',
        rank: 300 + best.games / 100,
        text: `Tu mejor campeón reciente es ${best.championName}: ${percent(best.winRate)} en ${best.games} partidas, contra tu ${percent(overallWinRate)} general.`,
      });
    }
    if (overallWinRate - worst.winRate >= 0.15) {
      weaknesses.push({
        id: 'self-worst-champion',
        rank: 300 + worst.games / 100,
        text: `Tu peor campeón reciente es ${worst.championName}: ${percent(worst.winRate)} en ${worst.games} partidas, contra tu ${percent(overallWinRate)} general.`,
      });
    }
  }

  const dayPartBuckets = DAY_PARTS.map((part) => {
    const bucket = counted.filter((match) => {
      const hour = localHour(match.playedAt, timeZone);
      return hour >= part.start && hour < part.start + 6;
    });
    return {
      ...part,
      games: bucket.length,
      winRate: ratio(bucket.filter((match) => match.win).length, bucket.length),
    };
  }).filter((bucket) => bucket.games >= 3);
  const worstTime = [...dayPartBuckets].sort((a, b) => a.winRate - b.winRate || b.games - a.games)[0];
  if (worstTime && overallWinRate - worstTime.winRate >= 0.15) {
    weaknesses.push({
      id: 'self-worst-time',
      rank: 290 + worstTime.games / 100,
      text: `Tu peor horario es ${worstTime.label}: ${percent(worstTime.winRate)} en ${worstTime.games} partidas, contra tu ${percent(overallWinRate)} general.`,
    });
  }

  const hasSignals = strengths.length > 0 || weaknesses.length > 0;
  return {
    strengths: strengths.sort((a, b) => b.rank - a.rank).slice(0, 3).map(({ id, text }) => ({ id, text })),
    weaknesses: weaknesses.sort((a, b) => b.rank - a.rank).slice(0, 3).map(({ id, text }) => ({ id, text })),
    context: null,
    note: hasSignals
      ? `La comparación usa tus ${counted.length} partidas recientes y solo marca diferencias claras.`
      : counted.length < 10
        ? `Hay ${counted.length} partidas completas; hacen falta 10 para comparar tu forma reciente contra tu propio historial.`
        : 'Tus tramos recientes están cerca de tu propio promedio; no hay una diferencia sólida para marcar.',
  };
}
