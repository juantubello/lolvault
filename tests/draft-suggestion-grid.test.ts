import { describe, expect, it } from 'vitest';

import {
  buildDraftMatrix,
  getSuggestions,
  ratingToWinrate,
} from '@/features/draft/analysis';
import {
  buildDraftChampionGrid,
  DRAFT_ROLE_MIN_GAMES,
  playsRole,
} from '@/features/draft/suggestion-grid';

describe('lista de presentación de sugerencias', () => {
  it('ordena por win rate estimado, excluye usados y conserva el desglose del motor', () => {
    const matrix = buildDraftMatrix({
      championKeys: [1, 2, 3, 4],
      championStats: [
        { championKey: 1, role: 'middle', games: 2_000, wins: 1_000 },
        { championKey: 2, role: 'middle', games: 2_000, wins: 1_000 },
        { championKey: 3, role: 'jungle', games: 2_000, wins: 1_000 },
        { championKey: 4, role: 'top', games: 2_000, wins: 1_000 },
      ],
      matchups: [
        { championKey: 1, role: 'middle', enemyChampionKey: 4, enemyRole: 'top', games: 1_000, wins: 600 },
        { championKey: 4, role: 'top', enemyChampionKey: 1, enemyRole: 'middle', games: 1_000, wins: 400 },
        { championKey: 2, role: 'middle', enemyChampionKey: 4, enemyRole: 'top', games: 1_000, wins: 520 },
        { championKey: 4, role: 'top', enemyChampionKey: 2, enemyRole: 'middle', games: 1_000, wins: 480 },
      ],
      synergies: [
        { championKey: 1, role: 'middle', allyChampionKey: 3, allyRole: 'jungle', games: 1_000, wins: 560 },
        { championKey: 3, role: 'jungle', allyChampionKey: 1, allyRole: 'middle', games: 1_000, wins: 560 },
        { championKey: 2, role: 'middle', allyChampionKey: 3, allyRole: 'jungle', games: 1_000, wins: 510 },
        { championKey: 3, role: 'jungle', allyChampionKey: 2, allyRole: 'middle', games: 1_000, wins: 510 },
      ],
    });
    const draft = {
      allies: [{ championKey: 3, role: 'jungle' as const }],
      enemies: [{ championKey: 4, role: 'top' as const }],
    };
    const champions = [1, 2, 3, 4].map((key) => ({
      key,
      name: `Campeón ${key}`,
      imageUrl: `https://example.test/${key}.png`,
      searchKey: `campeon${key}`,
    }));
    const engineSuggestions = getSuggestions(matrix, draft, { risk: 'medium', topN: 2 })
      .find(({ role }) => role === 'middle')?.suggestions ?? [];
    const result = buildDraftChampionGrid({
      matrix,
      draft,
      slot: { team: 'allies', role: 'middle' },
      risk: 'medium',
      champions,
    });

    expect(result.map(({ key }) => key)).toEqual([1, 2]);
    expect(result.some(({ key }) => key === 3 || key === 4)).toBe(false);
    expect(result[0]?.winrate).toBeGreaterThan(result[1]?.winrate ?? 0);
    expect(result[0]?.matchupPoints).toBeCloseTo(
      (ratingToWinrate(engineSuggestions[0]?.analysis.matchupRating ?? 0) - 0.5) * 100,
      12,
    );
    expect(result[0]?.synergyPoints).toBeCloseTo(
      (ratingToWinrate(engineSuggestions[0]?.analysis.allyDuoRating ?? 0) - 0.5) * 100,
      12,
    );
  });

  it('manda al fondo, sin número, a los que casi no juegan el rol', () => {
    // Un campeón sin partidas en el rol saca rating 0, o sea neutral, y en un draft perdido eso le
    // gana a cualquier support real: es el caso que ponía a Sivir arriba de Thresh.
    const matrix = buildDraftMatrix({
      championKeys: [1, 2, 3],
      championStats: [
        // Juega el rol: volumen de sobra y es su rol principal.
        { championKey: 1, role: 'support', games: 50_000, wins: 24_000 },
        // Toca el rol de casualidad: 1 % de sus partidas, aunque supere el mínimo absoluto.
        { championKey: 2, role: 'support', games: DRAFT_ROLE_MIN_GAMES + 1, wins: 500 },
        { championKey: 2, role: 'middle', games: 500_000, wins: 250_000 },
        // Nunca lo juega: la fila no existe.
        { championKey: 3, role: 'bottom', games: 80_000, wins: 40_000 },
      ],
      matchups: [],
      synergies: [],
    });

    expect(playsRole(matrix, 1, 'support', 'medium')).toBe(true);
    expect(playsRole(matrix, 2, 'support', 'medium')).toBe(false);
    expect(playsRole(matrix, 3, 'support', 'medium')).toBe(false);

    const champions = [1, 2, 3].map((key) => ({
      key,
      name: `Campeón ${key}`,
      imageUrl: `https://example.test/${key}.png`,
      searchKey: `campeon${key}`,
    }));
    const result = buildDraftChampionGrid({
      matrix,
      draft: { allies: [], enemies: [] },
      slot: { team: 'allies', role: 'support' },
      risk: 'medium',
      champions,
    });

    // Se pueden elegir igual, pero después de los candidatos reales y sin estimación.
    expect(result.map(({ key, kind }) => [key, kind])).toEqual([
      [1, 'suggestion'],
      [2, 'off-role'],
      [3, 'off-role'],
    ]);
    expect(result[1]?.winrate).toBeNull();
    expect(result[2]?.winrate).toBeNull();
  });
});
