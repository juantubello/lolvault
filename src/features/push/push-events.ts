import type { NotificationCategory } from './notification-preferences';
import type { PushPayload } from './push-sender';

/** 'system' (p. ej. la prueba) no se filtra por preferencias. */
export type PushDeliveryCategory = NotificationCategory | 'system';

export type PushDelivery = { category: PushDeliveryCategory; userIds: number[]; payload: PushPayload };

function recipients(memberIds: readonly number[], excluded: readonly number[]): number[] {
  const excludedSet = new Set(excluded);
  return [...new Set(memberIds)].filter((id) => !excludedSet.has(id));
}

export function vaultProposalCreatedEvent(input: {
  proposalId: number;
  kind: 'vault' | 'lift';
  memberIds: readonly number[];
  targetUserId: number;
  proposerUserId: number;
  proposerName: string;
  targetName: string;
  championName: string;
}): PushDelivery[] {
  const userIds = recipients(input.memberIds, [input.targetUserId, input.proposerUserId]);
  if (userIds.length === 0) return [];
  return [
    {
      category: 'vaults',
      userIds,
      payload: {
        title: input.kind === 'vault' ? 'Nueva votación de vault' : 'Piden levantar un vault',
        body:
          input.kind === 'vault'
            ? `${input.proposerName} propone vaultear ${input.championName} a ${input.targetName}`
            : `${input.proposerName} pide levantar ${input.championName} de ${input.targetName}`,
        url: '/',
        tag: `vault-vote-${input.proposalId}`,
      },
    },
  ];
}

export function vaultApprovedEvent(input: {
  proposalId: number;
  kind: 'vault' | 'lift';
  targetUserId: number;
  targetName: string;
  proposerUserId: number;
  championName: string;
  lastDayLabel: string | null;
}): PushDelivery[] {
  const tag = `vault-vote-${input.proposalId}`;
  if (input.kind === 'lift') {
    return [
      {
        category: 'vaults',
        userIds: [input.targetUserId],
        payload: {
          title: `Se levantó tu vault de ${input.championName}`,
          body: 'Ya podés volver a jugarlo.',
          url: `/ripeados?tipo=vaults&jugador=${input.targetUserId}`,
          tag,
        },
      },
    ];
  }

  const deliveries: PushDelivery[] = [
    {
      category: 'vaults',
      userIds: [input.targetUserId],
      payload: {
        title: `Te vaultearon ${input.championName}`,
        body: input.lastDayLabel ? `Hasta ${input.lastDayLabel}` : 'El vault fue aprobado.',
        url: `/ripeados?tipo=vaults&jugador=${input.targetUserId}`,
        tag,
      },
    },
  ];
  if (input.proposerUserId !== input.targetUserId) {
    deliveries.push({
      category: 'vaults',
      userIds: [input.proposerUserId],
      payload: {
        title: 'Vault aprobado',
        body: `Se aprobó vaultear ${input.championName} a ${input.targetName}`,
        url: `/ripeados?tipo=vaults&jugador=${input.targetUserId}`,
        tag,
      },
    });
  }
  return deliveries;
}

export function blacklistProposalCreatedEvent(input: {
  proposalId: number;
  kind: 'add' | 'remove';
  memberIds: readonly number[];
  proposerUserId: number;
  proposerName: string;
  playerName: string;
}): PushDelivery[] {
  const userIds = recipients(input.memberIds, [input.proposerUserId]);
  if (userIds.length === 0) return [];
  return [
    {
      category: 'blacklist',
      userIds,
      payload: {
        title: 'Black list',
        body:
          input.kind === 'add'
            ? `${input.proposerName} quiere agregar a ${input.playerName}`
            : `${input.proposerName} quiere sacar a ${input.playerName}`,
        url: '/',
        tag: `blacklist-vote-${input.proposalId}`,
      },
    },
  ];
}

export function blacklistApprovedEvent(input: {
  proposalId: number;
  kind: 'add' | 'remove';
  proposerUserId: number;
  playerName: string;
}): PushDelivery[] {
  return [
    {
      category: 'blacklist',
      userIds: [input.proposerUserId],
      payload: {
        title: input.kind === 'add' ? 'Black list aprobada' : 'Black list actualizada',
        body:
          input.kind === 'add'
            ? `${input.playerName} entró a la black list.`
            : `${input.playerName} salió de la black list.`,
        url: '/ripeados?tipo=black-list',
        tag: `blacklist-vote-${input.proposalId}`,
      },
    },
  ];
}

export function customNotificationEvent(input: {
  notificationId: number;
  memberIds: readonly number[];
  senderUserId: number;
  senderName: string;
  message: string;
}): PushDelivery[] {
  const userIds = recipients(input.memberIds, [input.senderUserId]);
  if (userIds.length === 0) return [];
  return [
    {
      category: 'custom',
      userIds,
      payload: {
        title: `${input.senderName} avisa`,
        body: input.message,
        url: '/',
        tag: `custom-${input.notificationId}`,
      },
    },
  ];
}
