import { eq } from 'drizzle-orm';

import type { Db } from '@/db/client';
import { users } from '@/db/schema';

export type OnboardingProfile = {
  displayName: string;
  riotGameName: string | null;
  riotTagLine: string | null;
};

/** La identidad se resuelve antes: esta query siempre recibe el id autenticado. */
export function saveOnboardingProfile(
  db: Db,
  userId: number,
  profile: OnboardingProfile,
): void {
  db.update(users)
    .set(profile)
    .where(eq(users.id, userId))
    .run();
}
