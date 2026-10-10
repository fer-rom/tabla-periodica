/**
 * Calculadora de masa molar: resultado en vivo mientras se escribe, desglose porcentual por
 * elemento y errores que señalan la posición exacta del problema.
 */
import { h } from '../lib/dom.ts';
import { escapeHtml } from '../lib/format.ts';
import { parseFormula, type FormulaError, type FormulaResult, type MassLookup } from '../lib/formula.ts';
import { bySymbol, nameOf, store, translator } from '../state.ts';
import { openElement } from './router.ts';

const EXAMPLES = ['H2O', 'C6H12O6', 'CuSO4·5H2O', 'Ca3(PO4)2', '[Co(NH3)6]Cl3', 'K4[Fe(CN)6]'];

const lookup: MassLookup = (symbol) => {
  const el = bySymbol.get(symbol.toLowerCase());
  if (el?.symbol !== symbol) return undefined; // distingue «Co» de «CO»
  if (el.atomicWeight !== null) return { mass: el.atomicWeight, approximate: false };
  if (el.massNumber !== null) return { mass: el.massNumber, approximate: true };
  return undefined;
};

/** «CuSO4·5H2O» → marcado con subíndices y punto medio. */
export function formulaToHtml(normalized: string): string {
  return escapeHtml(normalized)
    .replace(/[·•∙⋅*.]/g, '·')
    .replace(/([A-Za-z)\]}])(\d+)/g, '$1<sub>$2</sub>');
}

let root: HTMLElement;
let input: HTMLInputElement;
let output: HTMLElement;

export function initCalculator(): void {
  root = document.getElementById('calc-root') as HTMLElement;
  render();
  store.select(
    (s) => s.bundle,
    () => {
      const value = input.value;
      render();
      input.value = value;
      update();
    },
  );
}

function render(): void {
  if (!store.get().bundle) return;
  const tr = translator();
  input = h('input', {
    id: 'formula',
    class: 'formula-input',
    type: 'text',
    inputmode: 'text',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    placeholder: tr.t('calculator.placeholder'),
    'aria-describedby': 'formula-out',
  });
  input.addEventListener('input', update);
  output = h('div', { id: 'formula-out', class: 'calc-out', 'aria-live': 'polite' });
  const examples = h(
    'div',
    { class: 'examples' },
    h('span', { class: 'examples-label' }, tr.t('calculator.examples')),
    ...EXAMPLES.map((f) => {
      const b = h('button', { type: 'button', class: 'chip' });
      b.innerHTML = formulaToHtml(f);
      b.setAttribute('aria-label', f);
      b.addEventListener('click', () => {
        input.value = f;
        update();
        input.focus();
      });
      return b;
    }),
  );
  root.replaceChildren(
    h(
      'div',
      { class: 'calc' },
      h('label', { for: 'formula', class: 'calc-label' }, tr.t('calculator.label')),
      input,
      examples,
      output,
    ),
  );
  update();
}

function update(): void {
  const tr = translator();
  const value = input.value;
  if (value.trim() === '') {
    output.replaceChildren(h('p', { class: 'calc-empty' }, tr.t('calculator.empty')));
    input.removeAttribute('aria-invalid');
    return;
  }
  const r = parseFormula(value, lookup);
  if (r.ok) {
    input.removeAttribute('aria-invalid');
    output.replaceChildren(renderResult(r.value));
  } else {
    input.setAttribute('aria-invalid', 'true');
    output.replaceChildren(renderError(r.error, value));
  }
}

function renderResult(res: FormulaResult): HTMLElement {
  const tr = translator();
  const formula = h('p', { class: 'calc-formula' });
  formula.innerHTML = formulaToHtml(res.normalized);
  const hill = h('span');
  hill.innerHTML = formulaToHtml(res.hill);
  const rows = res.breakdown.map((row) => {
    const el = bySymbol.get(row.symbol.toLowerCase());
    const link = h('button', { type: 'button', class: 'linklike' }, `${row.symbol} · ${el ? nameOf(el.z) : ''}`);
    link.addEventListener('click', () => {
      if (el) openElement(el.z);
    });
    return h(
      'tr',
      { 'data-cat': el?.category ?? null },
      h('th', { scope: 'row' }, link),
      h('td', {}, tr.num(row.count)),
      h('td', {}, tr.num(row.mass, { minimumFractionDigits: 3, maximumFractionDigits: 3 })),
      h(
        'td',
        { class: 'pct' },
        h('span', { class: 'pct-bar', style: `--p:${(row.percent / 100).toFixed(4)}`, 'aria-hidden': 'true' }),
        h('span', {}, tr.num(row.percent, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u202f%'),
      ),
    );
  });
  return h(
    'div',
    { class: 'calc-result' },
    formula,
    h(
      'p',
      { class: 'calc-mass' },
      h('span', { class: 'calc-mass-label' }, tr.t('calculator.result')),
      h('strong', {}, `${tr.num(res.molarMass, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}\u202fg/mol`),
    ),
    h('p', { class: 'calc-hill' }, `${tr.t('calculator.hill')}: `, hill),
    res.approximate ? h('p', { class: 'calc-note' }, tr.t('calculator.approximate')) : null,
    h(
      'table',
      { class: 'breakdown' },
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', { scope: 'col' }, tr.t('calculator.element')),
          h('th', { scope: 'col' }, tr.t('calculator.atoms')),
          h('th', { scope: 'col' }, tr.t('calculator.mass')),
          h('th', { scope: 'col' }, tr.t('calculator.percent')),
        ),
      ),
      h('tbody', {}, ...rows),
    ),
  );
}

function renderError(error: FormulaError, value: string): HTMLElement {
  const tr = translator();
  const message = tr.t(`calculator.errors.${error.code}`, { token: error.token, pos: error.index + 1 });
  // Muestra la fórmula (sin espacios, como la interpretó el parser) con el problema subrayado.
  const normalized = value.replace(/\s/g, '');
  const at = Math.min(error.index, normalized.length);
  const len = Math.max(1, error.token.length);
  const marked = h('p', { class: 'calc-marked', 'aria-hidden': 'true' });
  if (error.code !== 'empty' && error.code !== 'tooLong') {
    marked.append(
      normalized.slice(0, at),
      h('mark', {}, normalized.slice(at, at + len) || ' '),
      normalized.slice(at + len),
    );
  }
  return h('div', { class: 'calc-error' }, marked, h('p', {}, message));
}
