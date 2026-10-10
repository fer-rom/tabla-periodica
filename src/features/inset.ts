/**
 * Contenido del hueco central de la tabla según la vista:
 * leyenda interactiva de categorías, escala del mapa de calor o slider de temperatura.
 */
import { CATEGORIES } from '../data/types.ts';
import { blackbodyGradient, viridisGradient } from '../lib/color.ts';
import { $, h } from '../lib/dom.ts';
import { formatNumber } from '../i18n/index.ts';
import { heatScale } from '../lib/heat.ts';
import { phaseAt } from '../lib/phase.ts';
import { elements, store, translator, type HeatProp } from '../state.ts';

export const T_MAX = 6000;

const UNIT_KEYS: Readonly<Record<HeatProp, Parameters<ReturnType<typeof translator>['t']>[0]>> = {
  electronegativity: 'properties.electronegativityUnit',
  atomicRadius: 'properties.atomicRadiusUnit',
  ionizationEnergy: 'properties.ionizationEnergyUnit',
  density: 'properties.densityUnit',
  meltingPoint: 'properties.meltingPointUnit',
  year: 'properties.yearUnit',
};

let root: HTMLElement;
let slider: HTMLInputElement | null = null;
let readout: HTMLElement | null = null;
let counts: HTMLElement | null = null;

export function initInset(): void {
  root = $('#inset');
  const render = (): void => {
    if (!store.get().bundle) return;
    const view = store.get().view;
    root.dataset.view = view;
    root.replaceChildren(
      view === 'category'
        ? renderLegend()
        : view === 'heatmap'
          ? renderScale(store.get().heatProp)
          : renderTemperature(),
    );
  };
  store.select((s) => s.view, render);
  store.select((s) => s.bundle, render);
  store.select(
    (s) => s.heatProp,
    () => {
      if (store.get().view === 'heatmap') render();
    },
  );
  store.select(
    (s) => s.highlight,
    (hl) => {
      for (const btn of root.querySelectorAll<HTMLButtonElement>('[data-hl]')) {
        btn.setAttribute('aria-pressed', String(btn.dataset.hl === hl));
      }
    },
  );
  store.select((s) => s.temperature, updateTemperature);
}

function renderLegend(): DocumentFragment {
  const tr = translator();
  const frag = document.createDocumentFragment();
  const list = h('ul', { class: 'legend', 'aria-label': tr.t('legend.title') });
  const hl = store.get().highlight;
  for (const cat of CATEGORIES) {
    const btn = h(
      'button',
      { type: 'button', 'data-hl': cat, 'aria-pressed': String(hl === cat) },
      h('span', { class: 'swatch', 'data-cat': cat, 'aria-hidden': 'true' }),
      tr.t(`categories.${cat}`),
    );
    btn.addEventListener('click', () => {
      store.set((s) => ({ highlight: s.highlight === cat ? null : cat }));
    });
    list.append(h('li', {}, btn));
  }
  frag.append(list, h('p', { class: 'inset-hint' }, tr.t('legend.hint')));
  return frag;
}

function renderScale(prop: HeatProp): HTMLElement {
  const tr = translator();
  const scale = heatScale(elements, prop);
  const fmt = (v: number): string =>
    prop === 'year'
      ? String(v)
      : formatNumber(tr.lang, Number(v.toPrecision(3)), { maximumFractionDigits: v < 0.01 ? 6 : 3 });
  return h(
    'figure',
    { class: 'scale' },
    h(
      'figcaption',
      {},
      h('strong', {}, tr.t(`properties.${prop}`)),
      ' ',
      h('span', {}, `(${tr.t(UNIT_KEYS[prop])}${scale.log ? ', log' : ''})`),
    ),
    h('div', { class: 'scale-bar', style: `background:${viridisGradient()}`, 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'scale-ticks' },
      h('span', {}, prop === 'year' ? tr.t('legend.antiquity') : fmt(scale.min)),
      h('span', {}, fmt(scale.max)),
    ),
    h('p', { class: 'scale-null' }, h('span', { class: 'hatch', 'aria-hidden': 'true' }), tr.t('legend.noData')),
  );
}

function renderTemperature(): HTMLElement {
  const tr = translator();
  const k = store.get().temperature;
  slider = h('input', {
    type: 'range',
    id: 'temp',
    min: 0,
    max: T_MAX,
    step: 1,
    value: k,
    'aria-describedby': 'temp-note',
    style: `--track:${blackbodyGradient(T_MAX)}`,
  });
  slider.addEventListener('input', () => {
    store.set({ temperature: Number(slider?.value ?? 298) });
  });
  readout = h('output', { for: 'temp', class: 'temp-readout' });
  counts = h('ul', { class: 'temp-counts' });
  const marks = h(
    'div',
    { class: 'temp-marks', 'aria-hidden': 'true' },
    h(
      'button',
      { type: 'button', tabindex: -1, style: `--at:${(298 / T_MAX) * 100}%`, 'data-k': 298 },
      tr.t('temperature.room'),
    ),
    h(
      'button',
      { type: 'button', tabindex: -1, style: `--at:${(5772 / T_MAX) * 100}%`, 'data-k': 5772 },
      tr.t('temperature.sunSurface'),
    ),
  );
  marks.addEventListener('click', (ev) => {
    const b = (ev.target as Element).closest<HTMLButtonElement>('[data-k]');
    if (b) store.set({ temperature: Number(b.dataset.k) });
  });
  const wrap = h(
    'div',
    { class: 'temp' },
    h('div', { class: 'temp-head' }, h('label', { for: 'temp' }, tr.t('temperature.label')), readout),
    slider,
    marks,
    counts,
    h('p', { class: 'inset-hint', id: 'temp-note' }, tr.t('temperature.note')),
  );
  updateTemperature(k);
  return wrap;
}

function updateTemperature(k: number): void {
  if (!slider || !readout || !counts || !store.get().bundle) return;
  const tr = translator();
  if (Number(slider.value) !== k) slider.value = String(k);
  const text = tr.t('temperature.value', {
    k: tr.num(k),
    c: tr.num(k - 273.15, { maximumFractionDigits: 1 }),
  });
  readout.textContent = text;
  slider.setAttribute('aria-valuetext', text);
  const n = { solid: 0, liquid: 0, gas: 0, unknown: 0 };
  for (const el of elements) n[phaseAt(el, k)]++;
  counts.replaceChildren(
    ...(['solid', 'liquid', 'gas', 'unknown'] as const).map((p) =>
      h(
        'li',
        {},
        h('span', { class: 'ph-swatch', 'data-phase': p, 'aria-hidden': 'true' }),
        `${tr.t(`phases.${p}`)}: ${tr.num(n[p])}`,
      ),
    ),
  );
}
