/**
 * Genera el dataset de la app a partir del snapshot crudo de data/raw/ (ver fetch-sources.ts)
 * y de los textos editoriales de data/editorial/.
 *
 * Salidas:
 *   src/data/elements.json     118 × Element (números e invariantes de idioma)
 *   src/data/texts.es.json     nombres, usos y datos curiosos en español
 *   src/data/texts.en.json     ídem en inglés
 *   data/sources.json          procedencia de cada campo + fecha y hash del snapshot
 *
 * Es determinista: misma entrada, misma salida. Si la validación falla, no escribe nada.
 * Uso: npm run data:build
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
  CATEGORIES,
  type Block,
  type Category,
  type Element,
  type ElementText,
  type Isotope,
  type Phase,
} from '../src/data/types.ts';
import { validateElements, validateTexts } from '../src/data/validate.ts';

const ROOT = join(import.meta.dirname, '..');
const RAW = join(ROOT, 'data', 'raw');
const EDITORIAL = join(ROOT, 'data', 'editorial');
const read = (dir: string, file: string): string => readFileSync(join(dir, file), 'utf8');
const readJson = (dir: string, file: string): unknown => JSON.parse(read(dir, file));

// ───────────────────────── utilidades de parseo ─────────────────────────

const decodeEntities = (s: string): string =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&plusmn;/g, '±')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));

const stripTags = (s: string): string =>
  decodeEntities(s.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();

/** Primer número de una cadena con incertidumbre: "55.845(2)", "1.0080 ± 0.0002", "4.002 602(2)". */
export function leadingNumber(s: string): number | null {
  const m = /^[\s[]*(-?\d[\d\s\u00a0]*(?:\.[\d\s\u00a0]+)?(?:[eE][+-]?\d+)?)/.exec(s);
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(/[\s\u00a0]/g, ''));
  return Number.isFinite(n) ? n : null;
}

const num = (s: string | undefined): number | null => {
  if (s === undefined || s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Parsea la notación "5.63×104 milligrams per kilogram" (el superíndice se perdió: ×10^4). */
export function parseSciText(s: string): number | null {
  const m = /^\s*([\d.]+)\s*(?:×\s*10(-?\d+))?/.exec(s);
  if (!m?.[1]) return null;
  const base = Number(m[1]);
  const exp = m[2] === undefined ? 0 : Number(m[2]);
  const n = base * 10 ** exp;
  return Number.isFinite(n) ? Number(n.toPrecision(6)) : null;
}

const HALF_LIFE_UNITS: Readonly<Record<string, number>> = {
  ys: 1e-24,
  zs: 1e-21,
  as: 1e-18,
  fs: 1e-15,
  ps: 1e-12,
  ns: 1e-9,
  us: 1e-6,
  ms: 1e-3,
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};
const YEAR = 365.2422 * 86400; // convención de NUBASE
const YEAR_PREFIX: Readonly<Record<string, number>> = {
  y: 1,
  ky: 1e3,
  My: 1e6,
  Gy: 1e9,
  Ty: 1e12,
  Py: 1e15,
  Ey: 1e18,
  Zy: 1e21,
  Yy: 1e24,
};

/** Semidesintegración en segundos; `'stable'` si es estable; `null` si no se especifica. */
export function parseHalfLife(s: string): number | 'stable' | null {
  const t = s.trim();
  if (/^stable/i.test(t)) return 'stable';
  const m = /^([<>~≈]?)\s*([\d.]+(?:[eE][+-]?\d+)?)\s*([a-zA-Z]+)/.exec(t);
  if (!m?.[2] || !m[3] || m[1]) return null; // los límites (<, >) no son un valor
  const value = Number(m[2]);
  const unit = m[3];
  const factor = HALF_LIFE_UNITS[unit] ?? (YEAR_PREFIX[unit] === undefined ? undefined : YEAR_PREFIX[unit] * YEAR);
  return factor === undefined || !Number.isFinite(value) ? null : value * factor;
}

// ───────────────────────── posición en la grilla ─────────────────────────

const PERIOD_ENDS = [2, 10, 18, 36, 54, 86, 118] as const;

export function gridPosition(z: number): { x: number; y: number; period: number; group: number | null; block: Block } {
  const period = PERIOD_ENDS.findIndex((end) => z <= end) + 1;
  const start = period === 1 ? 1 : (PERIOD_ENDS[period - 2] ?? 0) + 1;
  const offset = z - start; // 0-based dentro del período
  let x: number;
  let y = period;
  if (period === 1) x = z === 1 ? 1 : 18;
  else if (period <= 3) x = offset < 2 ? offset + 1 : offset + 11;
  else if (period <= 5) x = offset + 1;
  else if (offset < 2) x = offset + 1;
  else if (offset < 17) {
    // La–Lu (57–71) y Ac–Lr (89–103): fila f separada, columnas 3–17
    x = offset + 1;
    y = period === 6 ? 9 : 10;
  } else x = offset - 13;
  const group = y > 7 ? null : x;
  const block: Block = y > 7 ? 'f' : z === 2 ? 's' : x <= 2 ? 's' : x >= 13 ? 'p' : 'd';
  return { x, y, period, group, block };
}

// ───────────────────────── configuración electrónica ─────────────────────────

const L_INDEX: Readonly<Record<string, number>> = { s: 0, p: 1, d: 2, f: 3, g: 4 };
const CORES: Readonly<Record<string, string>> = {
  He: '1s2',
  Ne: '[He] 2s2 2p6',
  Ar: '[Ne] 3s2 3p6',
  Kr: '[Ar] 3d10 4s2 4p6',
  Xe: '[Kr] 4d10 5s2 5p6',
  Rn: '[Xe] 4f14 5d10 6s2 6p6',
};

type Subshell = { n: number; l: string; e: number };

const madelung = (a: Subshell, b: Subshell): number => {
  const la = L_INDEX[a.l] ?? 0;
  const lb = L_INDEX[b.l] ?? 0;
  return a.n + la - (b.n + lb) || a.n - b.n;
};

const fmtSubshells = (list: Subshell[]): string => list.map((s) => `${s.n}${s.l}${s.e}`).join(' ');

function expandConfig(config: string): Subshell[] {
  const core = /^\[([A-Z][a-z]?)\]/.exec(config);
  const own = [...config.matchAll(/(\d)([spdfg])(\d{1,2})/g)].map((m) => ({
    n: Number(m[1]),
    l: m[2] ?? 's',
    e: Number(m[3]),
  }));
  if (!core?.[1]) return own;
  const coreConfig = CORES[core[1]];
  if (coreConfig === undefined) throw new Error(`núcleo desconocido ${core[1]}`);
  // El núcleo de un gas noble contiene solo subcapas completas; se expande recursivamente.
  return [...expandConfig(coreConfig.replace(/^\[([A-Z][a-z]?)\] /, '[$1]')), ...own];
}

export function electronConfigs(raw: string): { full: string; short: string; predicted: boolean; shells: number[] } {
  const predicted = /predicted/i.test(raw);
  const clean = raw.replace(/\(.*?\)/g, '').trim();
  const core = /^\[([A-Z][a-z]?)\]/.exec(clean)?.[1];
  const own = [...clean.matchAll(/(\d)([spdfg])(\d{1,2})/g)].map((m) => ({
    n: Number(m[1]),
    l: m[2] ?? 's',
    e: Number(m[3]),
  }));
  // Abreviada: orden por capa (n, luego l), como la publica NIST: [Xe] 4f14 5d10 6s1.
  own.sort((a, b) => a.n - b.n || (L_INDEX[a.l] ?? 0) - (L_INDEX[b.l] ?? 0));
  // Completa: orden de llenado de Madelung (diagrama de Moeller), como se enseña en la escuela.
  const full = expandConfig(clean).sort(madelung);
  const shells: number[] = [];
  for (const s of full) shells[s.n - 1] = (shells[s.n - 1] ?? 0) + s.e;
  for (let i = 0; i < shells.length; i++) shells[i] ??= 0;
  return {
    full: fmtSubshells(full),
    short: core ? `[${core}] ${fmtSubshells(own)}`.trim() : fmtSubshells(own),
    predicted,
    shells: shells.filter((n, i) => n > 0 || i < shells.length - 1),
  };
}

// ───────────────────────── lectura de fuentes ─────────────────────────

interface PubChemTable {
  Table: { Columns: { Column: string[] }; Row: { Cell: string[] }[] };
}

function loadPubChemTable(): Map<number, Record<string, string>> {
  const t = (readJson(RAW, 'pubchem-periodictable.json') as PubChemTable).Table;
  const cols = t.Columns.Column;
  const out = new Map<number, Record<string, string>>();
  for (const row of t.Row) {
    const rec: Record<string, string> = {};
    cols.forEach((c, i) => (rec[c] = row.Cell[i] ?? ''));
    out.set(Number(rec.AtomicNumber), rec);
  }
  return out;
}

interface FlatInfo {
  path: string;
  name: string | null;
  text: string | null;
  numbers: number[] | null;
  unit: string | null;
  source: string | null;
}

let pubchemCache: Record<string, FlatInfo[]> | null = null;
const pubchemElements = (): Record<string, FlatInfo[]> =>
  (pubchemCache ??= JSON.parse(
    gunzipSync(readFileSync(join(RAW, 'pubchem-elements.json.gz'))).toString('utf8'),
  ) as Record<string, FlatInfo[]>);

const pugFind = (z: number, path: string, name: string | null, source?: string): FlatInfo | undefined =>
  pubchemElements()[String(z)]?.find(
    (i) =>
      i.path === path &&
      (name === null || i.name === name) &&
      (source === undefined || (i.source ?? '').startsWith(source)),
  );

/** Tablas columnares de PUG View: cada `name` es una columna cuyos valores separa " | ". */
const pugColumn = (z: number, path: string, name: string): string[] | null => {
  const info = pugFind(z, path, name);
  return info?.text ? info.text.split(' | ') : null;
};

interface NistIsotope {
  a: number;
  mass: number | null;
  abundance: number | null;
}
interface NistElement {
  standardWeight: string;
  isotopes: NistIsotope[];
}

function loadNistCompositions(): Map<number, NistElement> {
  const text = read(RAW, 'nist-compositions.txt');
  const out = new Map<number, NistElement>();
  const blocks = text.split(/\n\s*\n/).filter((b) => b.includes('Atomic Number ='));
  for (const block of blocks) {
    const field = (key: string): string => decodeEntities(new RegExp(`${key} = (.*)`).exec(block)?.[1] ?? '').trim();
    const z = Number(field('Atomic Number'));
    const comp = field('Isotopic Composition');
    let abundance: number | null = null;
    const interval = /^\[([\d.]+),\s*([\d.]+)\]/.exec(comp);
    if (interval) abundance = (Number(interval[1]) + Number(interval[2])) / 2;
    else if (comp !== '') abundance = leadingNumber(comp);
    const entry = out.get(z) ?? { standardWeight: field('Standard Atomic Weight'), isotopes: [] };
    entry.isotopes.push({
      a: Number(field('Mass Number')),
      mass: leadingNumber(field('Relative Atomic Mass')),
      abundance,
    });
    out.set(z, entry);
  }
  return out;
}

function loadNistIonization(): Map<number, number> {
  const out = new Map<number, number>();
  for (const line of read(RAW, 'nist-ionization.csv').split('\n').slice(1)) {
    const cells = line.split(',').map((c) => c.replace(/^"=""|"""$/g, '').replace(/^"|"$/g, ''));
    const z = Number(cells[0]);
    const ie = num(cells[5]);
    if (Number.isInteger(z) && z >= 1 && ie !== null) out.set(z, ie);
  }
  return out;
}

function loadCiaaw(file: string): Map<number, string> {
  const html = read(RAW, file);
  const out = new Map<number, string>();
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => stripTags(m[1] ?? ''));
    const z = Number(cells[0]);
    if (Number.isInteger(z) && z >= 1 && z <= 118 && cells[3] !== undefined) out.set(z, cells[3]);
  }
  return out;
}

// ───────────────────────── armado ─────────────────────────

const CATEGORY_MAP: Readonly<Record<string, Category>> = {
  'Alkali metal': 'alkali-metal',
  'Alkaline earth metal': 'alkaline-earth-metal',
  'Transition metal': 'transition-metal',
  'Post-transition metal': 'post-transition-metal',
  Metalloid: 'metalloid',
  Nonmetal: 'nonmetal',
  Halogen: 'halogen',
  'Noble gas': 'noble-gas',
  Lanthanide: 'lanthanide',
  Actinide: 'actinide',
};

function parsePhase(s: string): { phase: Phase | null; predicted: Phase | null } {
  const m = /^(Expected to be an? )?(Solid|Liquid|Gas)$/i.exec(s.trim());
  if (!m?.[2]) return { phase: null, predicted: null };
  const phase = m[2].toLowerCase() as Phase;
  return m[1] ? { phase: null, predicted: phase } : { phase, predicted: null };
}

interface AmdcNuclide {
  a: number;
  ground: boolean;
  halfLife: number | 'stable' | null;
  mass: number | null;
}

function amdcNuclides(z: number, symbol: string): AmdcNuclide[] {
  const path = 'Isotopes > Atomic Mass, Half Life, and Decay';
  const nuclides = pugColumn(z, path, 'Nuclide') ?? [];
  const masses = pugColumn(z, path, 'Atomic Mass and Uncertainty [u]') ?? [];
  const halves = pugColumn(z, path, 'Half Life and Uncertainty') ?? [];
  return nuclides.flatMap((n, i) => {
    // "16O" es el estado fundamental; "16Op", "234Um" son isómeros.
    const m = /^(\d+)([A-Za-z]+)$/.exec(n.trim());
    if (!m?.[2]?.startsWith(symbol)) return [];
    return [
      {
        a: Number(m[1]),
        ground: m[2] === symbol,
        halfLife: parseHalfLife(halves[i] ?? ''),
        mass: leadingNumber(masses[i] ?? ''),
      },
    ];
  });
}

function buildIsotopes(z: number, symbol: string, nist: NistElement | undefined): Isotope[] {
  const amdc = amdcNuclides(z, symbol).filter((n) => n.ground);
  const byA = new Map(amdc.map((n) => [n.a, n]));
  const natural = (nist?.isotopes ?? []).filter((i) => i.abundance !== null && i.abundance > 0);
  if (natural.length > 0) {
    return natural.map((i) => {
      const h = byA.get(i.a)?.halfLife ?? null;
      return {
        a: i.a,
        mass: i.mass,
        abundance: i.abundance,
        stable: h === 'stable',
        halfLife: typeof h === 'number' ? h : null,
      };
    });
  }
  // Sin isótopos naturales: los tres de mayor semidesintegración conocida.
  return amdc
    .filter((n): n is AmdcNuclide & { halfLife: number } => typeof n.halfLife === 'number')
    .sort((p, q) => q.halfLife - p.halfLife)
    .slice(0, 3)
    .sort((p, q) => p.a - q.a)
    .map((n) => ({ a: n.a, mass: n.mass, abundance: null, stable: false, halfLife: n.halfLife }));
}

function longestLived(z: number, symbol: string): number | null {
  const best = amdcNuclides(z, symbol)
    .filter((n): n is AmdcNuclide & { halfLife: number } => n.ground && typeof n.halfLife === 'number')
    .sort((p, q) => q.halfLife - p.halfLife)[0];
  return best?.a ?? null;
}

function covalentRadius(z: number): number | null {
  const info = pugFind(z, 'Properties > Atomic Radius', 'Covalent Atomic Radius');
  if (!info) return null;
  if (info.numbers?.[0] !== undefined) return info.numbers[0];
  return info.text ? leadingNumber(info.text) : null;
}

function crustAbundance(z: number): number | null {
  const text = pugFind(z, 'Properties > Estimated Crustal Abundance', null)?.text;
  return text && /milligrams per kilogram/.test(text) ? parseSciText(text) : null;
}

function parseOxidation(s: string): number[] {
  return [...s.matchAll(/[+-]?\d+/g)].map((m) => Number(m[0])).filter((n) => Number.isInteger(n));
}

interface Names {
  [z: string]: { es: string; aliases: string[] };
}
interface EditorialTexts {
  [z: string]: { uses: string | null; fact: string | null };
}
interface Discoverers {
  [z: string]: string | { es: string; en: string } | null;
}
interface Override {
  year?: number | null;
  antiquity?: boolean;
  source: string;
}

function main(): void {
  const pubchem = loadPubChemTable();
  const nist = loadNistCompositions();
  const ionization = loadNistIonization();
  const abridged = loadCiaaw('ciaaw-abridged.html');
  const standard = loadCiaaw('ciaaw-standard.html');
  const names = readJson(EDITORIAL, 'names.es.json') as Names;
  const discoverers = readJson(EDITORIAL, 'discoverers.json') as Discoverers;
  const aliasesEn = readJson(EDITORIAL, 'aliases.en.json') as Record<string, string[]>;
  const overrides = readJson(EDITORIAL, 'overrides.json') as Record<string, Override>;
  const editorial = {
    es: readJson(EDITORIAL, 'texts.es.json') as EditorialTexts,
    en: readJson(EDITORIAL, 'texts.en.json') as EditorialTexts,
  };

  const elements: Element[] = [];
  const texts: Record<'es' | 'en', Record<string, ElementText>> = { es: {}, en: {} };
  const warnings: string[] = [];

  for (let z = 1; z <= 118; z++) {
    const p = pubchem.get(z);
    if (!p) throw new Error(`PubChem no tiene Z=${z}`);
    const pos = gridPosition(z);
    const category = CATEGORY_MAP[p.GroupBlock ?? ''];
    if (!category || !CATEGORIES.includes(category))
      throw new Error(`categoría desconocida para Z=${z}: ${p.GroupBlock}`);

    // Peso atómico: valor abreviado de CIAAW; intervalo de la tabla estándar.
    const abr = abridged.get(z) ?? '—';
    const atomicWeight = abr.startsWith('—') ? null : leadingNumber(abr);
    const std = standard.get(z) ?? '';
    const iv = /^\[\s*([\d\s\u00a0.]+),\s*([\d\s\u00a0.]+)\]/.exec(std);
    const atomicWeightInterval: [number, number] | null = iv
      ? [Number((iv[1] ?? '').replace(/[\s\u00a0]/g, '')), Number((iv[2] ?? '').replace(/[\s\u00a0]/g, ''))]
      : null;
    const nistEl = nist.get(z);
    let massNumber: number | null = null;
    if (atomicWeight === null) {
      const bracket = /^\[(\d+)\]$/.exec(nistEl?.standardWeight ?? '');
      massNumber = bracket ? Number(bracket[1]) : longestLived(z, p.Symbol ?? '');
    }

    const cfg = electronConfigs(p.ElectronConfiguration ?? '');
    const { phase, predicted } = parsePhase(p.StandardState ?? '');
    const mp = num(p.MeltingPoint);
    const bp = num(p.BoilingPoint);
    const yearRaw = (p.YearDiscovered ?? '').trim();
    // Correcciones puntuales, cada una con su fuente citada en data/editorial/overrides.json.
    const ov = overrides[String(z)];

    // Comprobación cruzada: grupo y período de Jefferson Lab (vía PubChem) contra la posición calculada.
    const jlGroup = pugFind(z, 'Properties > Element Group Number', null)?.text;
    const jlPeriod = pugFind(z, 'Properties > Element Period Number', null)?.text;
    if (jlPeriod && Number(jlPeriod) !== pos.period)
      warnings.push(`Z=${z}: período ${pos.period} ≠ Jefferson Lab ${jlPeriod}`);
    if (pos.group !== null && jlGroup && /^\d+$/.test(jlGroup) && Number(jlGroup) !== pos.group)
      warnings.push(`Z=${z}: grupo ${pos.group} ≠ Jefferson Lab ${jlGroup}`);
    if (p.Symbol === undefined || p.Symbol === '') throw new Error(`Z=${z} sin símbolo`);

    elements.push({
      z,
      symbol: p.Symbol,
      atomicWeight,
      atomicWeightInterval,
      massNumber,
      group: pos.group,
      period: pos.period,
      block: pos.block,
      category,
      x: pos.x,
      y: pos.y,
      electronConfiguration: cfg.full,
      electronConfigurationShort: cfg.short,
      shells: cfg.shells,
      electronegativity: num(p.Electronegativity),
      atomicRadius: num(p.AtomicRadius),
      covalentRadius: covalentRadius(z),
      ionizationEnergy: ionization.get(z) ?? num(p.IonizationEnergy),
      electronAffinity: num(p.ElectronAffinity),
      oxidationStates: parseOxidation(p.OxidationStates ?? ''),
      phase,
      predictedPhase: predicted,
      meltingPoint: mp,
      boilingPoint: bp,
      sublimes: mp !== null && bp !== null && bp < mp,
      density: num(p.Density),
      year: ov?.year !== undefined ? ov.year : /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null,
      antiquity: ov?.antiquity ?? /^ancient$/i.test(yearRaw),
      isotopes: buildIsotopes(z, p.Symbol, nistEl),
      crustAbundance: crustAbundance(z),
    });

    const es = editorial.es[String(z)];
    const en = editorial.en[String(z)];
    const nameEs = names[String(z)];
    const disc = discoverers[String(z)] ?? null;
    const discEs = disc === null ? null : typeof disc === 'string' ? disc : disc.es;
    const discEn = disc === null ? null : typeof disc === 'string' ? disc : disc.en;
    texts.es[String(z)] = {
      name: nameEs?.es ?? '',
      aliases: nameEs?.aliases ?? [],
      discoverers: discEs,
      uses: es?.uses ?? null,
      fact: es?.fact ?? null,
    };
    texts.en[String(z)] = {
      name: p.Name ?? '',
      aliases: aliasesEn[String(z)] ?? [],
      discoverers: discEn,
      uses: en?.uses ?? null,
      fact: en?.fact ?? null,
    };
  }

  const issues = [...validateElements(elements), ...validateTexts(texts.es, 'es'), ...validateTexts(texts.en, 'en')];
  for (const w of warnings) console.warn(`⚠ ${w}`);
  if (issues.length > 0) {
    for (const i of issues.slice(0, 60)) console.error(`✗ Z=${i.z ?? '-'} ${i.field}: ${i.message}`);
    console.error(`${issues.length} problemas; no se escribió nada.`);
    process.exit(1);
  }

  const manifest = readJson(RAW, 'manifest.json') as unknown[];
  writeFileSync(join(ROOT, 'src', 'data', 'elements.json'), JSON.stringify(elements) + '\n');
  writeFileSync(join(ROOT, 'src', 'data', 'texts.es.json'), JSON.stringify(texts.es) + '\n');
  writeFileSync(join(ROOT, 'src', 'data', 'texts.en.json'), JSON.stringify(texts.en) + '\n');
  writeFileSync(
    join(ROOT, 'data', 'sources.json'),
    JSON.stringify({ snapshot: manifest, fields: FIELD_SOURCES, overrides }, null, 2) + '\n',
  );

  const nulls = Object.fromEntries(
    Object.keys(elements[0] ?? {}).map((k) => [k, elements.filter((e) => e[k as keyof Element] === null).length]),
  );
  console.log('✓ 118 elementos válidos. Valores nulos por campo:', JSON.stringify(nulls));
}

/** Procedencia de cada campo. Se publica en data/sources.json y en el README. */
const FIELD_SOURCES: Readonly<Record<keyof Element | 'name.en' | 'name.es' | 'discoverers' | 'uses' | 'fact', string>> =
  {
    z: 'PubChem periodic table (AtomicNumber)',
    symbol: 'PubChem periodic table (Symbol)',
    atomicWeight: 'IUPAC CIAAW, pesos atómicos estándar abreviados (ciaaw-abridged.html)',
    atomicWeightInterval: 'IUPAC CIAAW, pesos atómicos estándar (intervalos, ciaaw-standard.html)',
    massNumber:
      'NIST Atomic Weights and Isotopic Compositions ([A] entre corchetes); si falta, isótopo fundamental de mayor semidesintegración según AMDC/IAEA (vía PubChem)',
    group: 'Derivado de Z (convención La–Lu/Ac–Lr en fila f); contrastado con Jefferson Lab vía PubChem',
    period: 'Derivado de Z; contrastado con Jefferson Lab vía PubChem',
    block: 'Derivado de la posición en la grilla',
    category: 'PubChem periodic table (GroupBlock)',
    x: 'Derivado de Z',
    y: 'Derivado de Z',
    electronConfiguration: 'Expandida a partir de PubChem (ElectronConfiguration), orden de Madelung',
    electronConfigurationShort: 'PubChem periodic table (ElectronConfiguration), ordenada por capa como en NIST',
    shells: 'Derivado de la configuración electrónica completa',
    electronegativity: 'PubChem periodic table (Electronegativity, escala de Pauling)',
    atomicRadius: 'PubChem periodic table (AtomicRadius, van der Waals, pm)',
    covalentRadius: 'PubChem Elements, "Covalent Atomic Radius" (primer valor listado)',
    ionizationEnergy:
      'NIST Atomic Spectra Database, primera energía de ionización (eV); fuera de su cobertura, PubChem',
    electronAffinity: 'PubChem periodic table (ElectronAffinity, eV)',
    oxidationStates: 'PubChem periodic table (OxidationStates, estados comunes)',
    phase: 'PubChem periodic table (StandardState)',
    predictedPhase: 'PubChem periodic table (StandardState "Expected to be…")',
    meltingPoint: 'PubChem periodic table (MeltingPoint, K)',
    boilingPoint: 'PubChem periodic table (BoilingPoint, K)',
    sublimes: 'Derivado: ebullición/sublimación < fusión en PubChem',
    density: 'PubChem periodic table (Density, g/cm³)',
    year: 'PubChem periodic table (YearDiscovered); correcciones con fuente en data/editorial/overrides.json',
    antiquity: 'PubChem periodic table (YearDiscovered = "Ancient")',
    discoverers:
      'Editorial, extraído de la historia de Jefferson Lab publicada en PubChem (data/editorial/discoverers.json)',
    isotopes:
      'NIST Atomic Weights and Isotopic Compositions (abundancias y masas); semidesintegración de AMDC/IAEA vía PubChem',
    crustAbundance: 'Jefferson Lab, "Estimated Crustal Abundance" vía PubChem (mg/kg)',
    'name.en': 'PubChem periodic table (Name)',
    'name.es': 'Nomenclatura de la RSEQ/IUPAC en español (data/editorial/names.es.json)',
    uses: 'Editorial, redactado a partir de las secciones Uses de Jefferson Lab y Los Alamos en PubChem',
    fact: 'Editorial, redactado a partir de las secciones History/Description de PubChem',
  };

if (process.argv[1]?.endsWith('build-data.ts')) main();
