import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/auth/current-user';
import { DraftSegment } from '@/components/scout/draft-segment';
import { ScoutPlayerSegment } from '@/components/scout/player-segment';
import { parseScoutType, scoutHref, type ScoutSearchParams } from '@/features/scout/routes';

export const dynamic = 'force-dynamic';

export default async function ScoutPage({
  searchParams,
}: {
  searchParams: Promise<ScoutSearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user?.displayName) redirect('/onboarding');

  const query = await searchParams;
  const type = parseScoutType(query.tipo);
  if (!type) redirect(scoutHref('jugador', query));

  const member = { ...user, displayName: user.displayName };
  return type === 'jugador'
    ? <ScoutPlayerSegment searchParams={query} user={member} />
    : <DraftSegment searchParams={query} />;
}
