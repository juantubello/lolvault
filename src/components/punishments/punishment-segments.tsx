import Link from 'next/link';

import type { PunishmentType } from '@/features/punishments/routes';

const segments: { value: PunishmentType; label: string }[] = [
  { value: 'vaults', label: 'Vaults' },
  { value: 'black-list', label: 'Black list' },
];

export function PunishmentSegments({ selected }: { selected: PunishmentType }) {
  return (
    <nav aria-label="Tipo de castigo" className="segmented punishments-segmented">
      {segments.map((segment) => (
        <Link
          aria-current={selected === segment.value ? 'true' : undefined}
          className="segmented-item"
          href={`/castigos?tipo=${segment.value}`}
          key={segment.value}
        >
          {segment.label}
        </Link>
      ))}
    </nav>
  );
}
