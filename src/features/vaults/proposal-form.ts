/** Validación de "Proponer vault": jugador, campeón, desde/hasta y motivo. */
import { VAULT_MAX_DAYS, VAULT_MAX_START_AHEAD_DAYS, VAULT_REASON_MAX_LENGTH } from '@/config';

import { addDays, daysBetween, startOfLocalDay, toLocalDateString } from './vault-dates';

export type ProposalValues = {
  targetUserId: string;
  championId: string;
  startDate: string;
  endDate: string;
  reason: string;
  /** Partida decisiva adjunta (opcional). Se valida en la acción contra el historial del jugador. */
  matchId: string;
};

export type ProposalFieldErrors = Partial<Record<keyof ProposalValues, string>>;

export type ProposalFormState = {
  fieldErrors?: ProposalFieldErrors;
  formError?: string;
  /** Lo que eligió el usuario, para no perderlo si falla la validación. */
  values?: ProposalValues;
  /** Id de la propuesta creada: el sheet se cierra al recibirlo. */
  createdId?: number;
};

export type ProposalInput = {
  targetUserId: number;
  championId: string;
  startsAt: Date;
  /** Exclusivo: 00:00 del día siguiente a "hasta". */
  endsAt: Date;
  reason: string;
};

export type ProposalContext = {
  now: Date;
  memberIds: ReadonlySet<number>;
  championIds: ReadonlySet<string>;
};

function formString(formData: FormData, key: keyof ProposalValues): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export function readProposalValues(formData: FormData): ProposalValues {
  return {
    targetUserId: formString(formData, 'targetUserId'),
    championId: formString(formData, 'championId'),
    startDate: formString(formData, 'startDate'),
    endDate: formString(formData, 'endDate'),
    reason: formString(formData, 'reason'),
    matchId: formString(formData, 'matchId'),
  };
}

export function validateProposal(
  values: ProposalValues,
  { now, memberIds, championIds }: ProposalContext,
): { ok: true; input: ProposalInput } | { ok: false; fieldErrors: ProposalFieldErrors } {
  const fieldErrors: ProposalFieldErrors = {};

  const targetUserId = Number(values.targetUserId);
  if (!Number.isInteger(targetUserId) || !memberIds.has(targetUserId)) {
    fieldErrors.targetUserId = 'Elegí a quién le va el vault.';
  }

  if (!championIds.has(values.championId)) {
    fieldErrors.championId = 'Elegí un campeón.';
  }

  const today = startOfLocalDay(toLocalDateString(now));
  const startsAt = startOfLocalDay(values.startDate);
  const lastDay = startOfLocalDay(values.endDate);

  if (!startsAt || !today) {
    fieldErrors.startDate = 'Elegí desde cuándo.';
  } else if (startsAt < today) {
    fieldErrors.startDate = 'No puede empezar en el pasado.';
  } else if (startsAt > addDays(today, VAULT_MAX_START_AHEAD_DAYS)) {
    fieldErrors.startDate = `Puede empezar como máximo dentro de ${VAULT_MAX_START_AHEAD_DAYS} días.`;
  }

  if (!lastDay) {
    fieldErrors.endDate = 'Elegí hasta cuándo.';
  } else if (startsAt && lastDay < startsAt) {
    fieldErrors.endDate = '"Hasta" no puede ser antes de "desde".';
  } else if (startsAt && daysBetween(startsAt, addDays(lastDay, 1)) > VAULT_MAX_DAYS) {
    fieldErrors.endDate = `Un vault dura como máximo ${VAULT_MAX_DAYS} días.`;
  }

  if (!values.reason) {
    fieldErrors.reason = 'Contá por qué se lo merece.';
  } else if (values.reason.length > VAULT_REASON_MAX_LENGTH) {
    fieldErrors.reason = `El motivo puede tener hasta ${VAULT_REASON_MAX_LENGTH} caracteres.`;
  }

  if (Object.keys(fieldErrors).length > 0 || !startsAt || !lastDay) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    input: {
      targetUserId,
      championId: values.championId,
      startsAt,
      endsAt: addDays(lastDay, 1),
      reason: values.reason,
    },
  };
}
