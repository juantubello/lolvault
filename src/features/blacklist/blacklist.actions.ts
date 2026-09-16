'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { getCurrentUser } from '@/auth/current-user';
import { BLACKLIST_NAME_MAX_LENGTH, BLACKLIST_REASON_MAX_LENGTH } from '@/config';
import { getDb, type Db } from '@/db/client';
import { blacklistProposals, matchDetails, matchParticipants, playerMatches } from '@/db/schema';
import { championImagesByKey } from '@/features/champions/champion-images';
import { getFriendProfile } from '@/features/friends/friends.queries';
import { queueLabel } from '@/features/matches/format';
import { toMatchOptions } from '@/features/matches/match-options';
import { loadPlayerStats } from '@/features/matches/player-stats';
import { matchOutcome } from '@/features/matches/player-summary';
import { getMatchProvider } from '@/features/matches/provider';
import { SESSION_ERROR_MESSAGE } from '@/features/profile/profile-form';
import type { RiotId } from '@/features/matches/types';
import { dispatchPushAfter } from '@/features/push/push-dispatch';
import {
  blacklistApprovedEvent,
  blacklistProposalCreatedEvent,
} from '@/features/push/push-events';
import { listMembers } from '@/features/vaults/vaults.queries';

import {
  cancelBlacklistProposal,
  castBlacklistVote,
  createAddProposal,
  createRemoveProposal,
  BlacklistRuleError,
  type BlacklistMatchAttachment,
} from './blacklist.queries';
import { riotIdKey, validateBlacklistRiotId } from './blacklist-rules';
import { formatKnownPlayerMatch } from './blacklist-ui';
import {
  listMatchesWithPlayer,
  searchKnownPlayers,
  type KnownPlayerSuggestion,
} from './known-players';

export type BlacklistProposalValues = {
  playerName: string;
  riotId: string;
  reason: string;
  matchId: string;
};

export type BlacklistProposalFormState = {
  fieldErrors?: Partial<Record<keyof BlacklistProposalValues, string>>;
  formError?: string;
  values?: BlacklistProposalValues;
  createdId?: number;
};

export type BlacklistActionResult = {
  error?: string;
  done?: boolean;
  values?: { reason: string };
};

export type KnownPlayersActionResult = {
  suggestions: KnownPlayerSuggestion[];
  error?: string;
};

export type BlacklistMatchOption = {
  matchId: string;
  championName: string;
  imageUrl: string | null;
  kills: number;
  deaths: number;
  assists: number;
  resultLabel: string;
  resultTone: 'win' | 'loss' | 'neutral';
  meta: string;
};

export type BlacklistMatchesActionResult = {
  status: 'ok' | 'invalid' | 'error';
  matches: BlacklistMatchOption[];
  message: string | null;
};

async function currentMember() {
  const user = await getCurrentUser();
  return user?.displayName ? user : null;
}

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function positiveId(formData: FormData, key: string): number | null {
  const id = Number(formData.get(key));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function refreshApp(): void {
  revalidatePath('/', 'layout');
}

function ruleMessage(error: unknown): string {
  if (error instanceof BlacklistRuleError) return error.message;
  throw error;
}

/** Busca solo snapshots ya cacheados y, con Riot ID, comprueba que ese jugador aparezca. */
function validatedAttachment(
  db: Db,
  matchId: string,
  riotId: RiotId | null,
): BlacklistMatchAttachment | null {
  const details = db.select().from(matchDetails).where(eq(matchDetails.matchId, matchId)).all();
  for (const detail of details) {
    const belongsToCachedHistory = Boolean(
      db
        .select({ userId: playerMatches.userId })
        .from(playerMatches)
        .where(
          and(
            eq(playerMatches.provider, detail.provider),
            eq(playerMatches.matchId, matchId),
          ),
        )
        .get(),
    );
    if (!belongsToCachedHistory) continue;

    if (riotId) {
      const participantAppears = db
        .select({ gameName: matchParticipants.gameName, tagLine: matchParticipants.tagLine })
        .from(matchParticipants)
        .where(
          and(
            eq(matchParticipants.provider, detail.provider),
            eq(matchParticipants.matchId, matchId),
          ),
        )
        .all()
        .some((participant) => riotIdKey(participant) === riotIdKey(riotId));
      if (!participantAppears) continue;
    }

    return {
      provider: detail.provider,
      matchId: detail.matchId,
      snapshot: detail.data,
    };
  }
  return null;
}

export async function createBlacklistProposalAction(
  _previousState: BlacklistProposalFormState,
  formData: FormData,
): Promise<BlacklistProposalFormState> {
  const values: BlacklistProposalValues = {
    playerName: formString(formData, 'playerName'),
    riotId: formString(formData, 'riotId'),
    reason: formString(formData, 'reason'),
    matchId: formString(formData, 'matchId'),
  };
  const user = await currentMember();
  if (!user) return { formError: SESSION_ERROR_MESSAGE, values };

  const fieldErrors: NonNullable<BlacklistProposalFormState['fieldErrors']> = {};
  if (!values.playerName) {
    fieldErrors.playerName = 'Ingresá el nombre que recuerdan del jugador.';
  } else if (values.playerName.length > BLACKLIST_NAME_MAX_LENGTH) {
    fieldErrors.playerName = `El nombre puede tener hasta ${BLACKLIST_NAME_MAX_LENGTH} caracteres.`;
  }
  if (!values.reason) {
    fieldErrors.reason = 'Contá por qué debería entrar a la black list.';
  } else if (values.reason.length > BLACKLIST_REASON_MAX_LENGTH) {
    fieldErrors.reason = `El motivo puede tener hasta ${BLACKLIST_REASON_MAX_LENGTH} caracteres.`;
  }
  const parsedRiotId = validateBlacklistRiotId(values.riotId);
  if (!parsedRiotId.ok) fieldErrors.riotId = parsedRiotId.error;
  if (Object.keys(fieldErrors).length > 0 || !parsedRiotId.ok) {
    return { fieldErrors, values };
  }

  const db = getDb();
  let attachment: BlacklistMatchAttachment | null = null;
  if (values.matchId) {
    attachment = validatedAttachment(db, values.matchId, parsedRiotId.riotId);
    if (!attachment) {
      return {
        fieldErrors: {
          matchId: parsedRiotId.riotId
            ? 'Esa partida no está cacheada o no aparece ese Riot ID.'
            : 'Esa partida no está cacheada en un historial.',
        },
        values,
      };
    }
  }

  try {
    const createdId = createAddProposal(
      db,
      user.id,
      {
        playerName: values.playerName,
        riotGameName: parsedRiotId.riotId?.gameName ?? null,
        riotTagLine: parsedRiotId.riotId?.tagLine ?? null,
        reason: values.reason,
      },
      new Date(),
      attachment,
    );
    dispatchPushAfter(
      db,
      blacklistProposalCreatedEvent({
        proposalId: createdId,
        kind: 'add',
        memberIds: listMembers(db).map((member) => member.id),
        proposerUserId: user.id,
        proposerName: user.displayName ?? 'Sin nombre',
        playerName: values.playerName,
      }),
    );
    refreshApp();
    return { createdId };
  } catch (error) {
    return { formError: ruleMessage(error), values };
  }
}

export async function requestBlacklistRemovalAction(
  _previousState: BlacklistActionResult,
  formData: FormData,
): Promise<BlacklistActionResult> {
  const reason = formString(formData, 'reason');
  const values = { reason };
  const user = await currentMember();
  if (!user) return { error: SESSION_ERROR_MESSAGE, values };

  const entryId = positiveId(formData, 'entryId');
  if (!entryId) return { error: 'Entrada inválida.', values };
  if (reason.length > BLACKLIST_REASON_MAX_LENGTH) {
    return {
      error: `El motivo puede tener hasta ${BLACKLIST_REASON_MAX_LENGTH} caracteres.`,
      values,
    };
  }

  try {
    const db = getDb();
    const createdId = createRemoveProposal(db, user.id, entryId, reason || null, new Date());
    const proposal = db
      .select({ playerName: blacklistProposals.playerName })
      .from(blacklistProposals)
      .where(eq(blacklistProposals.id, createdId))
      .get();
    if (proposal) {
      dispatchPushAfter(
        db,
        blacklistProposalCreatedEvent({
          proposalId: createdId,
          kind: 'remove',
          memberIds: listMembers(db).map((member) => member.id),
          proposerUserId: user.id,
          proposerName: user.displayName ?? 'Sin nombre',
          playerName: proposal.playerName,
        }),
      );
    }
    refreshApp();
    return { done: true };
  } catch (error) {
    return { error: ruleMessage(error), values };
  }
}

export async function blacklistVoteAction(
  _previousState: BlacklistActionResult,
  formData: FormData,
): Promise<BlacklistActionResult> {
  const user = await currentMember();
  if (!user) return { error: SESSION_ERROR_MESSAGE };
  const proposalId = positiveId(formData, 'proposalId');
  const value = formData.get('value');
  if (!proposalId || (value !== 'yes' && value !== 'no')) return { error: 'Voto inválido.' };

  try {
    const db = getDb();
    const outcome = castBlacklistVote(db, user.id, proposalId, value, new Date());
    if (outcome === 'approved') {
      const proposal = db
        .select({
          kind: blacklistProposals.kind,
          proposerUserId: blacklistProposals.proposerUserId,
          playerName: blacklistProposals.playerName,
        })
        .from(blacklistProposals)
        .where(eq(blacklistProposals.id, proposalId))
        .get();
      if (proposal) {
        dispatchPushAfter(db, blacklistApprovedEvent({ proposalId, ...proposal }));
      }
    }
    refreshApp();
    return { done: true };
  } catch (error) {
    return { error: ruleMessage(error) };
  }
}

export async function cancelBlacklistProposalAction(
  _previousState: BlacklistActionResult,
  formData: FormData,
): Promise<BlacklistActionResult> {
  const user = await currentMember();
  if (!user) return { error: SESSION_ERROR_MESSAGE };
  const proposalId = positiveId(formData, 'proposalId');
  if (!proposalId) return { error: 'Votación inválida.' };

  try {
    cancelBlacklistProposal(getDb(), user.id, proposalId, new Date());
    refreshApp();
    return { done: true };
  } catch (error) {
    return { error: ruleMessage(error) };
  }
}

export async function searchKnownPlayersAction(query: unknown): Promise<KnownPlayersActionResult> {
  const user = await currentMember();
  if (!user) return { suggestions: [], error: SESSION_ERROR_MESSAGE };
  // Llega del cliente: puede no ser texto aunque el tipo diga string.
  if (typeof query !== 'string' || query.length > 64) return { suggestions: [] };
  return { suggestions: searchKnownPlayers(getDb(), query, new Date()) };
}

/** Partidas de un Riot ID conocido o, sin Riot ID, las últimas de quien propone. */
export async function loadBlacklistMatchesAction(
  riotIdText: unknown,
): Promise<BlacklistMatchesActionResult> {
  const user = await currentMember();
  if (!user) return { status: 'error', matches: [], message: SESSION_ERROR_MESSAGE };
  if (typeof riotIdText !== 'string' || riotIdText.length > 64) {
    return { status: 'invalid', matches: [], message: 'Ese Riot ID no es válido.' };
  }

  const db = getDb();
  const now = new Date();
  const parsed = validateBlacklistRiotId(riotIdText);
  if (!parsed.ok) return { status: 'invalid', matches: [], message: parsed.error };

  if (parsed.riotId) {
    const images = championImagesByKey(db);
    const matches = listMatchesWithPlayer(db, parsed.riotId)
      .slice(0, 10)
      .map((match) => {
        const outcome = matchOutcome({
          durationSeconds: match.durationSeconds,
          win: match.result === 'WIN',
        });
        return {
          matchId: match.matchId,
          championName: match.championName,
          imageUrl: images.get(match.championId) ?? null,
          kills: match.kills,
          deaths: match.deaths,
          assists: match.assists,
          resultLabel: outcome.label,
          resultTone: outcome.tone,
          meta: `${queueLabel(match.queue)} · ${formatKnownPlayerMatch(
            match.members,
            user.id,
            match.playedAt,
            now,
          )}`,
        };
      });
    return {
      status: 'ok',
      matches,
      message: matches.length > 0 ? null : 'No encontramos partidas cacheadas con ese Riot ID.',
    };
  }

  const profile = getFriendProfile(db, user.id);
  if (!profile) return { status: 'error', matches: [], message: SESSION_ERROR_MESSAGE };
  const stats = await loadPlayerStats(db, getMatchProvider(), profile, now);
  if (stats.status === 'no-riot-id') {
    return {
      status: 'ok',
      matches: [],
      message: 'No cargaste tu Riot ID; podés proponer sin adjuntar una partida.',
    };
  }
  return {
    status: 'ok',
    matches: toMatchOptions(stats.matches, championImagesByKey(db), now),
    message: stats.error,
  };
}
