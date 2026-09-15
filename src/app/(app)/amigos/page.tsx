import { ChevronRight, Users } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/auth/current-user';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { UserAvatar } from '@/components/user-avatar';
import { getDb } from '@/db/client';
import { listFriendProfiles } from '@/features/friends/friends.queries';
import { countByPlayer } from '@/features/vaults/vault-filters';
import { listVaults } from '@/features/vaults/vaults.queries';

export const dynamic = 'force-dynamic';

export default async function FriendsPage() {
  const user = await getCurrentUser();
  if (!user?.displayName) redirect('/onboarding');

  const db = getDb();
  const friends = listFriendProfiles(db);
  const inForceByPlayer = countByPlayer(listVaults(db, new Date()).inForce);

  return (
    <Screen title="Amigos">
      {friends.length <= 1 ? (
        <EmptyState
          description="Cuando tus amigos entren a LolVault y completen su perfil, aparecen acá."
          icon={Users}
          title="Por ahora estás solo"
        />
      ) : null}

      <ul className="stats-list friend-list">
        {friends.map((friend) => {
          const vaults = inForceByPlayer.get(friend.id) ?? 0;
          return (
            <li key={friend.id}>
              <Link className="friend-row" href={friend.id === user.id ? '/perfil' : `/amigos/${friend.id}`}>
                <UserAvatar id={friend.id} name={friend.displayName} size="nav" src={friend.avatarUrl} />
                <span className="friend-text">
                  <span className="stat-row-title">
                    {friend.displayName}
                    {friend.id === user.id ? ' (vos)' : ''}
                  </span>
                  <span className="stat-row-meta">
                    {friend.riotGameName && friend.riotTagLine
                      ? `${friend.riotGameName}#${friend.riotTagLine}`
                      : 'Sin Riot ID'}
                  </span>
                </span>
                {vaults ? (
                  <span className="status-badge" data-tone="vault">
                    {vaults} {vaults === 1 ? 'vault' : 'vaults'}
                  </span>
                ) : (
                  <span />
                )}
                <ChevronRight aria-hidden="true" className="friend-chevron" size={16} strokeWidth={2} />
              </Link>
            </li>
          );
        })}
      </ul>
    </Screen>
  );
}
