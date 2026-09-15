import { eq } from 'drizzle-orm';

import type { Db } from '@/db/client';
import { playerMatches, playerStatsSync, users } from '@/db/schema';

import type { ProfileInput } from './profile-form';

/** Los Riot ID no distinguen mayúsculas: "tester#las" y "Tester#LAS" son la misma cuenta. */
function riotKey(gameName: string | null, tagLine: string | null): string | null {
  return gameName && tagLine ? `${gameName}#${tagLine}`.toLocaleLowerCase('en-US') : null;
}

/** Marca (o limpia con null) la foto de perfil del usuario autenticado. */
export function setAvatarUpdatedAt(db: Db, userId: number, updatedAt: Date | null): void {
  db.update(users).set({ avatarUpdatedAt: updatedAt }).where(eq(users.id, userId)).run();
}

/** La identidad se resuelve antes: esta query siempre recibe el id autenticado. */
export function saveProfile(db: Db, userId: number, profile: ProfileInput): void {
  const current = db
    .select({ riotGameName: users.riotGameName, riotTagLine: users.riotTagLine })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  // Con un Riot ID distinto no sabemos si es la misma cuenta renombrada u otra: se
  // descarta el PUUID y se vuelve a resolver con account-v1 (si es la misma cuenta,
  // Riot devuelve el mismo). Vaults y votos apuntan a users.id, así que no se pierden.
  const riotChanged =
    riotKey(current?.riotGameName ?? null, current?.riotTagLine ?? null) !==
    riotKey(profile.riotGameName, profile.riotTagLine);

  db.transaction((tx) => {
    tx.update(users)
      .set(riotChanged ? { ...profile, riotPuuid: null } : profile)
      .where(eq(users.id, userId))
      .run();
    if (riotChanged) {
      // El historial y el perfil cacheados eran de la cuenta anterior: si el Riot ID nuevo está mal
      // escrito, no tienen que seguir mostrándose (ni poder adjuntarse) bajo el ID nuevo. Las fotos
      // de partidas ya adjuntas viven en cada propuesta y no se tocan.
      tx.delete(playerMatches).where(eq(playerMatches.userId, userId)).run();
      tx.delete(playerStatsSync).where(eq(playerStatsSync.userId, userId)).run();
    }
  });
}
