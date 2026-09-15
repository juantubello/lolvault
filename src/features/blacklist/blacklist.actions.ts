'use server';

import { and, eq, isNotNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { getCurrentUser } from '@/auth/current-user';
import { BLACKLIST_NAME_MAX_LENGTH, BLACKLIST_REASON_MAX_LENGTH } from '@/config';
import { getDb, type Db } from '@/db/client';
import { matchDetails, matchParticipants, playerMatches, users } from '@/db/schema';
import { SESSION_ERROR_MESSAGE } from '@/features/profile/profile-form';
import type { RiotId } from '@/features/matches/types';

import {
  cancelBlacklistProposal,
  castBlacklistVote,
  createAddProposal,
  createRemoveProposal,
  BlacklistRuleError,
  type BlacklistMatchAttachment,
} from './blacklist.queries';
import { riotIdKey, validateBlacklistRiotId } from './blacklist-rules';
import {
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

/** Busca solo snapshots ya cacheados que estén vinculados al historial de algún miembro. */
function validatedAttachment(
  db: Db,
  matchId: string,
  riotId: RiotId | null,
): BlacklistMatchAttachment | null {
  const details = db.select().from(matchDetails).where(eq(matchDetails.matchId, matchId)).all();
  for (const detail of details) {
    const belongsToMember = Boolean(
      db
        .select({ userId: playerMatches.userId })
        .from(playerMatches)
        .innerJoin(users, eq(users.id, playerMatches.userId))
        .where(
          and(
            eq(playerMatches.provider, detail.provider),
            eq(playerMatches.matchId, matchId),
            isNotNull(users.displayName),
          ),
        )
        .get(),
    );
    if (!belongsToMember) continue;

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
            ? 'Esa partida no está cacheada para el grupo o no aparece ese Riot ID.'
            : 'Esa partida no está cacheada en el historial de un miembro.',
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
    createRemoveProposal(getDb(), user.id, entryId, reason || null, new Date());
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
    castBlacklistVote(getDb(), user.id, proposalId, value, new Date());
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

export async function searchKnownPlayersAction(query: string): Promise<KnownPlayersActionResult> {
  const user = await currentMember();
  if (!user) return { suggestions: [], error: SESSION_ERROR_MESSAGE };
  return { suggestions: searchKnownPlayers(getDb(), query, new Date()) };
}
