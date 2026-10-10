/**
 * Parser de fórmulas químicas para la calculadora de masa molar.
 *
 * Gramática (descenso recursivo):
 *   formula  := segment (SEP segment)*
 *   segment  := NUMBER? sequence            // el número es el coeficiente del hidrato: ·5H2O
 *   sequence := unit+
 *   unit     := (ELEMENT | OPEN sequence CLOSE) NUMBER?
 *
 * Soporta (), [] y {} anidados con cierre correspondiente, subíndices Unicode (H₂O),
 * separadores de hidrato · • ∙ ⋅ * . y espacios. Nunca lanza excepciones: devuelve
 * un `Result` con un código de error traducible y la posición del problema.
 */

export type FormulaErrorCode =
  | 'empty'
  | 'tooLong'
  | 'unexpectedChar'
  | 'unknownElement'
  | 'lowercaseStart'
  | 'unclosedBracket'
  | 'unexpectedCloser'
  | 'mismatchedBracket'
  | 'emptyGroup'
  | 'zeroCount'
  | 'countTooLarge'
  | 'misplacedNumber'
  | 'danglingSeparator'
  | 'chargeNotSupported';

export interface FormulaError {
  readonly code: FormulaErrorCode;
  /** Índice (0-based) en la entrada normalizada. */
  readonly index: number;
  /** Fragmento problemático, para mostrarlo en el mensaje. */
  readonly token: string;
}

export interface MassInfo {
  /** Masa a usar (u). */
  readonly mass: number;
  /** true si es el número másico del isótopo más estable (no hay peso atómico estándar). */
  readonly approximate: boolean;
}

export type MassLookup = (symbol: string) => MassInfo | undefined;

export interface BreakdownRow {
  readonly symbol: string;
  readonly count: number;
  /** Aporte a la masa molar (g/mol). */
  readonly mass: number;
  /** Porcentaje en masa (0–100). */
  readonly percent: number;
  readonly approximate: boolean;
}

export interface FormulaResult {
  /** Fórmula normalizada tal como se interpretó. */
  readonly normalized: string;
  /** Fórmula empírica agregada en notación de Hill. */
  readonly hill: string;
  /** Masa molar (g/mol). */
  readonly molarMass: number;
  /** Filas en orden de primera aparición. */
  readonly breakdown: readonly BreakdownRow[];
  /** Algún elemento no tiene peso atómico estándar. */
  readonly approximate: boolean;
}

export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export const MAX_FORMULA_LENGTH = 200;
export const MAX_COUNT = 9999;

const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';
const SUPERSCRIPT_CHARGE = /[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]/;
const SEPARATORS = new Set(['·', '•', '∙', '⋅', '*', '.']);
const OPENERS: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}' };
const CLOSERS = new Set([')', ']', '}']);

type Token =
  | { readonly t: 'el'; readonly v: string; readonly i: number }
  | { readonly t: 'num'; readonly v: number; readonly raw: string; readonly i: number }
  | { readonly t: 'open'; readonly v: string; readonly i: number }
  | { readonly t: 'close'; readonly v: string; readonly i: number }
  | { readonly t: 'sep'; readonly i: number };

const err = (code: FormulaErrorCode, index: number, token: string): { ok: false; error: FormulaError } => ({
  ok: false,
  error: { code, index, token },
});

/** Normaliza subíndices Unicode y elimina espacios. */
export function normalizeFormula(input: string): string {
  let out = '';
  for (const ch of input.normalize('NFC')) {
    const sub = SUBSCRIPTS.indexOf(ch);
    if (sub >= 0) out += String(sub);
    else if (!/\s/.test(ch)) out += ch;
  }
  return out;
}

function tokenize(s: string, isElement: (sym: string) => boolean): Result<Token[], FormulaError> {
  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s.charAt(i);
    if (ch >= 'A' && ch <= 'Z') {
      const next = s.charAt(i + 1);
      const sym = next >= 'a' && next <= 'z' ? ch + next : ch;
      if (!isElement(sym)) return err('unknownElement', i, sym);
      tokens.push({ t: 'el', v: sym, i });
      i += sym.length;
    } else if (ch >= 'a' && ch <= 'z') {
      return err('lowercaseStart', i, ch);
    } else if (ch >= '0' && ch <= '9') {
      let j = i;
      while (j < s.length && s.charAt(j) >= '0' && s.charAt(j) <= '9') j++;
      const raw = s.slice(i, j);
      tokens.push({ t: 'num', v: Number(raw), raw, i });
      i = j;
    } else if (ch in OPENERS) {
      tokens.push({ t: 'open', v: ch, i });
      i++;
    } else if (CLOSERS.has(ch)) {
      tokens.push({ t: 'close', v: ch, i });
      i++;
    } else if (SEPARATORS.has(ch)) {
      tokens.push({ t: 'sep', i });
      i++;
    } else if (ch === '+' || ch === '-' || ch === '^' || ch === '−' || SUPERSCRIPT_CHARGE.test(ch)) {
      return err('chargeNotSupported', i, ch);
    } else {
      return err('unexpectedChar', i, ch);
    }
  }
  return { ok: true, value: tokens };
}

type Counts = Map<string, number>;

function addInto(target: Counts, source: Counts, factor: number): void {
  for (const [sym, n] of source) target.set(sym, (target.get(sym) ?? 0) + n * factor);
}

class Parser {
  private pos = 0;
  constructor(
    private readonly tokens: readonly Token[],
    private readonly length: number,
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  /** Lee un multiplicador opcional después de un elemento o grupo. */
  private count(): Result<number, FormulaError> {
    const tok = this.peek();
    if (tok?.t !== 'num') return { ok: true, value: 1 };
    this.pos++;
    if (tok.v === 0) return err('zeroCount', tok.i, tok.raw);
    if (tok.v > MAX_COUNT) return err('countTooLarge', tok.i, tok.raw);
    return { ok: true, value: tok.v };
  }

  private sequence(closer: string | null, openIndex: number): Result<Counts, FormulaError> {
    const counts: Counts = new Map();
    let units = 0;
    for (;;) {
      const tok = this.peek();
      if (!tok || tok.t === 'sep') break;
      if (tok.t === 'close') {
        if (closer === null) return err('unexpectedCloser', tok.i, tok.v);
        break;
      }
      if (tok.t === 'num') {
        return err('misplacedNumber', tok.i, tok.raw);
      }
      if (tok.t === 'el') {
        this.pos++;
        const n = this.count();
        if (!n.ok) return n;
        counts.set(tok.v, (counts.get(tok.v) ?? 0) + n.value);
      } else {
        // open
        this.pos++;
        const expected = OPENERS[tok.v] ?? ')';
        const inner = this.sequence(expected, tok.i);
        if (!inner.ok) return inner;
        const close = this.peek();
        if (!close || close.t !== 'close') return err('unclosedBracket', tok.i, tok.v);
        if (close.v !== expected) return err('mismatchedBracket', close.i, close.v);
        this.pos++;
        const n = this.count();
        if (!n.ok) return n;
        addInto(counts, inner.value, n.value);
      }
      units++;
    }
    if (units === 0 && closer !== null && this.peek()?.t === 'close') {
      return err('emptyGroup', openIndex, '');
    }
    return { ok: true, value: counts };
  }

  parse(): Result<Counts, FormulaError> {
    const total: Counts = new Map();
    for (;;) {
      const start = this.peek();
      let coefficient = 1;
      if (start?.t === 'num') {
        this.pos++;
        if (start.v === 0) return err('zeroCount', start.i, start.raw);
        if (start.v > MAX_COUNT) return err('countTooLarge', start.i, start.raw);
        coefficient = start.v;
      }
      const segStart = this.peek();
      const seq = this.sequence(null, segStart?.i ?? this.length);
      if (!seq.ok) return seq;
      if (seq.value.size === 0) {
        const at = segStart?.i ?? this.length;
        return this.pos === 0 && this.tokens.length === 0
          ? err('empty', 0, '')
          : start?.t === 'num' && !segStart
            ? err('misplacedNumber', start.i, start.raw)
            : err('danglingSeparator', Math.max(0, at - 1), '·');
      }
      addInto(total, seq.value, coefficient);
      const next = this.peek();
      if (!next) break;
      if (next.t === 'sep') {
        this.pos++;
        if (!this.peek()) return err('danglingSeparator', next.i, '·');
        continue;
      }
      // Solo puede quedar un cierre sin apertura.
      return err('unexpectedCloser', next.i, next.t === 'close' ? next.v : '');
    }
    return { ok: true, value: total };
  }
}

/** Notación de Hill: C, luego H, luego el resto alfabético (si no hay C, todo alfabético). */
export function hillFormula(counts: ReadonlyMap<string, number>): string {
  const syms = [...counts.keys()];
  const hasC = counts.has('C');
  syms.sort((a, b) => {
    if (hasC) {
      const rank = (s: string): number => (s === 'C' ? 0 : s === 'H' ? 1 : 2);
      const d = rank(a) - rank(b);
      if (d !== 0) return d;
    }
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return syms.map((s) => (counts.get(s) === 1 ? s : `${s}${String(counts.get(s))}`)).join('');
}

export function parseFormula(input: string, lookup: MassLookup): Result<FormulaResult, FormulaError> {
  const normalized = normalizeFormula(input);
  if (normalized.length === 0) return err('empty', 0, '');
  if (normalized.length > MAX_FORMULA_LENGTH) return err('tooLong', MAX_FORMULA_LENGTH, '');

  const tokens = tokenize(normalized, (sym) => lookup(sym) !== undefined);
  if (!tokens.ok) return tokens;
  const counts = new Parser(tokens.value, normalized.length).parse();
  if (!counts.ok) return counts;

  let molarMass = 0;
  let approximate = false;
  const partial: Omit<BreakdownRow, 'percent'>[] = [];
  for (const [symbol, count] of counts.value) {
    const info = lookup(symbol);
    if (!info) return err('unknownElement', 0, symbol);
    const mass = info.mass * count;
    molarMass += mass;
    approximate ||= info.approximate;
    partial.push({ symbol, count, mass, approximate: info.approximate });
  }
  const breakdown = partial.map((r) => ({ ...r, percent: (r.mass / molarMass) * 100 }));
  return {
    ok: true,
    value: { normalized, hill: hillFormula(counts.value), molarMass, breakdown, approximate },
  };
}
