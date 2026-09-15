import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  CompactFormatError,
  parseCompact,
} from '@/features/matches/opgg/compact-format';

const fixture = (name: string): string => readFileSync(
  new URL(`./fixtures/opgg/${name}`, import.meta.url),
  'utf8',
);

describe('formato compacto de OP.GG', () => {
  it.each(['list-20.txt', 'detail.txt', 'profile.txt'])(
    'parsea la captura real %s',
    (name) => {
      expect(parseCompact(fixture(name))).toBeTypeOf('object');
    },
  );

  it('respeta nulls, decimales, listas vacías y escapes defensivos', () => {
    const text = String.raw`class Example: nullable,score,items,label

      Example(null, -1.25, [true, false], "comillas: \" y barra: \\ ")`;

    expect(parseCompact(text)).toEqual({
      nullable: null,
      score: -1.25,
      items: [true, false],
      label: 'comillas: " y barra: \\ ',
    });
    expect(parseCompact('class Empty: values\nEmpty([])')).toEqual({ values: [] });
  });

  it('informa la aridad incorrecta', () => {
    expect(() => parseCompact('class Pair: left,right\nPair(1)'))
      .toThrowError(/Cantidad de valores inválida.*Pair/);
  });

  it('informa una clase desconocida', () => {
    expect(() => parseCompact('class Known: value\nUnknown(1)'))
      .toThrowError(/Clase desconocida: Unknown/);
  });

  it('usa CompactFormatError para tokens inesperados', () => {
    expect(() => parseCompact('class Box: value\nBox(@)')).toThrow(CompactFormatError);
    expect(() => parseCompact('class Box: value\nBox(@)')).toThrow(/Token inesperado/);
  });
});
