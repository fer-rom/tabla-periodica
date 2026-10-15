/**
 * Hueco central de la tabla según la vista: tarjeta resumen del elemento tocado (categorías),
 * escala del mapa de calor o slider de temperatura. La leyenda va siempre debajo de la tabla.
 */
import { CATEGORIES } from '../data/types.ts';
import { blackbodyGradient, viridisGradient } from '../lib/color.ts';
import { $, h } from '../lib/dom.ts';
import { configToHtml, formatMass, formatOxidation, formatValue } from '../lib/format.ts';
import { formatNumber } from '../i18n/index.ts';
import { heatScale } from '../lib/heat.ts';
import { phaseAt } from '../lib/phase.ts';
import { byZ, elements, nameOf, store, translator, type HeatProp } from '../state.ts';
import { openElement } from './router.ts';

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
let legendRoot: HTMLElement;
let slider: HTMLInputElement | null = null;
let readout: HTMLElement | null = null;
let counts: HTMLElement | null = null;

export function initInset(): void {
  root = $('#inset');
  legendRoot = $('#legend-area');
  const render = (): void => {
    if (!store.get().bundle) return;
    const view = store.get().view;
    root.dataset.view = view;
    root.replaceChildren(
      view === 'category'
        ? renderPreview(store.get().preview)
        : view === 'heatmap'
          ? renderScale(store.get().heatProp)
          : renderTemperature(),
    );
  };
  // La leyenda viene prerenderizada: solo se engancha el clic (los textos los traduce applyI18n).
  legendRoot.addEventListener('click', (ev) => {
    const btn = (ev.target as Element).closest<HTMLButtonElement>('[data-hl]');
    const cat = CATEGORIES.find((c) => c === btn?.dataset.hl);
    if (cat) store.set((s) => ({ highlight: s.highlight === cat ? null : cat }));
  });
  store.select((s) => s.view, render);
  store.select((s) => s.bundle, render);
  store.select(
    (s) => s.preview,
    () => {
      if (store.get().view === 'category') render();
    },
  );
  store.select(
    (s) => s.heatProp,
    () => {
      if (store.get().view === 'heatmap') render();
    },
  );
  store.select(
    (s) => s.highlight,
    (hl) => {
      for (const btn of legendRoot.querySelectorAll<HTMLButtonElement>('[data-hl]')) {
        btn.setAttribute('aria-pressed', String(btn.dataset.hl === hl));
      }
    },
  );
  store.select((s) => s.temperature, updateTemperature);
}

/** Tarjeta resumen: los datos más consultados, en renglones, y un botón a la ficha completa. */
function renderPreview(z: number | null): HTMLElement {
  const tr = translator();
  const el = z === null ? undefined : byZ(z);
  if (!el) return h('p', { class: 'preview-hint' }, tr.t('preview.hint'));
  const name = nameOf(el.z);
  const config = h('span');
  config.innerHTML = configToHtml(el.electronConfigurationShort);
  const row = (label: string, value: string | Node): HTMLElement =>
    h('div', { class: 'pv-row' }, h('dt', {}, label), h('dd', {}, value));
  const more = h('button', { type: 'button', class: 'btn pv-more' }, tr.t('preview.more'));
  more.addEventListener('click', () => {
    openElement(el.z);
  });
  const close = h('button', { type: 'button', class: 'btn icon pv-close', 'aria-label': tr.t('preview.close') });
  close.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke-linecap="round"/></svg>';
  close.addEventListener('click', () => {
    store.set({ preview: null });
  });
  return h(
    'section',
    {
      class: 'preview',
      'data-cat': el.category,
      'data-hydrogen': el.z === 1 ? '' : null,
      'aria-label': tr.t('preview.label', { name }),
      'aria-live': 'polite',
    },
    h(
      'div',
      { class: 'pv-id' },
      h(
        'div',
        { class: 'tile', 'aria-hidden': 'true' },
        h('span', { class: 'z' }, String(el.z)),
        h('span', { class: 'sym' }, el.symbol),
      ),
      h(
        'div',
        {},
        h('h2', { class: 'pv-name' }, name),
        h('p', { class: 'pv-cat' }, tr.t(`categories.${el.category}`)),
        h('p', { class: 'pv-cat' }, formatMass(tr.lang, el)),
      ),
    ),
    h(
      'dl',
      { class: 'pv-data' },
      row(tr.t('properties.electronegativity'), formatValue(tr.lang, el.electronegativity)),
      row(tr.t('panel.oxidationStates'), formatOxidation(el.oxidationStates)),
      row(tr.t('preview.shells'), el.shells.join(', ')),
      row(tr.t('properties.density'), formatValue(tr.lang, el.density, 'g/cm³')),
      row(tr.t('preview.configShort'), config),
    ),
    h('div', { class: 'pv-actions' }, more, close),
  );
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
    { class: 'temp-marks' },
    h(
      'button',
      {
        type: 'button',
        style: `--at:${(298 / T_MAX) * 100}%`,
        'data-k': 298,
        'aria-label': `${tr.t('temperature.room')} (298 K)`,
      },
      tr.t('temperature.room'),
    ),
    h(
      'button',
      {
        type: 'button',
        style: `--at:${(5772 / T_MAX) * 100}%`,
        'data-k': 5772,
        'aria-label': `${tr.t('temperature.sunSurface')} (5772 K)`,
      },
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
