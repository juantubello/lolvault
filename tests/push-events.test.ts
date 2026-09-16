import { describe, expect, it } from 'vitest';

import {
  blacklistApprovedEvent,
  blacklistProposalCreatedEvent,
  vaultApprovedEvent,
  vaultProposalCreatedEvent,
} from '@/features/push/push-events';

const members = [1, 2, 3, 4, 4];

describe('eventos push', () => {
  it('una propuesta de vault avisa solo a quienes pueden votar y no al proposer', () => {
    const deliveries = vaultProposalCreatedEvent({
      proposalId: 10,
      kind: 'vault',
      memberIds: members,
      targetUserId: 1,
      proposerUserId: 2,
      proposerName: 'Bruno',
      targetName: 'Alicia',
      championName: 'Ahri',
    });
    expect(deliveries[0]?.userIds).toEqual([3, 4]);
    expect(deliveries[0]?.payload).toMatchObject({
      title: 'Nueva votación de vault',
      body: 'Bruno propone vaultear Ahri a Alicia',
      url: '/',
    });
  });

  it('un pedido de lift usa los mismos votantes elegibles', () => {
    const delivery = vaultProposalCreatedEvent({
      proposalId: 11,
      kind: 'lift',
      memberIds: members,
      targetUserId: 1,
      proposerUserId: 3,
      proposerName: 'Carla',
      targetName: 'Alicia',
      championName: 'Ahri',
    })[0];
    expect(delivery?.userIds).toEqual([2, 4]);
    expect(delivery?.payload.title).toBe('Piden levantar un vault');
  });

  it('un vault aprobado avisa al target y al proposer si son distintos', () => {
    const deliveries = vaultApprovedEvent({
      proposalId: 10,
      kind: 'vault',
      targetUserId: 1,
      targetName: 'Alicia',
      proposerUserId: 2,
      championName: 'Ahri',
      lastDayLabel: '20 sep',
    });
    expect(deliveries.map(({ userIds }) => userIds)).toEqual([[1], [2]]);
    expect(deliveries[0]?.payload).toMatchObject({
      title: 'Te vaultearon Ahri',
      body: 'Hasta 20 sep',
      url: '/ripeados?tipo=vaults&jugador=1',
    });

    const selfVault = vaultApprovedEvent({
      proposalId: 12,
      kind: 'vault',
      targetUserId: 1,
      targetName: 'Alicia',
      proposerUserId: 1,
      championName: 'Lux',
      lastDayLabel: '21 sep',
    });
    expect(selfVault.map(({ userIds }) => userIds)).toEqual([[1]]);
  });

  it('un lift aprobado avisa solamente al vaulteado', () => {
    const deliveries = vaultApprovedEvent({
      proposalId: 13,
      kind: 'lift',
      targetUserId: 1,
      targetName: 'Alicia',
      proposerUserId: 2,
      championName: 'Yasuo',
      lastDayLabel: null,
    });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      userIds: [1],
      payload: { title: 'Se levantó tu vault de Yasuo' },
    });
  });

  it.each(['add', 'remove'] as const)(
    'una propuesta de black list %s avisa a todos menos al proposer',
    (kind) => {
      const delivery = blacklistProposalCreatedEvent({
        proposalId: 20,
        kind,
        memberIds: members,
        proposerUserId: 2,
        proposerName: 'Bruno',
        playerName: 'Rival',
      })[0];
      expect(delivery?.userIds).toEqual([1, 3, 4]);
      expect(delivery?.payload.body).toContain(kind === 'add' ? 'agregar' : 'sacar');
    },
  );

  it.each(['add', 'remove'] as const)(
    'una aprobación de black list %s avisa solo al proposer',
    (kind) => {
      const delivery = blacklistApprovedEvent({
        proposalId: 21,
        kind,
        proposerUserId: 3,
        playerName: 'Rival',
      });
      expect(delivery.map(({ userIds }) => userIds)).toEqual([[3]]);
      expect(delivery[0]?.payload.url).toBe('/ripeados?tipo=black-list');
    },
  );
});
