import { and, eq, isNotNull } from 'drizzle-orm';

import type { Db } from '@/db/client';
import { users } from '@/db/schema';
import { avatarUrl } from '@/features/profile/avatar-url';

export type FriendProfile = {
  id: number;
  displayName: string;
  avatarUrl: string | null;
  riotGameName: string | null;
  riotTagLine: string | null;
};

/** Perfil público de un miembro del grupo (sin email). Null si no existe o no completó el perfil. */
export function getFriendProfile(db: Db, userId: number): FriendProfile | null {
  const row = db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUpdatedAt: users.avatarUpdatedAt,
      riotGameName: users.riotGameName,
      riotTagLine: users.riotTagLine,
    })
    .from(users)
    .where(and(eq(users.id, userId), isNotNull(users.displayName)))
    .get();

  if (!row?.displayName) return null;
  return {
    id: row.id,
    displayName: row.displayName,
    avatarUrl: avatarUrl(row),
    riotGameName: row.riotGameName,
    riotTagLine: row.riotTagLine,
  };
}

export function listFriendProfiles(db: Db): FriendProfile[] {
  return db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUpdatedAt: users.avatarUpdatedAt,
      riotGameName: users.riotGameName,
      riotTagLine: users.riotTagLine,
    })
    .from(users)
    .where(isNotNull(users.displayName))
    .all()
    .map((row) => ({
      id: row.id,
      displayName: row.displayName ?? '',
      avatarUrl: avatarUrl(row),
      riotGameName: row.riotGameName,
      riotTagLine: row.riotTagLine,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
}
