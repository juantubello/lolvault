'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { getCurrentUser } from '@/auth/current-user';
import { VAULT_REASON_MAX_LENGTH } from '@/config';
import { getDb } from '@/db/client';
import { champions, playerMatches } from '@/db/schema';
import { getFriendProfile } from '@/features/friends/friends.queries';
import { loadMatchDetail } from '@/features/matches/player-stats';
import { getMatchProvider } from '@/features/matches/provider';
import { SESSION_ERROR_MESSAGE } from '@/features/profile/profile-form';

import { readProposalValues, validateProposal, type ProposalFormState } from './proposal-form';
import {
  cancelProposal,
  castVote,
  createLiftProposal,
  createVaultProposal,
  listMembers,
  type MatchAttachment,
  VaultRuleError,
} from './vaults.queries';

export type ActionResult = { error?: string; done?: boolean };

/** Solo miembros con perfil completo proponen o votan. La identidad sale de la sesión. */
async function currentMember() {
  const user = await getCurrentUser();
  return user?.displayName ? user : null;
}

function ruleMessage(error: unknown): string {
  if (error instanceof VaultRuleError) return error.message;
  throw error;
}

function positiveId(formData: FormData, key: string): number | null {
  const id = Number(formData.get(key));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Votos, vaults y el badge de la tab dependen de esto: se revalida todo el árbol. */
function refreshApp() {
  revalidatePath('/', 'layout');
}

export async function createProposalAction(
  _previousState: ProposalFormState,
  formData: FormData,
): Promise<ProposalFormState> {
  const values = readProposalValues(formData);
  const user = await currentMember();
  if (!user) return { formError: SESSION_ERROR_MESSAGE, values };

  const db = getDb();
  const now = new Date();
  const result = validateProposal(values, {
    now,
    memberIds: new Set(listMembers(db).map((member) => member.id)),
    championIds: new Set(
      db
        .select({ id: champions.id })
        .from(champions)
        .all()
        .map((champion) => champion.id),
    ),
  });
  if (!result.ok) return { fieldErrors: result.fieldErrors, values };

  let attachment: MatchAttachment | null = null;
  if (values.matchId) {
    // La partida tiene que estar en el historial guardado de ESE jugador: no se confía en el cliente.
    const target = getFriendProfile(db, result.input.targetUserId);
    const row = db
      .select({ playedAt: playerMatches.playedAt })
      .from(playerMatches)
      .where(and(eq(playerMatches.userId, result.input.targetUserId), eq(playerMatches.matchId, values.matchId)))
      .get();
    if (!row || !target?.riotGameName || !target.riotTagLine) {
      return { fieldErrors: { matchId: 'Esa partida no está en el historial de este jugador.' }, values };
    }

    const provider = getMatchProvider();
    const snapshot = await loadMatchDetail(
      db,
      provider,
      { matchId: values.matchId, playedAt: row.playedAt },
      { gameName: target.riotGameName, tagLine: target.riotTagLine },
      now,
    );
    if (!snapshot) {
      return {
        formError: 'OP.GG no respondió al traer la partida. Probá de nuevo o proponé sin adjuntarla.',
        values,
      };
    }
    attachment = { provider: provider.name, matchId: values.matchId, snapshot };
  }

  try {
    // Regla dura: quien propone es el usuario de la sesión, nunca un campo del form.
    const createdId = createVaultProposal(db, user.id, result.input, now, attachment);
    refreshApp();
    return { createdId };
  } catch (error) {
    return { formError: ruleMessage(error), values };
  }
}

export async function voteAction(_previousState: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await currentMember();
  if (!user) return { error: SESSION_ERROR_MESSAGE };

  const proposalId = positiveId(formData, 'proposalId');
  const value = formData.get('value');
  if (!proposalId || (value !== 'yes' && value !== 'no')) return { error: 'Voto inválido.' };

  try {
    castVote(getDb(), user.id, proposalId, value, new Date());
    refreshApp();
    return { done: true };
  } catch (error) {
    return { error: ruleMessage(error) };
  }
}

export async function requestLiftAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await currentMember();
  if (!user) return { error: SESSION_ERROR_MESSAGE };

  const vaultId = positiveId(formData, 'vaultId');
  if (!vaultId) return { error: 'Vault inválido.' };

  const rawReason = formData.get('reason');
  const reason = typeof rawReason === 'string' ? rawReason.trim() : '';
  if (reason.length > VAULT_REASON_MAX_LENGTH) {
    return { error: `El motivo puede tener hasta ${VAULT_REASON_MAX_LENGTH} caracteres.` };
  }

  try {
    createLiftProposal(getDb(), user.id, vaultId, reason || null, new Date());
    refreshApp();
    return { done: true };
  } catch (error) {
    return { error: ruleMessage(error) };
  }
}

export async function cancelProposalAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await currentMember();
  if (!user) return { error: SESSION_ERROR_MESSAGE };

  const proposalId = positiveId(formData, 'proposalId');
  if (!proposalId) return { error: 'Votación inválida.' };

  try {
    cancelProposal(getDb(), user.id, proposalId, new Date());
    refreshApp();
    return { done: true };
  } catch (error) {
    return { error: ruleMessage(error) };
  }
}
