import { describe, expect, it } from 'vitest';

import {
  closesAtFor,
  isVaultInForce,
  vaultStartsAt,
  vaultStatus,
  votingStatus,
  voteOutcome,
  type VaultTimeline,
} from '@/features/vaults/vault-rules';

const H = 60 * 60 * 1000;
const t0 = new Date('2026-09-20T03:00:00Z'); // 00:00 del 20/09 en Argentina

function vault(overrides: Partial<VaultTimeline> = {}): VaultTimeline {
  return {
    startsAt: t0,
    endsAt: new Date(t0.getTime() + 72 * H),
    closesAt: new Date(t0.getTime() + 48 * H),
    approvedAt: null,
    rejectedAt: null,
    cancelledAt: null,
    liftedAt: null,
    ...overrides,
  };
}

describe('voteOutcome', () => {
  it('aprueba con 3 votos a favor', () => {
    expect(voteOutcome({ yes: 3, no: 2, eligibleVoters: 5 })).toBe('approved');
  });

  it('sigue abierta si todavía puede llegar a 3', () => {
    expect(voteOutcome({ yes: 2, no: 1, eligibleVoters: 5 })).toBe('open');
  });

  it('rechaza cuando ni con todos los que faltan llega a 3', () => {
    expect(voteOutcome({ yes: 1, no: 3, eligibleVoters: 5 })).toBe('rejected');
  });
});

describe('votingStatus', () => {
  it('abierta dentro de la ventana y vencida después', () => {
    expect(votingStatus(vault(), new Date(t0.getTime() + 47 * H))).toBe('open');
    expect(votingStatus(vault(), new Date(t0.getTime() + 48 * H))).toBe('expired');
  });

  it('cancelada y rechazada ganan sobre el resto', () => {
    expect(votingStatus(vault({ cancelledAt: t0, approvedAt: t0 }), t0)).toBe('cancelled');
    expect(votingStatus(vault({ rejectedAt: t0 }), t0)).toBe('rejected');
  });
});

describe('vaultStatus', () => {
  it('aprobado antes de "desde": programado y después activo', () => {
    const approved = vault({ approvedAt: new Date(t0.getTime() - 5 * H) });
    expect(vaultStatus(approved, new Date(t0.getTime() - 1 * H))).toBe('scheduled');
    expect(vaultStatus(approved, new Date(t0.getTime() + 1 * H))).toBe('active');
  });

  it('aprobado después de "desde": arranca al aprobarse y termina en "hasta"', () => {
    const approvedAt = new Date(t0.getTime() + 10 * H);
    const approved = vault({ approvedAt });
    expect(vaultStartsAt(approved)).toEqual(approvedAt);
    expect(vaultStatus(approved, new Date(t0.getTime() + 20 * H))).toBe('active');
    expect(vaultStatus(approved, new Date(t0.getTime() + 72 * H))).toBe('served');
  });

  it('levantado por votación deja de estar vigente', () => {
    const lifted = vault({ approvedAt: t0, liftedAt: new Date(t0.getTime() + 5 * H) });
    const status = vaultStatus(lifted, new Date(t0.getTime() + 6 * H));
    expect(status).toBe('lifted');
    expect(isVaultInForce(status)).toBe(false);
  });

  it('solo programado o activo se puede pedir levantar', () => {
    expect(isVaultInForce('scheduled')).toBe(true);
    expect(isVaultInForce('active')).toBe(true);
    expect(isVaultInForce('open')).toBe(false);
    expect(isVaultInForce('served')).toBe(false);
  });
});

describe('closesAtFor', () => {
  it('cierra a las 48 h o cuando terminaría el vault, lo que pase primero', () => {
    expect(closesAtFor(t0, new Date(t0.getTime() + 72 * H))).toEqual(new Date(t0.getTime() + 48 * H));
    expect(closesAtFor(t0, new Date(t0.getTime() + 24 * H))).toEqual(new Date(t0.getTime() + 24 * H));
  });
});
