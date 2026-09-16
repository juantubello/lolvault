import { redirect } from 'next/navigation';

import { punishmentHref, type RouteSearchParams } from '@/features/punishments/routes';

export default async function LegacyVaultsPage({
  searchParams,
}: {
  searchParams: Promise<RouteSearchParams>;
}) {
  redirect(punishmentHref('vaults', await searchParams));
}
