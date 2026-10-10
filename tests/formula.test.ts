import { describe, expect, it } from 'vitest';
import { hillFormula, parseFormula, type FormulaErrorCode, type MassLookup } from '../src/lib/formula.ts';

/**
 * Pesos atómicos estándar abreviados (IUPAC/CIAAW) para un juego fijo de pruebas,
 * independiente del pipeline de datos. Tc no tiene peso estándar: usa A = 97.
 */
const MASSES: Readonly<Record<string, number>> = {
  H: 1.008,
  C: 12.011,
  N: 14.007,
  O: 15.999,
  Na: 22.99,
  Mg: 24.305,
  Al: 26.982,
  P: 30.974,
  S: 32.06,
  Cl: 35.45,
  K: 39.098,
  Ca: 40.078,
  Co: 58.933,
  Fe: 55.845,
  Cu: 63.546,
  Pt: 195.08,
  U: 238.03,
};
const lookup: MassLookup = (s) =>
  s === 'Tc'
    ? { mass: 97, approximate: true }
    : MASSES[s] === undefined
      ? undefined
      : { mass: MASSES[s], approximate: false };

function mass(f: string): number {
  const r = parseFormula(f, lookup);
  if (!r.ok) throw new Error(`${f}: ${r.error.code}`);
  return r.value.molarMass;
}

function errorOf(f: string): { code: FormulaErrorCode; index: number; token: string } {
  const r = parseFormula(f, lookup);
  if (r.ok) throw new Error(`${f} debería fallar`);
  return r.error;
}

describe('parseFormula — fórmulas válidas', () => {
  it('agua', () => {
    expect(mass('H2O')).toBeCloseTo(18.015, 3);
  });
  it('elemento solo y diatómico', () => {
    expect(mass('Fe')).toBeCloseTo(55.845, 3);
    expect(mass('O2')).toBeCloseTo(31.998, 3);
  });
  it('distingue Co (cobalto) de CO (monóxido de carbono)', () => {
    expect(mass('Co')).toBeCloseTo(58.933, 3);
    expect(mass('CO')).toBeCloseTo(28.01, 3);
  });
  it('glucosa', () => {
    expect(mass('C6H12O6')).toBeCloseTo(180.156, 3);
  });
  it('paréntesis con multiplicador: Ca(OH)2', () => {
    expect(mass('Ca(OH)2')).toBeCloseTo(74.092, 3);
  });
  it('paréntesis anidados: Al2(SO4)3 y Ca3(PO4)2', () => {
    expect(mass('Al2(SO4)3')).toBeCloseTo(342.132, 2);
    expect(mass('Ca3(PO4)2')).toBeCloseTo(310.174, 2);
  });
  it('corchetes con paréntesis dentro: [Co(NH3)6]Cl3', () => {
    expect(mass('[Co(NH3)6]Cl3')).toBeCloseTo(267.469, 2);
  });
  it('llaves, corchetes y paréntesis anidados', () => {
    expect(mass('{[(CH3)2]2}3')).toBeCloseTo(12 * 15.035, 3);
  });
  it('hidrato con punto medio: CuSO4·5H2O', () => {
    expect(mass('CuSO4·5H2O')).toBeCloseTo(249.677, 2);
  });
  it('separadores alternativos de hidrato y espacios', () => {
    const ref = mass('CuSO4·5H2O');
    expect(mass('CuSO4*5H2O')).toBeCloseTo(ref, 9);
    expect(mass('CuSO4.5H2O')).toBeCloseTo(ref, 9);
    expect(mass('CuSO4 • 5 H2O')).toBeCloseTo(ref, 9);
  });
  it('hidrato múltiple: MgSO4·7H2O y Na2CO3·10H2O', () => {
    expect(mass('MgSO4·7H2O')).toBeCloseTo(246.466, 2);
    expect(mass('Na2CO3·10H2O')).toBeCloseTo(286.138, 2);
  });
  it('subíndices Unicode: H₂SO₄', () => {
    expect(mass('H₂SO₄')).toBeCloseTo(98.07, 2);
  });
  it('coeficiente inicial multiplica todo el segmento', () => {
    expect(mass('2H2O')).toBeCloseTo(2 * 18.015, 3);
  });
  it('elemento repetido se agrega: CH3COOH', () => {
    const r = parseFormula('CH3COOH', lookup);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.hill).toBe('C2H4O2');
      expect(r.value.molarMass).toBeCloseTo(60.052, 3);
    }
  });
  it('desglose porcentual suma 100 y respeta el orden de aparición', () => {
    const r = parseFormula('H2SO4', lookup);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.breakdown.map((b) => b.symbol)).toEqual(['H', 'S', 'O']);
    const total = r.value.breakdown.reduce((acc, b) => acc + b.percent, 0);
    expect(total).toBeCloseTo(100, 9);
    const o = r.value.breakdown.find((b) => b.symbol === 'O');
    expect(o?.count).toBe(4);
    expect(o?.percent).toBeCloseTo(65.25, 1);
  });
  it('marca como aproximada una fórmula con un elemento sin peso estándar', () => {
    const r = parseFormula('TcO4', lookup);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.approximate).toBe(true);
      expect(r.value.molarMass).toBeCloseTo(97 + 4 * 15.999, 3);
    }
  });
  it('fórmula grande: cisplatino Pt(NH3)2Cl2', () => {
    expect(mass('Pt(NH3)2Cl2')).toBeCloseTo(300.042, 2);
  });
});

describe('parseFormula — errores claros', () => {
  const cases: [string, FormulaErrorCode, number?][] = [
    ['', 'empty'],
    ['   ', 'empty'],
    ['Xx2', 'unknownElement', 0],
    ['h2o', 'lowercaseStart', 0],
    ['Ca(OH2', 'unclosedBracket', 2],
    ['CaOH)2', 'unexpectedCloser', 4],
    ['[Co(NH3]6)', 'mismatchedBracket', 7],
    ['Na()Cl', 'emptyGroup', 2],
    ['H0', 'zeroCount', 1],
    ['H2O·', 'danglingSeparator', 3],
    ['·H2O', 'danglingSeparator', 0],
    ['CuSO4··5H2O', 'danglingSeparator'],
    ['(2H)', 'misplacedNumber', 1],
    ['5', 'misplacedNumber', 0],
    ['SO4^2-', 'chargeNotSupported', 3],
    ['Na+', 'chargeNotSupported', 2],
    ['SO₄²⁻', 'chargeNotSupported', 3],
    ['H2O!', 'unexpectedChar', 3],
    ['C99999', 'countTooLarge', 1],
  ];
  for (const [input, code, index] of cases) {
    it(`${JSON.stringify(input)} → ${code}`, () => {
      const e = errorOf(input);
      expect(e.code).toBe(code);
      if (index !== undefined) expect(e.index).toBe(index);
    });
  }
  it('fórmula demasiado larga', () => {
    expect(errorOf('H'.repeat(201)).code).toBe('tooLong');
  });
  it('informa el símbolo desconocido', () => {
    expect(errorOf('NaQ').token).toBe('Q');
  });
});

describe('hillFormula', () => {
  it('con carbono: C, H y luego alfabético', () => {
    expect(
      hillFormula(
        new Map([
          ['O', 1],
          ['H', 6],
          ['C', 2],
          ['N', 1],
        ]),
      ),
    ).toBe('C2H6NO');
  });
  it('sin carbono: todo alfabético', () => {
    expect(
      hillFormula(
        new Map([
          ['O', 4],
          ['S', 1],
          ['H', 2],
        ]),
      ),
    ).toBe('H2O4S');
  });
});
