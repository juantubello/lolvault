import { FlaskConical } from 'lucide-react';

import { getCurrentUser } from '@/auth/current-user';
import { isDevBypassEnabled } from '@/auth/dev-identity';
import { getDb } from '@/db/client';
import { switchDevUserAction } from '@/features/dev/dev-user.actions';
import { listDevUsers } from '@/features/dev/dev-users.queries';

/** Pastilla "Dev" para cambiar de usuario y probar votaciones de varias personas. No existe en producción. */
export async function DevUserSwitcher() {
  if (!isDevBypassEnabled()) return null;

  const currentUser = await getCurrentUser();
  const devUsers = listDevUsers(getDb());
  const defaultEmail = process.env.LOLVAULT_DEV_USER_EMAIL?.trim();

  return (
    <details className="dev-switcher">
      <summary>
        <FlaskConical aria-hidden="true" size={16} strokeWidth={2} />
        <span>Dev · {currentUser?.displayName ?? currentUser?.email ?? 'sin usuario'}</span>
      </summary>

      <div className="dev-switcher-panel">
        <p className="dev-switcher-title">Entrar como</p>
        <ul>
          {devUsers.map((user) => (
            <li key={user.id}>
              <form action={switchDevUserAction}>
                <input name="email" type="hidden" value={user.email} />
                <button
                  aria-current={user.id === currentUser?.id ? 'true' : undefined}
                  type="submit"
                >
                  <span>{user.displayName ?? 'Sin onboarding'}</span>
                  <small>{user.email}</small>
                </button>
              </form>
            </li>
          ))}
        </ul>

        <form action={switchDevUserAction} className="dev-switcher-new">
          <label htmlFor="dev-email">Email nuevo</label>
          <div>
            <input
              autoCapitalize="none"
              autoCorrect="off"
              id="dev-email"
              name="email"
              placeholder="amigo2@dev.local"
              required
              spellCheck={false}
              type="email"
            />
            <button type="submit">Entrar</button>
          </div>
        </form>

        {defaultEmail ? (
          <form action={switchDevUserAction}>
            <input name="email" type="hidden" value="" />
            <button className="dev-switcher-reset" type="submit">
              Volver a {defaultEmail}
            </button>
          </form>
        ) : null}
      </div>
    </details>
  );
}
