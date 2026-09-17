import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/auth/current-user';
import { DraftSegment } from '@/components/scout/draft-segment';
import { DraftRecordSegment } from '@/components/scout/draft-record-segment';
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
  if (type === 'jugador') return <ScoutPlayerSegment searchParams={query} user={member} />;
  if (type === 'draft') return <DraftSegment searchParams={query} />;
  return <DraftRecordSegment searchParams={query} viewerUserId={member.id} />;
}
