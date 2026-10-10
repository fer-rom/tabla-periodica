import { describe, expect, it } from 'vitest';
import elementsJson from '../src/data/elements.json';
import textsEs from '../src/data/texts.es.json';
import textsEn from '../src/data/texts.en.json';
import type { Element } from '../src/data/types.ts';
import { buildIndex, editDistance, normalize, search } from '../src/lib/search.ts';
import { matchesFilters, toggle, visibleSet } from '../src/lib/filters.ts';
import { phaseAt } from '../src/lib/phase.ts';
import { NO_FILTERS, type Filters } from '../src/state-types.ts';

const elements = elementsJson as unknown as Element[];
const index = buildIndex(elements, [textsEs, textsEn]);
const first = (q: string): number | undefined => search(index, q)?.[0];

describe('búsqueda', () => {
  it('consulta vacía no filtra', () => {
    expect(search(index, '')).toBeNull();
    expect(search(index, '   ')).toBeNull();
  });
  it('por número atómico exacto', () => {
    expect(search(index, '26')).toEqual([26]);
    expect(search(index, '119')).toEqual([]);
  });
  it('por símbolo, sin importar mayúsculas', () => {
    expect(first('Fe')).toBe(26);
    expect(first('fe')).toBe(26);
    expect(first('OG')).toBe(118);
  });
  it('por nombre en español y en inglés', () => {
    expect(first('hierro')).toBe(26);
    expect(first('iron')).toBe(26);
    expect(first('oro')).toBe(79);
    expect(first('gold')).toBe(79);
  });
  it('tolera tildes y mayúsculas', () => {
    expect(first('oxigeno')).toBe(8);
    expect(first('OXÍGENO')).toBe(8);
    expect(first('fósforo')).toBe(15);
    expect(first('fosforo')).toBe(15);
  });
  it('tolera errores menores de tipeo', () => {
    expect(first('hidorgeno')).toBe(1);
    expect(first('nitrogneo')).toBe(7);
    expect(first('potasoi')).toBe(19);
    expect(first('sodim')).toBe(11);
  });
  it('encuentra por prefijo mientras se escribe', () => {
    expect(first('oxi')).toBe(8);
    expect(search(index, 'ca')).toContain(20);
  });
  it('acepta variantes de nombres', () => {
    expect(first('tungsteno')).toBe(74);
    expect(first('wolfram')).toBe(74);
    expect(first('cinc')).toBe(30);
    expect(first('aluminium')).toBe(13);
    expect(first('sulphur')).toBe(16);
  });
  it('no devuelve resultados para texto sin relación', () => {
    expect(search(index, 'qwertyuiop')).toEqual([]);
  });
});

describe('utilidades de texto', () => {
  it('normalize quita diacríticos', () => {
    expect(normalize('  Oganesón ')).toBe('oganeson');
  });
  it('editDistance cuenta transposiciones como un error', () => {
    expect(editDistance('ab', 'ba')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
  });
});

describe('filtros combinables', () => {
  const f = (patch: Partial<Filters>): Filters => ({ ...NO_FILTERS, ...patch });
  const count = (filters: Filters): number => elements.filter((e) => matchesFilters(e, filters)).length;

  it('sin filtros pasan todos', () => {
    expect(count(NO_FILTERS)).toBe(118);
  });
  it('por bloque', () => {
    expect(count(f({ blocks: ['f'] }))).toBe(30);
    expect(count(f({ blocks: ['s'] }))).toBe(14);
  });
  it('por categoría (OR dentro del grupo)', () => {
    expect(count(f({ categories: ['noble-gas'] }))).toBe(7);
    expect(count(f({ categories: ['noble-gas', 'halogen'] }))).toBe(13);
  });
  it('por estado a 298 K', () => {
    expect(
      elements
        .filter((e) => matchesFilters(e, f({ phases: ['liquid'] })))
        .map((e) => e.symbol)
        .sort(),
    ).toEqual(['Br', 'Hg']);
  });
  it('combina grupos con AND', () => {
    const r = elements.filter((e) => matchesFilters(e, f({ periods: [4], categories: ['transition-metal'] })));
    expect(r.map((e) => e.symbol)).toEqual(['Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn']);
  });
  it('visibleSet cruza búsqueda, filtros y resaltado', () => {
    expect(visibleSet(elements, null, NO_FILTERS, null)).toBeNull();
    expect([...(visibleSet(elements, [26, 8], f({ phases: ['gas'] }), null) ?? [])]).toEqual([8]);
    expect(visibleSet(elements, null, NO_FILTERS, 'noble-gas')?.size).toBe(7);
  });
  it('toggle agrega y quita', () => {
    expect(toggle(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggle(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('estado según la temperatura', () => {
  it('coincide con el estado de PubChem a 298 K', () => {
    for (const e of elements) {
      if (e.phase !== null && e.meltingPoint !== null && e.boilingPoint !== null) {
        expect(`${e.symbol}:${phaseAt(e, 298)}`).toBe(`${e.symbol}:${e.phase}`);
      }
    }
  });
  it('recorre sólido → líquido → gas', () => {
    const fe = elements[25];
    if (!fe) throw new Error('falta Fe');
    expect(phaseAt(fe, 1000)).toBe('solid');
    expect(phaseAt(fe, 2000)).toBe('liquid');
    expect(phaseAt(fe, 4000)).toBe('gas');
  });
  it('el arsénico sublima: pasa de sólido a gas', () => {
    const as = elements[32];
    if (!as) throw new Error('falta As');
    expect(phaseAt(as, 800)).toBe('solid');
    expect(phaseAt(as, 900)).toBe('gas');
  });
  it('sin datos no afirma un estado', () => {
    const og = elements[117];
    if (!og) throw new Error('falta Og');
    expect(phaseAt(og, 298)).toBe('unknown');
  });
});
