/**
 * Validación propia del dataset (sin dependencias). La usan scripts/build-data.ts,
 * que se niega a escribir datos inválidos, y tests/data.test.ts.
 */
import { BLOCKS, CATEGORIES, PHASES, type Element, type ElementTexts } from './types.ts';

type Check = (v: unknown) => boolean;

const isNum: Check = (v) => typeof v === 'number' && Number.isFinite(v);
const nullable =
  (c: Check): Check =>
  (v) =>
    v === null || c(v);
const inRange =
  (min: number, max: number): Check =>
  (v) =>
    isNum(v) && (v as number) >= min && (v as number) <= max;
const isInt: Check = (v) => Number.isInteger(v);
const isStr: Check = (v) => typeof v === 'string' && v.length > 0;
const isBool: Check = (v) => typeof v === 'boolean';
const oneOf =
  (values: readonly string[]): Check =>
  (v) =>
    typeof v === 'string' && values.includes(v);

/**
 * Rangos físicos plausibles por campo: atrapan errores de unidades
 * (por ejemplo, kJ/mol en lugar de eV o °C en lugar de K).
 */
const FIELDS: Readonly<Record<keyof Element, Check>> = {
  z: (v) => isInt(v) && inRange(1, 118)(v),
  symbol: (v) => typeof v === 'string' && /^[A-Z][a-z]?$/.test(v),
  atomicWeight: nullable(inRange(1, 300)),
  atomicWeightInterval: (v) =>
    v === null ||
    (Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]) && (v[0] as number) < (v[1] as number)),
  massNumber: nullable((v) => isInt(v) && inRange(1, 300)(v)),
  group: nullable((v) => isInt(v) && inRange(1, 18)(v)),
  period: (v) => isInt(v) && inRange(1, 7)(v),
  block: oneOf(BLOCKS),
  category: oneOf(CATEGORIES),
  x: (v) => isInt(v) && inRange(1, 18)(v),
  y: (v) => isInt(v) && (inRange(1, 7)(v) || v === 9 || v === 10),
  electronConfiguration: (v) => typeof v === 'string' && /^(\d[spdfg]\d{1,2})( \d[spdfg]\d{1,2})*$/.test(v),
  electronConfigurationShort: (v) =>
    typeof v === 'string' && /^(\[[A-Z][a-z]?\] ?)?(\d[spdfg]\d{1,2})?( \d[spdfg]\d{1,2})*$/.test(v),
  shells: (v) => Array.isArray(v) && v.length >= 1 && v.length <= 7 && v.every((n) => isInt(n) && (n as number) > 0),
  electronegativity: nullable(inRange(0.5, 4.5)),
  atomicRadius: nullable(inRange(25, 400)),
  covalentRadius: nullable(inRange(20, 300)),
  ionizationEnergy: nullable(inRange(3, 25)),
  electronAffinity: nullable(inRange(-1, 4)),
  oxidationStates: (v) =>
    Array.isArray(v) && v.every((n) => isInt(n) && (n as number) >= -5 && (n as number) <= 9),
  phase: nullable(oneOf(PHASES)),
  predictedPhase: nullable(oneOf(PHASES)),
  meltingPoint: nullable(inRange(0.5, 4500)),
  boilingPoint: nullable(inRange(4, 6500)),
  sublimes: isBool,
  density: nullable(inRange(0.00005, 45)),
  year: nullable((v) => isInt(v) && inRange(1000, 2030)(v)),
  antiquity: isBool,
  isotopes: (v) =>
    Array.isArray(v) &&
    v.every((iso: unknown) => {
      if (typeof iso !== 'object' || iso === null) return false;
      const o = iso as Record<string, unknown>;
      return (
        isInt(o.a) &&
        nullable(inRange(1, 320))(o.mass) &&
        nullable(inRange(0, 1))(o.abundance) &&
        isBool(o.stable) &&
        nullable((h) => isNum(h) && (h as number) > 0)(o.halfLife)
      );
    }),
  crustAbundance: nullable(inRange(1e-15, 5e5)),
};

export interface Issue {
  readonly z: number | null;
  readonly field: string;
  readonly message: string;
}

export function validateElements(data: unknown): Issue[] {
  const issues: Issue[] = [];
  if (!Array.isArray(data)) return [{ z: null, field: '*', message: 'el dataset no es un array' }];
  if (data.length !== 118) issues.push({ z: null, field: '*', message: `se esperaban 118 elementos, hay ${data.length}` });

  const seenPos = new Map<string, number>();
  const seenSym = new Map<string, number>();
  data.forEach((raw: unknown, i) => {
    if (typeof raw !== 'object' || raw === null) {
      issues.push({ z: null, field: '*', message: `entrada ${i} no es un objeto` });
      return;
    }
    const el = raw as Record<string, unknown>;
    const z = typeof el.z === 'number' ? el.z : null;
    const add = (field: string, message: string): void => void issues.push({ z, field, message });

    for (const key of Object.keys(el)) if (!(key in FIELDS)) add(key, 'campo desconocido');
    for (const [key, check] of Object.entries(FIELDS)) {
      if (!(key in el)) add(key, 'falta el campo');
      else if (!check(el[key])) add(key, `valor inválido: ${JSON.stringify(el[key])}`);
    }
    if (z !== i + 1) add('z', `número atómico fuera de orden o con huecos (posición ${i + 1})`);

    const e = el as unknown as Element;
    const pos = `${e.x},${e.y}`;
    if (seenPos.has(pos)) add('x/y', `posición de grilla repetida con Z=${seenPos.get(pos)}`);
    seenPos.set(pos, e.z);
    if (seenSym.has(e.symbol)) add('symbol', `símbolo repetido con Z=${seenSym.get(e.symbol)}`);
    seenSym.set(e.symbol, e.z);

    // Coherencia interna.
    const shells: unknown = el.shells;
    if (Array.isArray(shells) && shells.every((n): n is number => typeof n === 'number')) {
      if (shells.reduce((a, b) => a + b, 0) !== e.z) add('shells', 'la suma de electrones por capa no coincide con Z');
    }
    if (typeof e.electronConfiguration === 'string') {
      const total = [...e.electronConfiguration.matchAll(/\d[spdfg](\d{1,2})/g)].reduce(
        (acc, m) => acc + Number(m[1]),
        0,
      );
      if (total !== e.z) add('electronConfiguration', `suma ${total} electrones, se esperaban ${e.z}`);
    }
    if (e.atomicWeight === null && e.massNumber === null) add('atomicWeight', 'sin peso atómico ni número másico');
    if (e.atomicWeightInterval && e.atomicWeight !== null) {
      const [lo, hi] = e.atomicWeightInterval;
      if (e.atomicWeight < lo - 0.01 || e.atomicWeight > hi + 0.01)
        add('atomicWeightInterval', 'el valor abreviado cae fuera del intervalo');
    }
    if (e.meltingPoint !== null && e.boilingPoint !== null && !e.sublimes && e.boilingPoint < e.meltingPoint)
      add('boilingPoint', 'ebullición menor que fusión sin marcar sublimación');
    if (e.phase !== null && e.predictedPhase !== null) add('predictedPhase', 'estado experimental y predicho a la vez');
    if (e.antiquity && e.year !== null) add('year', 'conocido desde la antigüedad pero con año');
    if ((e.y === 9 || e.y === 10) !== (e.group === null)) add('group', 'grupo inconsistente con la fila f');
    if (e.y <= 7 && e.y !== e.period) add('y', 'fila de grilla distinta del período');
    const isotopes: unknown = el.isotopes;
    const abundSum = Array.isArray(isotopes)
      ? isotopes.reduce((acc: number, iso: unknown) => {
          const a = typeof iso === 'object' && iso !== null ? (iso as { abundance?: unknown }).abundance : null;
          return acc + (typeof a === 'number' ? a : 0);
        }, 0)
      : 0;
    if (abundSum > 1.0005) add('isotopes', `las abundancias suman ${abundSum.toFixed(4)} (> 1)`);
  });
  return issues;
}

export function validateTexts(texts: unknown, lang: string): Issue[] {
  const issues: Issue[] = [];
  if (typeof texts !== 'object' || texts === null) return [{ z: null, field: lang, message: 'no es un objeto' }];
  const t = texts as ElementTexts;
  for (let z = 1; z <= 118; z++) {
    const entry = t[String(z)];
    if (!entry) {
      issues.push({ z, field: lang, message: 'falta el texto' });
      continue;
    }
    if (!isStr(entry.name)) issues.push({ z, field: `${lang}.name`, message: 'nombre vacío' });
    if (!Array.isArray(entry.aliases) || !entry.aliases.every(isStr))
      issues.push({ z, field: `${lang}.aliases`, message: 'alias inválidos' });
    for (const key of ['uses', 'fact', 'discoverers'] as const) {
      const v = entry[key];
      if (v !== null && (!isStr(v) || v.length > 320))
        issues.push({ z, field: `${lang}.${key}`, message: 'texto vacío o demasiado largo (> 320)' });
    }
  }
  if (Object.keys(t).length !== 118) issues.push({ z: null, field: lang, message: 'cantidad de entradas ≠ 118' });
  return issues;
}
