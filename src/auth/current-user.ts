import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';

import { getDb, type Db } from '@/db/client';
import { users, type User } from '@/db/schema';

import { ACCESS_JWT_HEADER, readAccessJwtConfig, verifyAccessJwt } from './access-jwt';
import { DEV_USER_COOKIE, getDevIdentity } from './dev-identity';
import type { Identity } from './identity';

/** Resuelve la identidad sin consultar la base, para mantenerla testeable. */
export async function resolveIdentity(
  token: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
  devUserEmail?: string | null,
): Promise<Identity | null> {
  const config = readAccessJwtConfig(env);

  if (token && config) {
    const identity = await verifyAccessJwt(token, config);
    if (identity) return identity;
  }

  return getDevIdentity(env, devUserEmail);
}

/** Find-or-create de una identidad previamente verificada. */
export function findOrCreateUser(db: Db, identity: Identity): User {
  const byIdentity = db
    .select()
    .from(users)
    .where(eq(users.externalIdentity, identity.externalIdentity))
    .get();

  if (byIdentity) {
    if (byIdentity.email === identity.email) return byIdentity;

    return db
      .update(users)
      .set({ email: identity.email })
      .where(eq(users.id, byIdentity.id))
      .returning()
      .get();
  }

  // Si cambia el proveedor de Access, el sub puede cambiar. Re-vincular por
  // email conserva el historial sin codificar una allowlist dentro de la app.
  const byEmail = db.select().from(users).where(eq(users.email, identity.email)).get();
  if (byEmail) {
    console.warn(
      `[auth] Re-vinculando usuario ${byEmail.id} a una nueva identidad de Access.`,
    );
    return db
      .update(users)
      .set({ externalIdentity: identity.externalIdentity })
      .where(eq(users.id, byEmail.id))
      .returning()
      .get();
  }

  return db
    .insert(users)
    .values({
      externalIdentity: identity.externalIdentity,
      email: identity.email,
      displayName: null,
      createdAt: new Date(),
    })
    .returning()
    .get();
}

/** Usuario de la request actual; React lo resuelve una vez por request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const [headerList, cookieStore] = await Promise.all([headers(), cookies()]);
  const identity = await resolveIdentity(
    headerList.get(ACCESS_JWT_HEADER),
    process.env,
    cookieStore.get(DEV_USER_COOKIE)?.value,
  );
  if (!identity) return null;

  return findOrCreateUser(getDb(), identity);
});
