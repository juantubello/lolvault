import { describe, expect, it } from 'vitest';

import { validateProposal, type ProposalValues } from '@/features/vaults/proposal-form';
import { startOfLocalDay, toLocalDateString } from '@/features/vaults/vault-dates';

// 14/09/2026 22:00 en Argentina = 15/09 01:00 UTC: "hoy" tiene que seguir siendo el 14.
const now = new Date('2026-09-15T01:00:00Z');
const context = { now, memberIds: new Set([1, 2, 3]), championIds: new Set(['Ahri', 'Yasuo']) };

function values(overrides: Partial<ProposalValues> = {}): ProposalValues {
  return {
    targetUserId: '2',
    championId: 'Yasuo',
    startDate: '2026-09-14',
    endDate: '2026-09-20',
    reason: '0/11/2 y culpó al jungla',
    ...overrides,
  };
}

describe('validateProposal', () => {
  it('acepta una propuesta válida con "hasta" inclusivo', () => {
    const result = validateProposal(values(), context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.input.startsAt).toEqual(startOfLocalDay('2026-09-14'));
    expect(result.input.endsAt).toEqual(startOfLocalDay('2026-09-21'));
    expect(result.input.targetUserId).toBe(2);
  });

  it('usa la fecha argentina para "hoy"', () => {
    expect(toLocalDateString(now)).toBe('2026-09-14');
  });

  it('permite proponerse a uno mismo si es miembro', () => {
    expect(validateProposal(values({ targetUserId: '1' }), context).ok).toBe(true);
  });

  it('rechaza fechas en el pasado, invertidas o de más de 30 días', () => {
    const past = validateProposal(values({ startDate: '2026-09-13' }), context);
    const inverted = validateProposal(values({ endDate: '2026-09-10' }), context);
    const tooLong = validateProposal(values({ endDate: '2026-10-14' }), context);

    expect(!past.ok && past.fieldErrors.startDate).toBeTruthy();
    expect(!inverted.ok && inverted.fieldErrors.endDate).toBeTruthy();
    expect(!tooLong.ok && tooLong.fieldErrors.endDate).toBeTruthy();
  });

  it('rechaza fechas que no existen', () => {
    const result = validateProposal(values({ endDate: '2026-02-30' }), context);
    expect(!result.ok && result.fieldErrors.endDate).toBeTruthy();
  });

  it('exige jugador del grupo, campeón existente y motivo', () => {
    const result = validateProposal(
      values({ targetUserId: '99', championId: 'Inventado', reason: '' }),
      context,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.fieldErrors).sort()).toEqual(['championId', 'reason', 'targetUserId']);
  });
});
