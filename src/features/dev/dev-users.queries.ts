import { asc } from 'drizzle-orm';

import type { Db } from '@/db/client';
import { users } from '@/db/schema';

/** Solo para el selector de usuario de dev: lista pública de quiénes existen, sin datos privados. */
export function listDevUsers(db: Db) {
  return db
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users)
    .orderBy(asc(users.createdAt))
    .all();
}
