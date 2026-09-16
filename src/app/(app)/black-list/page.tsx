import { redirect } from 'next/navigation';

import { punishmentHref, type RouteSearchParams } from '@/features/punishments/routes';

export default async function LegacyBlacklistPage({
  searchParams,
}: {
  searchParams: Promise<RouteSearchParams>;
}) {
  redirect(punishmentHref('black-list', await searchParams));
}
