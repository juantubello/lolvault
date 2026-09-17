'use client';

import { TrendingDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

export type DraftPlayerSelectOption = {
  id: number;
  name: string;
  href: string;
};

export function DraftPlayerSelect({
  currentUserId,
  emptyHref,
  options,
  roleLabel,
  belowAverage,
}: {
  currentUserId: number | null;
  emptyHref: string;
  options: readonly DraftPlayerSelectOption[];
  roleLabel: string;
  belowAverage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(currentUserId === null ? '' : String(currentUserId));

  useEffect(() => {
    setSelected(currentUserId === null ? '' : String(currentUserId));
  }, [currentUserId]);

  return (
    <label className="draft-player-field" data-warning={belowAverage || undefined}>
      <span className="sr-only">Quién juega {roleLabel}</span>
      <select
        aria-busy={pending || undefined}
        disabled={pending}
        onChange={(event) => {
          const value = event.currentTarget.value;
          setSelected(value);
          const href = value ? options.find((option) => String(option.id) === value)?.href : emptyHref;
          if (href) startTransition(() => router.push(href, { scroll: false }));
        }}
        value={selected}
      >
        <option value="">Asignar jugador</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>{option.name}</option>
        ))}
      </select>
      {belowAverage ? (
        <span className="draft-player-warning">
          <TrendingDown aria-hidden="true" size={14} strokeWidth={2} />
          Le viene yendo mal
        </span>
      ) : null}
    </label>
  );
}
