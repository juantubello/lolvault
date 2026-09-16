import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/auth/current-user';
import { BlacklistSegment } from '@/components/punishments/blacklist-segment';
import { VaultsSegment } from '@/components/punishments/vaults-segment';
import {
  parsePunishmentType,
  punishmentHref,
  type RouteSearchParams,
} from '@/features/punishments/routes';

export const dynamic = 'force-dynamic';

export default async function PunishmentsPage({
  searchParams,
}: {
  searchParams: Promise<RouteSearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user?.displayName) redirect('/onboarding');

  const query = await searchParams;
  const type = parsePunishmentType(query.tipo);
  if (!type) redirect(punishmentHref('vaults', query));

  const member = { ...user, displayName: user.displayName };
  return type === 'vaults'
    ? <VaultsSegment searchParams={query} user={member} />
    : <BlacklistSegment searchParams={query} user={member} />;
}
