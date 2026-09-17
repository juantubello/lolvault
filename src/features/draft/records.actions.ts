'use server';

import { revalidatePath } from 'next/cache';

import { getCurrentUser } from '@/auth/current-user';
import { getDb } from '@/db/client';
import { champions } from '@/db/schema';
import { analyzeDraft } from '@/features/draft/analysis';
import { parseDraftUrl } from '@/features/draft/draft-url';
import { getDraftMatrix, getLatestCompletedDraftRun } from '@/features/draft/matrix-cache';
import { SESSION_ERROR_MESSAGE } from '@/features/profile/profile-form';
import { verifyLiveCaptureToken } from '@/features/scout/live-capture';

import {
  attachDraftRecordMatch,
  createDraftRecord,
  deleteDraftRecord,
  DraftRecordError,
  isCompleteDraft,
} from './records';

export type DraftRecordActionState = { error?: string; done?: boolean; savedId?: number };

async function currentMember() {
  const user = await getCurrentUser();
  return user?.displayName ? user : null;
}

function positiveId(formData: FormData, key: string): number | null {
  const value = Number(formData.get(key));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function message(error: unknown): string {
  if (error instanceof DraftRecordError) return error.message;
  throw error;
}

function refreshRegistro(): void {
  revalidatePath('/scout');
}

export async function saveDraftRecordAction(
  _previousState: DraftRecordActionState,
  formData: FormData,
): Promise<DraftRecordActionState> {
  const user = await currentMember();
  if (!user) return { error: SESSION_ERROR_MESSAGE };

  const db = getDb();
  const validChampionKeys = db.select({ key: champions.key }).from(champions).all()
    .flatMap(({ key }) => key === null ? [] : [key]);
  const state = parseDraftUrl({
    aliados: textValue(formData, 'aliados'),
    enemigos: textValue(formData, 'enemigos'),
    riesgo: textValue(formData, 'riesgo'),
  }, validChampionKeys);
  if (!isCompleteDraft(state)) {
    return { error: 'Completá los cinco campeones de cada lado antes de guardar.' };
  }

  const run = getLatestCompletedDraftRun(db);
  const matrix = getDraftMatrix(db);
  if (!run || !matrix) {
    return { error: 'Todavía no hay una corrida completa para calcular y guardar el draft.' };
  }

  try {
    // La identidad, la corrida y la predicción se obtienen del servidor. Un userId o porcentaje
    // agregado al FormData queda deliberadamente sin leer.
    const analysis = analyzeDraft(matrix, state, state.risk);
    const captureToken = textValue(formData, 'captura');
    const apiKey = process.env.RIOT_API_KEY?.trim() ?? '';
    const capturedLive = captureToken !== ''
      && verifyLiveCaptureToken(captureToken, user.id, apiKey);
    if (captureToken && !capturedLive) {
      return {
        error: 'No pudimos validar la captura en vivo. Volvé a traer la partida o vaciá el draft para guardarlo como carga manual.',
      };
    }
    const savedId = createDraftRecord(
      db,
      user.id,
      state,
      state.risk,
      run,
      analysis,
      new Date(),
      capturedLive,
    );
    refreshRegistro();
    return { done: true, savedId };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function attachDraftRecordMatchAction(
  _previousState: DraftRecordActionState,
  formData: FormData,
): Promise<DraftRecordActionState> {
  const user = await currentMember();
  if (!user) return { error: SESSION_ERROR_MESSAGE };

  const recordId = positiveId(formData, 'recordId');
  const provider = textValue(formData, 'matchProvider');
  const matchId = textValue(formData, 'matchId');
  if (!recordId || !provider || !matchId) return { error: 'Elegí una partida del historial.' };

  try {
    attachDraftRecordMatch(getDb(), recordId, provider, matchId, new Date());
    refreshRegistro();
    return { done: true };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function deleteDraftRecordAction(
  _previousState: DraftRecordActionState,
  formData: FormData,
): Promise<DraftRecordActionState> {
  const user = await currentMember();
  if (!user) return { error: SESSION_ERROR_MESSAGE };

  const recordId = positiveId(formData, 'recordId');
  if (!recordId) return { error: 'Registro inválido.' };
  try {
    deleteDraftRecord(getDb(), user.id, recordId);
    refreshRegistro();
    return { done: true };
  } catch (error) {
    return { error: message(error) };
  }
}
