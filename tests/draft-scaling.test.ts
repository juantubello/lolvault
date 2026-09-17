import { describe, expect, it } from 'vitest';

import {
  buildDraftScalingMatrix,
  calculateTeamScalingCurve,
  type DraftScalingRow,
} from '@/features/draft/scaling';

const pick = { championKey: 10, role: 'top' } as const;

function scalingOf(rows: DraftScalingRow[]) {
  return buildDraftScalingMatrix(rows);
}

function row(bucket: number, games: number, wins: number): DraftScalingRow {
  return { ...pick, bucket, games, wins };
}

describe('curva normalizada de Scaling', () => {
  it('un draft vacío da 50,00 % en todos los tramos', () => {
    const curve = calculateTeamScalingCurve(scalingOf([]), []);

    expect(curve).toHaveLength(7);
    expect(curve?.every(({ winrate }) => winrate === 0.5)).toBe(true);
  });

  it('un campeón que escala fuerte empuja la curva hacia arriba al final', () => {
    const scaling = scalingOf([
      row(1, 1_000, 400),
      row(2, 1_000, 430),
      row(3, 1_000, 460),
      row(4, 1_000, 500),
      row(5, 1_000, 540),
      row(6, 1_000, 580),
      row(7, 1_000, 620),
    ]);
    const curve = calculateTeamScalingCurve(scaling, [pick]);

    expect(curve?.[0]?.winrate).toBeLessThan(0.5);
    expect(curve?.[6]?.winrate).toBeGreaterThan(0.5);
    expect(curve?.[6]?.winrate).toBeGreaterThan(curve?.[0]?.winrate ?? 1);
  });

  it('el prior hace que un tramo mínimo casi no mueva la curva', () => {
    const tinyRows = Array.from({ length: 7 }, (_, index) => row(index + 1, 2, index === 0 ? 0 : 1));
    // Mismo perfil de curva que el caso chico, pero con muestra de sobra: lo único que cambia
    // es cuánto pesa cada tramo contra el prior.
    const robustRows = [
      row(1, 20_000, 8_000), ...Array.from({ length: 6 }, (_, index) => row(index + 2, 20_000, 10_000)),
    ];
    const tinyCurve = calculateTeamScalingCurve(scalingOf(tinyRows), [pick]);
    const robustCurve = calculateTeamScalingCurve(scalingOf(robustRows), [pick]);

    expect(tinyCurve).not.toBeNull();
    expect(robustCurve).not.toBeNull();
    // Con 2 partidas por tramo el prior se come todo; con 20.000 el dato manda.
    expect(Math.abs((tinyCurve?.[0]?.winrate ?? 0) - 0.5)).toBeLessThan(0.001);
    expect(Math.abs((robustCurve?.[0]?.winrate ?? 0) - 0.5)).toBeGreaterThan(0.05);
  });

  it('50 % es exactamente el promedio del propio campeón, sin sesgo', () => {
    // Todos los tramos con el mismo win rate: cada uno rinde igual que su promedio, así que la
    // curva tiene que dar 50,00 % clavado en los siete. Con la referencia tomada de otra fuente
    // esto daba un sesgo constante.
    const planos = Array.from({ length: 7 }, (_, index) => row(index + 1, 9_000 + index * 500, 4_860 + index * 270));
    const curve = calculateTeamScalingCurve(scalingOf(planos), [pick]);

    expect(curve).toHaveLength(7);
    for (const point of curve ?? []) expect(point.winrate).toBeCloseTo(0.5, 12);
  });
});
