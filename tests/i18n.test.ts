import { describe, expect, it } from 'vitest';
import es from '../src/i18n/es.json';
import en from '../src/i18n/en.json';
import { createTranslator, detectLang, formatNumber, interpolate } from '../src/i18n/index.ts';

/** Todas las rutas de hojas de un objeto anidado: «a.b.c». */
function leaves(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
}

function get(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, k) => (node as Record<string, unknown> | undefined)?.[k], obj);
}

const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();

describe('archivos de idioma', () => {
  const esKeys = leaves(es).sort();
  const enKeys = leaves(en).sort();

  it('tienen exactamente las mismas claves', () => {
    expect(enKeys).toEqual(esKeys);
  });
  it('no tienen textos vacíos', () => {
    for (const k of esKeys) {
      expect(String(get(es, k)).trim().length).toBeGreaterThan(0);
      expect(String(get(en, k)).trim().length).toBeGreaterThan(0);
    }
  });
  it('usan los mismos marcadores {variable} en cada clave', () => {
    for (const k of esKeys) {
      expect(placeholders(String(get(en, k)))).toEqual(placeholders(String(get(es, k))));
    }
  });
  it('las claves con plural tienen _one y _other', () => {
    for (const k of esKeys.filter((k) => k.endsWith('_one'))) {
      expect(esKeys).toContain(k.replace(/_one$/, '_other'));
    }
  });
  it('cubren los mensajes de error de la calculadora', () => {
    expect(Object.keys(en.calculator.errors).sort()).toEqual(Object.keys(es.calculator.errors).sort());
    expect(Object.keys(es.calculator.errors).length).toBe(14);
  });
});

describe('traductor', () => {
  it('interpola parámetros y deja intactos los que faltan', () => {
    expect(interpolate('{a} y {b}', { a: 1 })).toBe('1 y {b}');
  });
  it('elige singular y plural según el idioma', () => {
    const tr = createTranslator('es', es);
    expect(tr.tp('toolbar.results', 1)).toBe('1 elemento');
    expect(tr.tp('toolbar.results', 3)).toBe('3 elementos');
    expect(createTranslator('en', en).tp('toolbar.results', 1)).toBe('1 element');
  });
  it('formatea números con coma decimal en español y punto en inglés', () => {
    expect(formatNumber('es', 55.845)).toBe('55,845');
    expect(formatNumber('en', 55.845)).toBe('55.845');
    expect(formatNumber('es', 12345.6)).toBe('12.345,6');
    expect(formatNumber('en', 12345.6)).toBe('12,345.6');
  });
  it('detecta el idioma de la primera visita', () => {
    expect(detectLang(['es-AR', 'en'])).toBe('es');
    expect(detectLang(['ES'])).toBe('es');
    expect(detectLang(['en-US', 'es'])).toBe('en');
    expect(detectLang(['pt-BR'])).toBe('en');
    expect(detectLang([])).toBe('es');
  });
});
