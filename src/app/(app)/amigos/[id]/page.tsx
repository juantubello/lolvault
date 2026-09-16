import { LockKeyhole } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';

import { getCurrentUser } from '@/auth/current-user';
import { PlayerStatsLoading, PlayerStatsSection } from '@/components/matches/player-stats-section';
import { Screen } from '@/components/screen';
import { UserAvatar } from '@/components/user-avatar';
import { getDb } from '@/db/client';
import { getFriendProfile } from '@/features/friends/friends.queries';

export const dynamic = 'force-dynamic';

export default async function FriendPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user?.displayName) redirect('/onboarding');

  const friendId = Number((await params).id);
  if (friendId === user.id) redirect('/perfil');

  const friend = Number.isInteger(friendId) ? getFriendProfile(getDb(), friendId) : null;
  if (!friend) notFound();

  return (
    <Screen back={{ href: '/amigos', label: 'Amigos' }} title={friend.displayName}>
      <section aria-label="Perfil" className="profile-hero">
        <UserAvatar id={friend.id} name={friend.displayName} size="md" src={friend.avatarUrl} />
        <div>
          <h2>{friend.displayName}</h2>
          <p>
            {friend.riotGameName && friend.riotTagLine
              ? `${friend.riotGameName}#${friend.riotTagLine}`
              : 'Sin Riot ID'}
          </p>
        </div>
      </section>

      <section aria-label="Vaults" className="grouped-section">
        <div className="grouped-list">
          <Link className="profile-row profile-row-link" href={`/ripeados?tipo=vaults&jugador=${friend.id}&estado=todos`}>
            <LockKeyhole aria-hidden="true" size={20} strokeWidth={2} />
            <div>
              <span>Ver sus vaults</span>
            </div>
            <span aria-hidden="true" />
          </Link>
        </div>
      </section>

      <Suspense fallback={<PlayerStatsLoading />}>
        <PlayerStatsSection isSelf={false} user={friend} />
      </Suspense>
    </Screen>
  );
}
