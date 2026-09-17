'use client';

import { Search, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import { searchKey } from '@/features/champions/search-key';
import type { DraftChampionGridKind } from '@/features/draft/suggestion-grid';

export type DraftChampionGridViewItem = {
  key: number;
  name: string;
  imageUrl: string;
  searchKey: string;
  href: string;
  kind: DraftChampionGridKind;
  winrateLabel: string | null;
  matchupLabel: string | null;
  synergyLabel: string | null;
};

export function DraftChampionGrid({
  champions,
  slotLabel,
  /** De quién es el win rate que ordena la lista: el número cambia de dueño según el casillero. */
  side,
  occupant,
}: {
  champions: readonly DraftChampionGridViewItem[];
  slotLabel: string;
  side: 'allies' | 'enemies';
  occupant: { name: string; href: string } | null;
}) {
  const [query, setQuery] = useState('');
  const normalized = searchKey(query);
  const filtered = normalized
    ? champions.filter((champion) => champion.searchKey.includes(normalized))
    : champions;
  const owner = side === 'allies'
    ? { of: 'de tu equipo', for: 'tu equipo' }
    : { of: 'del equipo enemigo', for: 'el enemigo' };

  return (
    <section aria-labelledby="draft-picker-heading" className="draft-picker" id="draft-picker">
      <header>
        <h2 id="draft-picker-heading">Elegí para {slotLabel}</h2>
        <p>
          Ordenadas por el win rate estimado {owner.of} con ese pick, contando toda la composición.
        </p>
        <p className="draft-picker-note">
          Debajo de cada una, las dos lecturas que la explican, en puntos de win rate sobre 50: cómo
          le va en los cruces contra el otro equipo y cuánto aporta la sinergia interna. Son lecturas
          separadas, no las partes de una suma.
        </p>
      </header>

      {occupant ? (
        <Link className="draft-slot-clear" href={occupant.href}>
          <X aria-hidden="true" size={18} strokeWidth={2} />
          <span>Sacar a {occupant.name}</span>
        </Link>
      ) : null}

      <label className="draft-champion-search">
        <Search aria-hidden="true" size={20} strokeWidth={2} />
        <span className="sr-only">Buscar campeón</span>
        <input
          autoCapitalize="off"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar campeón"
          type="search"
          value={query}
        />
      </label>

      {filtered.length ? (
        <div className="draft-champion-grid">
          {filtered.map((champion) => (
            <Link
              aria-label={`Elegir a ${champion.name} para ${slotLabel}`}
              className="draft-champion-option"
              data-kind={champion.kind}
              href={champion.href}
              key={champion.key}
            >
              <Image
                alt=""
                className="draft-champion-image"
                height={56}
                src={champion.imageUrl}
                unoptimized
                width={56}
              />
              <span className="draft-champion-copy">
                <strong>{champion.name}</strong>
                {champion.kind === 'suggestion' ? (
                  <>
                    <span><b>{champion.winrateLabel}</b> de win rate para {owner.for}</span>
                    <small>
                      Cruces {champion.matchupLabel} · Sinergia {champion.synergyLabel}
                    </small>
                  </>
                ) : null}
                {champion.kind === 'off-role' ? (
                  <span className="draft-offrole-note">Casi no se juega en este rol: sin datos para estimar</span>
                ) : null}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="draft-picker-empty">No hay campeones disponibles que coincidan con esa búsqueda.</p>
      )}
    </section>
  );
}
