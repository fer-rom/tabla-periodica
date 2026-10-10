/**
 * Búsqueda instantánea por nombre (en ambos idiomas y variantes), símbolo o número.
 * Tolera tildes, mayúsculas y errores menores (distancia de Damerau-Levenshtein restringida).
 */
import type { Element, ElementTexts } from '../data/types.ts';

/** minúsculas, sin diacríticos y sin espacios extremos: «Oxígeno» → «oxigeno». */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** Distancia de edición con transposiciones adyacentes (OSA), con corte temprano. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) rows.push([i]);
  const first = rows[0] ?? [];
  for (let j = 1; j <= b.length; j++) first[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const row = rows[i] ?? [];
    const prev = rows[i - 1] ?? [];
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, (rows[i - 2]?.[j - 2] ?? 0) + 1);
      }
      row[j] = v;
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
  }
  return rows[a.length]?.[b.length] ?? max + 1;
}

interface Entry {
  readonly z: number;
  readonly symbol: string;
  readonly names: readonly string[];
}

export interface SearchIndex {
  readonly entries: readonly Entry[];
}

export function buildIndex(elements: readonly Element[], texts: readonly ElementTexts[]): SearchIndex {
  return {
    entries: elements.map((el) => {
      const names = new Set<string>();
      for (const t of texts) {
        const entry = t[String(el.z)];
        if (!entry) continue;
        names.add(normalize(entry.name));
        for (const alias of entry.aliases) names.add(normalize(alias));
      }
      return { z: el.z, symbol: el.symbol.toLowerCase(), names: [...names] };
    }),
  };
}

/** Errores permitidos según la longitud de lo escrito. */
const tolerance = (len: number): number => (len <= 3 ? 0 : len <= 6 ? 1 : 2);

/**
 * Devuelve los Z que coinciden, ordenados por relevancia:
 * número exacto › símbolo exacto › nombre que empieza igual › nombre que contiene › parecido.
 * `null` si la consulta está vacía (no filtrar).
 */
export function search(index: SearchIndex, query: string): number[] | null {
  const q = normalize(query);
  if (q === '') return null;
  if (/^\d+$/.test(q)) {
    const z = Number(q);
    return index.entries.some((e) => e.z === z) ? [z] : [];
  }
  const scored: { z: number; score: number }[] = [];
  const tol = tolerance(q.length);
  for (const e of index.entries) {
    let score = Infinity;
    if (e.symbol === q) score = 0;
    for (const name of e.names) {
      if (name === q) score = Math.min(score, 0.5);
      else if (name.startsWith(q)) score = Math.min(score, 1);
      else if (q.length >= 3 && name.includes(q)) score = Math.min(score, 2);
      else if (tol > 0) {
        // Comparar contra el nombre completo y contra su prefijo del mismo largo (escritura parcial).
        const d = Math.min(editDistance(q, name, tol), editDistance(q, name.slice(0, q.length), tol));
        if (d <= tol) score = Math.min(score, 3 + d);
      }
    }
    if (score === Infinity && q.length <= 2 && e.symbol.startsWith(q)) score = 1.5;
    if (score !== Infinity) scored.push({ z: e.z, score });
  }
  return scored.sort((a, b) => a.score - b.score || a.z - b.z).map((s) => s.z);
}
