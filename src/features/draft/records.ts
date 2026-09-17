import { and, desc, eq, inArray } from 'drizzle-orm';

import type { Db } from '@/db/client';
import {
  champions,
  draftRecordPicks,
  draftRecords,
  matchDetails,
  playerMatches,
  users,
} from '@/db/schema';
import type {
  Draft,
  DraftAnalysis,
  DraftPick,
  DraftRisk,
} from '@/features/draft/analysis';
import type { CompletedDraftSyncRun } from '@/features/draft/matrix-cache';
import { DRAFT_ROLES, type DraftRole } from '@/features/draft/types';
import { championImageUrl } from '@/features/champions/ddragon-sync';
import { toMatchOptions, type MatchOption } from '@/features/matches/match-options';
import type { MatchDetail } from '@/features/matches/types';

export const MIN_CALIBRATION_SAMPLE = 20;
// Con n=20, incluso un resultado cerca de 50 % conserva un margen de error aproximado de ±22 pp
// al 95 %. Menos que eso sirve para juntar evidencia, no para sacar una conclusión del modelo.

export type DraftRecordSide = 'allies' | 'enemies';
export type DraftRecordResult = 'win' | 'lose' | 'other';

export class DraftRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DraftRecordError';
  }
}

export function isCompleteDraft(draft: Draft): boolean {
  const completeTeam = (picks: readonly DraftPick[]) => (
    picks.length === DRAFT_ROLES.length
    && new Set(picks.map((pick) => pick.role)).size === DRAFT_ROLES.length
    && DRAFT_ROLES.every((role) => picks.some((pick) => pick.role === role))
  );
  return completeTeam(draft.allies)
    && completeTeam(draft.enemies)
    && new Set([...draft.allies, ...draft.enemies].map((pick) => pick.championKey)).size === 10;
}

export function createDraftRecord(
  db: Db,
  savedByUserId: number,
  draft: Draft,
  risk: DraftRisk,
  run: CompletedDraftSyncRun,
  analysis: DraftAnalysis,
  savedAt: Date,
  capturedLive = false,
): number {
  if (!isCompleteDraft(draft)) {
    throw new DraftRecordError('Completá los cinco campeones de cada lado antes de guardar.');
  }

  return db.transaction((tx) => {
    const record = tx.insert(draftRecords).values({
      savedByUserId,
      savedAt,
      capturedLive,
      predictedAllyWinrate: analysis.winrate,
      risk,
      patchWindow: run.patchWindow,
      syncRunId: run.id,
      allyChampionRating: analysis.allyChampionRating,
      enemyChampionRating: analysis.enemyChampionRating,
      allyDuoRating: analysis.allyDuoRating,
      enemyDuoRating: analysis.enemyDuoRating,
      matchupRating: analysis.matchupRating,
      totalRating: analysis.totalRating,
    }).returning({ id: draftRecords.id }).get();

    tx.insert(draftRecordPicks).values([
      ...draft.allies.map((pick) => ({
        draftRecordId: record.id,
        side: 'allies' as const,
        ...pick,
      })),
      ...draft.enemies.map((pick) => ({
        draftRecordId: record.id,
        side: 'enemies' as const,
        ...pick,
      })),
    ]).run();

    return record.id;
  });
}

export type DraftRecordPickView = {
  side: DraftRecordSide;
  role: DraftRole;
  championKey: number;
  championName: string;
  imageUrl: string;
};

export type DraftRecordView = {
  id: number;
  savedBy: { id: number; name: string };
  savedAt: Date;
  capturedLive: boolean;
  predictedAllyWinrate: number;
  risk: DraftRisk;
  patchWindow: string;
  syncRunId: number;
  components: {
    allyChampions: number;
    enemyChampions: number;
    allyDuos: number;
    enemyDuos: number;
    matchups: number;
    total: number;
  };
  picks: DraftRecordPickView[];
  match: {
    provider: string;
    id: string;
    snapshot: MatchDetail;
    playedAt: Date;
    allyTeamKey: string;
    result: DraftRecordResult;
    savedAfterMatch: boolean;
  } | null;
  canDelete: boolean;
};

export function listDraftRecords(db: Db, viewerUserId: number): DraftRecordView[] {
  const rows = db.select({ record: draftRecords, savedByName: users.displayName })
    .from(draftRecords)
    .innerJoin(users, eq(users.id, draftRecords.savedByUserId))
    .orderBy(desc(draftRecords.savedAt))
    .all();
  if (!rows.length) return [];

  const picks = db.select({
    draftRecordId: draftRecordPicks.draftRecordId,
    side: draftRecordPicks.side,
    role: draftRecordPicks.role,
    championKey: draftRecordPicks.championKey,
    championName: champions.name,
    imageFile: champions.imageFile,
    version: champions.version,
  })
    .from(draftRecordPicks)
    .innerJoin(champions, eq(champions.key, draftRecordPicks.championKey))
    .where(inArray(draftRecordPicks.draftRecordId, rows.map(({ record }) => record.id)))
    .all();
  const roleOrder = new Map(DRAFT_ROLES.map((role, index) => [role, index]));

  return rows.map(({ record, savedByName }) => ({
    id: record.id,
    savedBy: { id: record.savedByUserId, name: savedByName ?? 'Sin nombre' },
    savedAt: record.savedAt,
    capturedLive: record.capturedLive,
    predictedAllyWinrate: record.predictedAllyWinrate,
    risk: record.risk,
    patchWindow: record.patchWindow,
    syncRunId: record.syncRunId,
    components: {
      allyChampions: record.allyChampionRating,
      enemyChampions: record.enemyChampionRating,
      allyDuos: record.allyDuoRating,
      enemyDuos: record.enemyDuoRating,
      matchups: record.matchupRating,
      total: record.totalRating,
    },
    picks: picks
      .filter((pick) => pick.draftRecordId === record.id)
      .sort((first, second) => (
        first.side.localeCompare(second.side)
        || (roleOrder.get(first.role) ?? 0) - (roleOrder.get(second.role) ?? 0)
      ))
      .map((pick) => ({
        side: pick.side,
        role: pick.role,
        championKey: pick.championKey,
        championName: pick.championName,
        imageUrl: championImageUrl(pick.version, pick.imageFile),
      })),
    match: record.matchProvider
      && record.matchId
      && record.matchSnapshot
      && record.matchPlayedAt
      && record.allyTeamKey
      && record.result
      && record.savedAfterMatch !== null
      ? {
          provider: record.matchProvider,
          id: record.matchId,
          snapshot: record.matchSnapshot,
          playedAt: record.matchPlayedAt,
          allyTeamKey: record.allyTeamKey,
          result: record.result,
          savedAfterMatch: record.savedAfterMatch,
        }
      : null,
    canDelete: record.savedByUserId === viewerUserId,
  }));
}

export type DraftRecordMatchOption = MatchOption & { provider: string };

/** Sólo snapshots ya cacheados del historial del dueño; esta consulta jamás llama a la fuente. */
export function listCachedDraftRecordMatches(
  db: Db,
  savedByUserId: number,
  now: Date,
): DraftRecordMatchOption[] {
  const rows = db.select({ match: playerMatches })
    .from(playerMatches)
    .innerJoin(
      matchDetails,
      and(
        eq(matchDetails.provider, playerMatches.provider),
        eq(matchDetails.matchId, playerMatches.matchId),
      ),
    )
    .where(eq(playerMatches.userId, savedByUserId))
    .orderBy(desc(playerMatches.playedAt))
    .limit(10)
    .all();
  const imageByKey = new Map(
    db.select({ key: champions.key, version: champions.version, imageFile: champions.imageFile })
      .from(champions)
      .all()
      .flatMap((champion) => champion.key === null
        ? []
        : [[champion.key, championImageUrl(champion.version, champion.imageFile)] as const]),
  );
  const options = toMatchOptions(rows.map(({ match }) => match), imageByKey, now, 10);
  return options.map((option, index) => ({
    ...option,
    provider: rows[index]?.match.provider ?? '',
  }));
}

type MatchablePick = Pick<DraftRecordPickView, 'side' | 'championKey' | 'championName'>;

function sortedNumbers(values: Iterable<number>): number[] {
  return [...values].sort((first, second) => first - second);
}

function sameChampionSet(first: Iterable<number>, second: Iterable<number>): boolean {
  const a = sortedNumbers(first);
  const b = sortedNumbers(second);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function teamDifference(
  expected: readonly MatchablePick[],
  actual: MatchDetail['teams'][number],
): { missing: string[]; unexpected: string[] } {
  const expectedKeys = new Set(expected.map((pick) => pick.championKey));
  const actualByKey = new Map(actual.participants.map((participant) => [
    participant.championId,
    participant.championName,
  ]));
  return {
    missing: expected.filter((pick) => !actualByKey.has(pick.championKey)).map((pick) => pick.championName),
    unexpected: [...actualByKey]
      .filter(([championKey]) => !expectedKeys.has(championKey))
      .map(([, championName]) => championName),
  };
}

function differenceMessage(label: string, difference: ReturnType<typeof teamDifference>): string | null {
  const parts = [
    difference.missing.length ? `faltan ${difference.missing.join(', ')}` : '',
    difference.unexpected.length ? `aparecen ${difference.unexpected.join(', ')}` : '',
  ].filter(Boolean);
  return parts.length ? `${label}: ${parts.join('; ')}` : null;
}

function differenceSize(difference: ReturnType<typeof teamDifference>): number {
  return difference.missing.length + difference.unexpected.length;
}

export type MatchedDraftResult = {
  allyTeamKey: string;
  result: DraftRecordResult;
  playedAt: Date;
};

/** Valida los dos equipos y deriva lado/resultado; no acepta un “gané/perdí” externo. */
export function matchDraftToDetail(
  picks: readonly MatchablePick[],
  detail: MatchDetail,
): MatchedDraftResult {
  const allies = picks.filter((pick) => pick.side === 'allies');
  const enemies = picks.filter((pick) => pick.side === 'enemies');
  if (allies.length !== 5 || enemies.length !== 5 || detail.teams.length !== 2) {
    throw new DraftRecordError('El draft o la partida no tienen dos equipos completos de cinco campeones.');
  }

  const allyKeys = allies.map((pick) => pick.championKey);
  const enemyKeys = enemies.map((pick) => pick.championKey);
  const allyTeam = detail.teams.find((team) => sameChampionSet(
    allyKeys,
    team.participants.map((participant) => participant.championId),
  ));
  const enemyTeam = detail.teams.find((team) => sameChampionSet(
    enemyKeys,
    team.participants.map((participant) => participant.championId),
  ));
  if (!allyTeam || !enemyTeam || allyTeam.key === enemyTeam.key) {
    const firstOrientation = detail.teams[0];
    const secondOrientation = detail.teams[1];
    if (!firstOrientation || !secondOrientation) {
      throw new DraftRecordError('La partida no tiene dos equipos completos.');
    }
    const orientations = [
      {
        ally: teamDifference(allies, firstOrientation),
        enemy: teamDifference(enemies, secondOrientation),
      },
      {
        ally: teamDifference(allies, secondOrientation),
        enemy: teamDifference(enemies, firstOrientation),
      },
    ];
    const closest = orientations.sort((first, second) => (
      differenceSize(first.ally) + differenceSize(first.enemy)
      - differenceSize(second.ally) - differenceSize(second.enemy)
    ))[0]!;
    const messages = [
      differenceMessage('No coincide tu equipo', closest.ally),
      differenceMessage('No coincide el enemigo', closest.enemy),
    ].filter(Boolean);
    throw new DraftRecordError(messages.join('. ') || 'Los campeones de la partida no coinciden con el draft.');
  }

  const playedAt = new Date(detail.playedAt);
  if (Number.isNaN(playedAt.getTime())) {
    throw new DraftRecordError('La partida cacheada no tiene una fecha válida.');
  }
  const normal = detail.teams.flatMap((team) => team.participants)
    .every((participant) => participant.result === 'WIN' || participant.result === 'LOSE');
  return {
    allyTeamKey: allyTeam.key,
    result: normal ? (allyTeam.win ? 'win' : 'lose') : 'other',
    playedAt,
  };
}

export function attachDraftRecordMatch(
  db: Db,
  recordId: number,
  provider: string,
  matchId: string,
  attachedAt: Date,
): void {
  db.transaction((tx) => {
    const record = tx.select().from(draftRecords).where(eq(draftRecords.id, recordId)).get();
    if (!record) throw new DraftRecordError('Ese registro no existe.');
    if (record.matchId) throw new DraftRecordError('Ese registro ya tiene una partida adjunta.');

    const cached = tx.select({ snapshot: matchDetails.data })
      .from(playerMatches)
      .innerJoin(
        matchDetails,
        and(
          eq(matchDetails.provider, playerMatches.provider),
          eq(matchDetails.matchId, playerMatches.matchId),
        ),
      )
      .where(and(
        eq(playerMatches.userId, record.savedByUserId),
        eq(playerMatches.provider, provider),
        eq(playerMatches.matchId, matchId),
      ))
      .get();
    if (!cached) {
      throw new DraftRecordError('Esa partida no está completa en el historial cacheado del jugador.');
    }

    const picks = tx.select({
      side: draftRecordPicks.side,
      championKey: draftRecordPicks.championKey,
      championName: champions.name,
    })
      .from(draftRecordPicks)
      .innerJoin(champions, eq(champions.key, draftRecordPicks.championKey))
      .where(eq(draftRecordPicks.draftRecordId, recordId))
      .all();
    const matched = matchDraftToDetail(picks, cached.snapshot);

    tx.update(draftRecords).set({
      matchProvider: provider,
      matchId,
      matchSnapshot: cached.snapshot,
      matchPlayedAt: matched.playedAt,
      allyTeamKey: matched.allyTeamKey,
      result: matched.result,
      savedAfterMatch: record.savedAt.getTime() > matched.playedAt.getTime(),
      attachedAt,
    }).where(eq(draftRecords.id, recordId)).run();
  });
}

export function deleteDraftRecord(db: Db, userId: number, recordId: number): void {
  const record = db.select({ savedByUserId: draftRecords.savedByUserId })
    .from(draftRecords)
    .where(eq(draftRecords.id, recordId))
    .get();
  if (!record) throw new DraftRecordError('Ese registro no existe.');
  if (record.savedByUserId !== userId) {
    throw new DraftRecordError('Solo quien guardó el registro puede borrarlo.');
  }
  db.delete(draftRecords).where(eq(draftRecords.id, recordId)).run();
}

export type CalibrationRate = { percentage: number; wins: number; n: number };
export type CalibrationBand = {
  lower: number;
  upper: number;
  label: string;
  rate: CalibrationRate | null;
};
export type DraftCalibration = {
  eligibleN: number;
  excludedN: number;
  enoughEvidence: boolean;
  bands: CalibrationBand[];
};

type CalibrationRecord = Pick<
  DraftRecordView,
  'predictedAllyWinrate' | 'capturedLive' | 'match'
>;

export function predictedSide(winrate: number): DraftRecordSide | null {
  if (Math.abs(winrate - 0.5) < 1e-12) return null;
  return winrate > 0.5 ? 'allies' : 'enemies';
}

export function recordWasCorrect(record: CalibrationRecord): boolean | null {
  const side = predictedSide(record.predictedAllyWinrate);
  // Una captura de Spectator-v5 sólo puede existir mientras la partida está en curso: en ese
  // momento el resultado todavía no existe. Esa garantía es más fuerte que comparar relojes, así
  // que cuenta aunque savedAt sea posterior al inicio. La carga manual conserva la regla anterior.
  const savedTooLate = record.match?.savedAfterMatch && !record.capturedLive;
  if (!record.match || record.match.result === 'other' || savedTooLate || !side) {
    return null;
  }
  const alliesWon = record.match.result === 'win';
  return side === 'allies' ? alliesWon : !alliesWon;
}

export function buildDraftCalibration(records: readonly CalibrationRecord[]): DraftCalibration {
  const buckets = Array.from({ length: 5 }, (_, index) => ({
    lower: 50 + index * 10,
    upper: 60 + index * 10,
    wins: 0,
    n: 0,
  }));
  let eligibleN = 0;

  for (const record of records) {
    const correct = recordWasCorrect(record);
    if (correct === null) continue;
    const confidence = Math.max(record.predictedAllyWinrate, 1 - record.predictedAllyWinrate) * 100;
    const index = Math.min(Math.floor((confidence - 50) / 10), buckets.length - 1);
    const bucket = buckets[Math.max(index, 0)];
    if (!bucket) continue;
    bucket.n += 1;
    if (correct) bucket.wins += 1;
    eligibleN += 1;
  }

  return {
    eligibleN,
    excludedN: records.length - eligibleN,
    enoughEvidence: eligibleN >= MIN_CALIBRATION_SAMPLE,
    bands: buckets.map((bucket, index) => ({
      lower: bucket.lower,
      upper: bucket.upper,
      label: index === buckets.length - 1
        ? `${bucket.lower}–100 %`
        : `${bucket.lower}–${bucket.upper} %`,
      rate: bucket.n
        ? { percentage: bucket.wins / bucket.n, wins: bucket.wins, n: bucket.n }
        : null,
    })),
  };
}
