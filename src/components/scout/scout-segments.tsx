import Link from 'next/link';

import { scoutHref, type ScoutSearchParams, type ScoutType } from '@/features/scout/routes';

const SEGMENTS: { value: ScoutType; label: string }[] = [
  { value: 'jugador', label: 'Jugador' },
  { value: 'draft', label: 'Draft' },
];

export function ScoutSegments({
  selected,
  searchParams,
}: {
  selected: ScoutType;
  searchParams: ScoutSearchParams;
}) {
  return (
    <nav aria-label="Herramienta de Scout" className="segmented scout-segmented">
      {SEGMENTS.map((segment) => (
        <Link
          aria-current={selected === segment.value ? 'true' : undefined}
          className="segmented-item"
          href={scoutHref(segment.value, searchParams)}
          key={segment.value}
        >
          {segment.label}
        </Link>
      ))}
    </nav>
  );
}
