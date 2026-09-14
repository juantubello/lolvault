import type { User } from '@/db/schema';

import { getCurrentUser } from './current-user';

export class UnauthorizedError extends Error {
  readonly status = 401;

  constructor(message = 'No autenticado') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export function unauthorizedResponse(): Response {
  return Response.json({ error: 'unauthorized' }, { status: 401 });
}

export async function requireCurrentUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
