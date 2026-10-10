import { describe, expect, it } from 'vitest';
import elementsJson from '../src/data/elements.json';
import textsEs from '../src/data/texts.es.json';
import textsEn from '../src/data/texts.en.json';
import type { Element } from '../src/data/types.ts';
import { validateElements, validateTexts } from '../src/data/validate.ts';
import { electronConfigs, gridPosition, parseHalfLife, parseSciText, leadingNumber } from '../scripts/build-data.ts';

const elements = elementsJson as unknown as Element[];
const bySymbol = new Map(elements.map((e) => [e.symbol, e]));
const el = (s: string): Element => {
  const e = bySymbol.get(s);
  if (!e) throw new Error(`falta ${s}`);
  return e;
};

describe('dataset — esquema y coherencia', () => {
  it('pasa la validación completa sin problemas', () => {
    expect(validateElements(elements)).toEqual([]);
  });
  it('tiene los números atómicos 1–118 sin huecos ni repeticiones', () => {
    expect(elements.map((e) => e.z)).toEqual(Array.from({ length: 118 }, (_, i) => i + 1));
  });
  it('tiene posiciones de grilla únicas y dentro de 18 columnas', () => {
    const pos = new Set(elements.map((e) => `${e.x},${e.y}`));
    expect(pos.size).toBe(118);
    expect(elements.every((e) => e.x >= 1 && e.x <= 18)).toBe(true);
  });
  it('separa lantánidos y actínidos en las filas 9 y 10 (15 cada una)', () => {
    expect(elements.filter((e) => e.y === 9).map((e) => e.z)).toEqual(Array.from({ length: 15 }, (_, i) => 57 + i));
    expect(elements.filter((e) => e.y === 10).map((e) => e.z)).toEqual(Array.from({ length: 15 }, (_, i) => 89 + i));
  });
  it('detecta errores de unidades y huecos', () => {
    const broken = elements.map((e) => (e.z === 26 ? { ...e, meltingPoint: 1538 - 273.15 - 5000 } : e));
    expect(validateElements(broken).some((i) => i.field === 'meltingPoint')).toBe(true);
    const gap = elements.filter((e) => e.z !== 50);
    expect(validateElements(gap).length).toBeGreaterThan(0);
    const dupPos = elements.map((e) => (e.z === 2 ? { ...e, x: 1, y: 1 } : e));
    expect(validateElements(dupPos).some((i) => i.field === 'x/y')).toBe(true);
  });
  it('usa unidades consistentes: eV, pm, K y g/cm³', () => {
    // Energías de ionización en eV (no kJ/mol): todas entre 3 y 25.
    expect(
      elements.every((e) => e.ionizationEnergy === null || (e.ionizationEnergy > 3 && e.ionizationEnergy < 25)),
    ).toBe(true);
    // Radios en pm: el del H ronda 100, no 1 Å ni 1e-10 m.
    expect(el('H').atomicRadius).toBeGreaterThan(50);
    // Temperaturas en K: ningún punto de fusión por debajo de 0,5 K.
    expect(elements.every((e) => e.meltingPoint === null || e.meltingPoint > 0.5)).toBe(true);
    // Gases en g/cm³ (≈ 0,001), no en g/L (≈ 1).
    expect(el('N').density).toBeLessThan(0.01);
  });
  it('representa lo desconocido como null, no como 0 ni cadena vacía', () => {
    const og = el('Og');
    expect(og.meltingPoint).toBeNull();
    expect(og.atomicWeight).toBeNull();
    expect(og.massNumber).toBe(295);
    expect(og.phase).toBeNull();
    expect(og.predictedPhase).toBe('gas');
  });
  it('cada elemento tiene peso atómico estándar o número másico', () => {
    expect(elements.every((e) => (e.atomicWeight === null) !== (e.massNumber === null))).toBe(true);
  });
  it('la suma de electrones por capa coincide con Z', () => {
    for (const e of elements) expect(e.shells.reduce((a, b) => a + b, 0)).toBe(e.z);
  });
});

/**
 * Muestra verificada manualmente contra las fuentes crudas de data/raw/:
 * peso atómico abreviado (CIAAW), 1.ª energía de ionización (NIST ASD),
 * puntos de fusión/ebullición, densidad y electronegatividad (PubChem).
 */
describe('dataset — muestra verificada contra las fuentes', () => {
  const sample: [string, number | null, number | null, number | null, number | null, number | null][] = [
    // símbolo, peso atómico, energía de ionización (eV), fusión (K), ebullición (K), densidad
    ['H', 1.008, 13.598434599702, 13.81, 20.28, 0.00008988],
    ['C', 12.011, 11.260288, 3823, 4098, 2.267],
    ['O', 15.999, 13.618055, 54.36, 90.2, 0.001429],
    ['Fe', 55.845, 7.9024681, 1811, 3134, 7.874],
    ['Cu', 63.546, 7.72638, 1357.77, 2835, 8.933],
    ['Au', 196.97, 9.225554, 1337.33, 3129, 19.282],
    ['Hg', 200.59, 10.437504, 234.32, 629.88, 13.5336],
    ['U', 238.03, 6.19405, 1408, 4404, 18.95],
    ['Og', null, null, null, null, null],
  ];
  for (const [sym, aw, ie, mp, bp, rho] of sample) {
    it(sym, () => {
      const e = el(sym);
      expect(e.atomicWeight).toBe(aw);
      expect(e.ionizationEnergy).toBe(ie);
      expect(e.meltingPoint).toBe(mp);
      expect(e.boilingPoint).toBe(bp);
      expect(e.density).toBe(rho);
    });
  }
  it('configuraciones y capas de la muestra', () => {
    expect(el('Fe').electronConfigurationShort).toBe('[Ar] 3d6 4s2');
    expect(el('Cu').electronConfigurationShort).toBe('[Ar] 3d10 4s1');
    expect(el('Au').shells).toEqual([2, 8, 18, 32, 18, 1]);
    expect(el('Fe').electronConfiguration).toBe('1s2 2s2 2p6 3s2 3p6 4s2 3d6');
  });
  it('estados a 298 K: Hg líquido, O gas, Fe sólido', () => {
    expect(el('Hg').phase).toBe('liquid');
    expect(el('Br').phase).toBe('liquid');
    expect(el('O').phase).toBe('gas');
    expect(el('Fe').phase).toBe('solid');
  });
  it('isótopos naturales de C, Fe y U', () => {
    expect(el('C').isotopes.map((i) => i.a)).toEqual([12, 13]);
    expect(el('Fe').isotopes.reduce((a, i) => a + (i.abundance ?? 0), 0)).toBeCloseTo(1, 3);
    const u238 = el('U').isotopes.find((i) => i.a === 238);
    expect(u238?.stable).toBe(false);
    expect((u238?.halfLife ?? 0) / (365.2422 * 86400)).toBeCloseTo(4.463e9, -7);
  });
  it('el arsénico sublima y el resto no', () => {
    expect(elements.filter((e) => e.sublimes).map((e) => e.symbol)).toEqual(['As']);
  });
  it('conocidos desde la antigüedad, con las correcciones documentadas', () => {
    const ancient = elements.filter((e) => e.antiquity).map((e) => e.symbol);
    expect(ancient).toEqual(['C', 'S', 'Fe', 'Cu', 'Ag', 'Sn', 'Sb', 'Au', 'Hg', 'Pb']);
    expect(el('Al').year).toBe(1825);
  });
});

describe('textos por idioma', () => {
  it('ambos idiomas validan y cubren los 118 elementos', () => {
    expect(validateTexts(textsEs, 'es')).toEqual([]);
    expect(validateTexts(textsEn, 'en')).toEqual([]);
  });
  it('todos los elementos tienen nombre, usos y dato curioso en ambos idiomas', () => {
    for (const t of [textsEs, textsEn] as Record<
      string,
      { name: string; uses: string | null; fact: string | null }
    >[]) {
      for (let z = 1; z <= 118; z++) {
        const entry = t[String(z)];
        expect(entry?.name).toBeTruthy();
        expect(entry?.uses).toBeTruthy();
        expect(entry?.fact).toBeTruthy();
      }
    }
  });
  it('nombres de la muestra', () => {
    const es = textsEs as Record<string, { name: string }>;
    const en = textsEn as Record<string, { name: string }>;
    expect(es['26']?.name).toBe('Hierro');
    expect(en['26']?.name).toBe('Iron');
    expect(es['118']?.name).toBe('Oganesón');
  });
});

describe('parsers de fuentes', () => {
  it('gridPosition ubica casos borde', () => {
    expect(gridPosition(1)).toMatchObject({ x: 1, y: 1, group: 1, block: 's' });
    expect(gridPosition(2)).toMatchObject({ x: 18, y: 1, group: 18, block: 's' });
    expect(gridPosition(5)).toMatchObject({ x: 13, y: 2, block: 'p' });
    expect(gridPosition(57)).toMatchObject({ x: 3, y: 9, group: null, block: 'f' });
    expect(gridPosition(71)).toMatchObject({ x: 17, y: 9 });
    expect(gridPosition(72)).toMatchObject({ x: 4, y: 6, group: 4, block: 'd' });
    expect(gridPosition(118)).toMatchObject({ x: 18, y: 7, period: 7 });
  });
  it('electronConfigs expande núcleos de gas noble', () => {
    const r = electronConfigs('[Xe]6s2 4f14 5d10');
    expect(r.full).toBe('1s2 2s2 2p6 3s2 3p6 4s2 3d10 4p6 5s2 4d10 5p6 6s2 4f14 5d10');
    expect(r.short).toBe('[Xe] 4f14 5d10 6s2');
    expect(r.shells).toEqual([2, 8, 18, 32, 18, 2]);
    expect(electronConfigs('[Rn]7s2 7p6 5f14 6d10 (predicted)').predicted).toBe(true);
  });
  it('parseHalfLife convierte unidades y reconoce estables', () => {
    expect(parseHalfLife('Stable')).toBe('stable');
    expect(parseHalfLife('2.14 s ± 0.17')).toBe(2.14);
    expect(parseHalfLife('3.14 m ± 0.02')).toBeCloseTo(188.4, 6);
    expect(parseHalfLife('Not-specified')).toBeNull();
    expect(parseHalfLife('<110ns')).toBeNull();
  });
  it('parseSciText interpreta el exponente perdido', () => {
    expect(parseSciText('5.63×104 milligrams per kilogram')).toBe(56300);
    expect(parseSciText('8×10-3 milligrams per kilogram')).toBe(0.008);
    expect(parseSciText('2.8 milligrams per kilogram')).toBe(2.8);
  });
  it('leadingNumber lee valores con incertidumbre y espacios finos', () => {
    expect(leadingNumber('55.845(2)')).toBe(55.845);
    expect(leadingNumber('1.0080 ± 0.0002')).toBe(1.008);
    expect(leadingNumber('4.002\u00a0602(2)')).toBe(4.002602);
  });
});
