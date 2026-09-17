'use client';

import { ListFilter, Search, TriangleAlert, X } from 'lucide-react';
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
  boardWinrateLabel: string | null;
  counterpickWinrateLabel: string | null;
  counterpickDropLabel: string | null;
  notablyBadFloor: boolean;
  missingEnemyRoles: number;
  matchupLabel: string | null;
  synergyLabel: string | null;
  personalLabel: string | null;
  personalPlayed: boolean;
  personalBelowAverage: boolean;
};

export function DraftChampionGrid({
  champions,
  slotLabel,
  /** De quién es el win rate que ordena la lista: el número cambia de dueño según el casillero. */
  side,
  occupant,
  personalPlayerName,
}: {
  champions: readonly DraftChampionGridViewItem[];
  slotLabel: string;
  side: 'allies' | 'enemies';
  occupant: { name: string; href: string } | null;
  personalPlayerName: string | null;
}) {
  const [query, setQuery] = useState('');
  const [personalFirst, setPersonalFirst] = useState(false);
  const normalized = searchKey(query);
  const matching = normalized
    ? champions.filter((champion) => champion.searchKey.includes(normalized))
    : champions;
  const filtered = personalFirst
    ? matching
      .map((champion, index) => ({ champion, index }))
      .sort((a, b) => Number(b.champion.personalPlayed) - Number(a.champion.personalPlayed) || a.index - b.index)
      .map(({ champion }) => champion)
    : matching;
  const owner = side === 'allies'
    ? { of: 'de tu equipo', for: 'tu equipo' }
    : { of: 'del equipo enemigo', for: 'el enemigo' };
  const missingEnemyRoles = champions.find(({ kind }) => kind === 'suggestion')
    ?.missingEnemyRoles ?? 0;
  const missingEnemyLabel = missingEnemyRoles === 1
    ? 'el casillero rival que falta se completa'
    : `los ${missingEnemyRoles} casilleros rivales que faltan se completan`;

  return (
    <section aria-labelledby="draft-picker-heading" className="draft-picker" id="draft-picker">
      <header>
        <h2 id="draft-picker-heading">Elegí para {slotLabel}</h2>
        {missingEnemyRoles > 0 ? (
          <p>
            Ordenadas por el <strong>valor esperado {owner.of}</strong> con ese pick, suponiendo que{' '}
            {missingEnemyLabel} con los campeones habituales de cada rol, pesados por partidas.
            No es el win rate del tablero actual.
          </p>
        ) : (
          <p>
            Ordenadas por el win rate estimado {owner.of} con ese pick, contando toda la composición.
          </p>
        )}
        <p className="draft-picker-note">
          Debajo de cada una, las dos lecturas que la explican, en puntos de win rate sobre 50: cómo
          le va en los cruces contra el otro equipo y cuánto aporta la sinergia interna. Son lecturas
          separadas, no las partes de una suma.
        </p>
        {missingEnemyRoles > 0 ? (
          <p className="draft-picker-note">
            El <strong>piso de contrapick</strong> usa el peor cruce entre los diez campeones más
            jugados de cada rol pendiente. “Riesgo” dice cuánto baja desde el valor esperado.
          </p>
        ) : null}
        {personalPlayerName ? (
          <p className="draft-picker-personal-note">
            El dato de {personalPlayerName} va aparte y no cambia el win rate estimado.
          </p>
        ) : null}
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

      {personalPlayerName ? (
        <div className="draft-personal-order">
          <button
            aria-pressed={personalFirst}
            onClick={() => setPersonalFirst((current) => !current)}
            type="button"
          >
            <ListFilter aria-hidden="true" size={18} strokeWidth={2} />
            Primero los que juega
          </button>
          <small>
            {personalFirst
              ? 'Orden personal activo; dentro de cada grupo se conserva la sugerencia.'
              : 'Apagado: manda la sugerencia global.'}
          </small>
        </div>
      ) : null}

      {filtered.length ? (
        <div className="draft-champion-grid">
          {filtered.map((champion) => (
            <Link
              aria-label={[
                `Elegir a ${champion.name} para ${slotLabel}`,
                champion.winrateLabel
                  ? `${missingEnemyRoles > 0 ? 'Valor esperado' : 'Win rate'} ${champion.winrateLabel}`
                  : null,
                champion.boardWinrateLabel ? `Tablero actual ${champion.boardWinrateLabel}` : null,
                champion.counterpickWinrateLabel
                  ? `Piso de contrapick ${champion.counterpickWinrateLabel}`
                  : null,
                champion.counterpickDropLabel ? `Riesgo ${champion.counterpickDropLabel}` : null,
                champion.notablyBadFloor ? 'Piso notablemente malo' : null,
                champion.personalLabel,
              ].filter(Boolean).join('. ')}
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
                    {missingEnemyRoles > 0 ? (
                      <>
                        <span className="draft-champion-expected">
                          <small>Valor esperado para {owner.for}</small>
                          <b>{champion.winrateLabel}</b>
                        </span>
                        <span className="draft-champion-forecast">
                          <span>
                            <small>Tablero actual</small>
                            <b>{champion.boardWinrateLabel}</b>
                          </span>
                          <span data-bad-floor={champion.notablyBadFloor || undefined}>
                            <small>Piso de contrapick</small>
                            <b>{champion.counterpickWinrateLabel}</b>
                            <small>Riesgo {champion.counterpickDropLabel}</small>
                          </span>
                        </span>
                        {champion.notablyBadFloor ? (
                          <span className="draft-counterpick-warning">
                            <TriangleAlert aria-hidden="true" size={16} strokeWidth={2} />
                            Piso notablemente malo
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span><b>{champion.winrateLabel}</b> de win rate para {owner.for}</span>
                    )}
                    <small>
                      Cruces {champion.matchupLabel} · Sinergia {champion.synergyLabel}
                    </small>
                  </>
                ) : null}
                {champion.kind === 'off-role' ? (
                  <span className="draft-offrole-note">Casi no se juega en este rol: sin datos para estimar</span>
                ) : null}
                {champion.personalLabel ? (
                  <span
                    className="draft-personal-stat"
                    data-below-average={champion.personalBelowAverage || undefined}
                    data-played={champion.personalPlayed || undefined}
                  >
                    {champion.personalLabel}
                  </span>
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
