/**
 * Comparador de dos elementos lado a lado. Con «Comparar» activo, tocar celdas las elige;
 * con dos elegidas se abre la comparación. El valor mayor se marca con texto y un ícono,
 * no solo con color.
 */
import type { Element } from '../data/types.ts';
import { $, h } from '../lib/dom.ts';
import { formatKelvin, formatMass, formatValue, NO_DATA } from '../lib/format.ts';
import { byZ, nameOf, store, translator } from '../state.ts';
import { setAttrOn } from './grid.ts';
import { closeElement } from './router.ts';

interface Metric {
  readonly label: () => string;
  readonly value: (e: Element) => number | null;
  readonly format: (e: Element) => string;
}

let initialized = false;
let dialog: HTMLDialogElement | null = null;

function metrics(): Metric[] {
  const tr = translator();
  const lang = tr.lang;
  return [
    { label: () => tr.t('panel.atomicNumber'), value: (e) => e.z, format: (e) => String(e.z) },
    {
      label: () => tr.t('panel.atomicWeight'),
      value: (e) => e.atomicWeight ?? e.massNumber,
      format: (e) => formatMass(lang, e),
    },
    {
      label: () => tr.t('properties.electronegativity'),
      value: (e) => e.electronegativity,
      format: (e) => formatValue(lang, e.electronegativity),
    },
    {
      label: () => tr.t('properties.atomicRadius'),
      value: (e) => e.atomicRadius,
      format: (e) => formatValue(lang, e.atomicRadius, 'pm'),
    },
    {
      label: () => tr.t('properties.covalentRadius'),
      value: (e) => e.covalentRadius,
      format: (e) => formatValue(lang, e.covalentRadius, 'pm'),
    },
    {
      label: () => tr.t('properties.ionizationEnergy'),
      value: (e) => e.ionizationEnergy,
      format: (e) => formatValue(lang, e.ionizationEnergy, 'eV', 5),
    },
    {
      label: () => tr.t('properties.electronAffinity'),
      value: (e) => e.electronAffinity,
      format: (e) => formatValue(lang, e.electronAffinity, 'eV'),
    },
    {
      label: () => tr.t('properties.density'),
      value: (e) => e.density,
      format: (e) => formatValue(lang, e.density, 'g/cm³'),
    },
    {
      label: () => tr.t('properties.meltingPoint'),
      value: (e) => (e.sublimes ? null : e.meltingPoint),
      format: (e) => (e.sublimes ? NO_DATA : formatKelvin(lang, e.meltingPoint)),
    },
    {
      label: () => tr.t('properties.boilingPoint'),
      value: (e) => e.boilingPoint,
      format: (e) => formatKelvin(lang, e.boilingPoint),
    },
    {
      label: () => tr.t('properties.year'),
      value: (e) => e.year,
      format: (e) => (e.year === null ? NO_DATA : String(e.year)),
    },
  ];
}

function init(): void {
  if (initialized) return;
  initialized = true;
  dialog = document.getElementById('compare-dialog') as HTMLDialogElement | null;
  if (!dialog) {
    dialog = h('dialog', { class: 'sheet sheet-wide', id: 'compare-dialog', 'aria-labelledby': 'compare-title' });
    document.body.append(dialog);
  }
  dialog.addEventListener('cancel', (ev) => {
    ev.preventDefault();
    store.set({ compare: [] });
  });
  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog) store.set({ compare: [] });
  });

  const btn = $<HTMLButtonElement>('#compare-btn');
  const tray = $('#compare-tray');

  store.select(
    (s) => s.compare,
    (picked, previous) => {
      for (const z of previous) setAttrOn(z, 'data-picked', false);
      for (const z of picked) setAttrOn(z, 'data-picked', true);
      renderTray(tray);
      if (picked.length === 2) showComparison(picked[0] ?? 1, picked[1] ?? 1);
      else if (dialog?.open) dialog.close();
    },
  );
  store.select(
    (s) => s.compareMode,
    (on) => {
      btn.setAttribute('aria-pressed', String(on));
      tray.hidden = !on;
      if (!on) store.set({ compare: [] });
      renderTray(tray);
    },
  );
  store.select(
    (s) => s.bundle,
    () => {
      renderTray(tray);
      const [a, b] = store.get().compare;
      if (a !== undefined && b !== undefined && dialog?.open) showComparison(a, b);
    },
  );
}

export function toggleCompareMode(): void {
  init();
  store.set((s) => ({ compareMode: !s.compareMode }));
}

export function startCompareWith(z: number): void {
  init();
  closeElement();
  store.set({ compareMode: true, compare: [z] });
}

export function pick(z: number): void {
  init();
  const { compare } = store.get();
  if (compare.includes(z)) store.set({ compare: compare.filter((v) => v !== z) });
  else if (compare.length < 2) store.set({ compare: [...compare, z] });
  else store.set({ compare: [z] });
}

function renderTray(tray: HTMLElement): void {
  if (!store.get().bundle || tray.hidden) return;
  const tr = translator();
  const picked = store.get().compare;
  const msg = picked.length === 0 ? tr.t('compare.pickFirst') : tr.t('compare.pickSecond');
  const done = h('button', { type: 'button', class: 'btn' }, tr.t('compare.close'));
  done.addEventListener('click', () => {
    store.set({ compareMode: false });
  });
  tray.replaceChildren(
    h(
      'p',
      { role: 'status' },
      picked.length > 0 ? h('strong', {}, picked.map((z) => nameOf(z)).join(' · ')) : null,
      picked.length < 2 ? ` ${msg}` : '',
    ),
    done,
  );
}

function showComparison(za: number, zb: number): void {
  const a = byZ(za);
  const b = byZ(zb);
  if (!a || !b || !dialog || !store.get().bundle) return;
  const tr = translator();
  const close = h(
    'button',
    { type: 'button', class: 'btn icon sheet-close', 'aria-label': tr.t('compare.close') },
    '×',
  );
  close.addEventListener('click', () => {
    store.set({ compare: [] });
  });
  const swap = h('button', { type: 'button', class: 'btn' }, tr.t('compare.swap'));
  swap.addEventListener('click', () => {
    store.set({ compare: [zb, za] });
  });
  const restart = h('button', { type: 'button', class: 'btn' }, tr.t('compare.clear'));
  restart.addEventListener('click', () => {
    store.set({ compare: [] });
  });

  const head = (e: Element): HTMLElement =>
    h(
      'th',
      { scope: 'col', 'data-cat': e.category, 'data-hydrogen': e.z === 1 ? '' : null },
      h('span', { class: 'tile tile-sm', 'aria-hidden': 'true' }, h('span', { class: 'sym' }, e.symbol)),
      h('span', { class: 'cmp-name' }, nameOf(e.z)),
    );

  const higher = (winner: boolean): HTMLElement | null =>
    winner ? h('span', { class: 'cmp-up' }, h('span', { 'aria-hidden': 'true' }, '▲ '), tr.t('compare.higher')) : null;

  const rows = metrics().map((m) => {
    const va = m.value(a);
    const vb = m.value(b);
    const comparable = va !== null && vb !== null && va !== vb;
    const aWins = comparable && va > vb;
    const bWins = comparable && vb > va;
    return h(
      'tr',
      {},
      h('th', { scope: 'row' }, m.label()),
      h('td', { 'data-win': aWins ? '' : null }, m.format(a), higher(aWins)),
      h('td', { 'data-win': bWins ? '' : null }, m.format(b), higher(bWins)),
    );
  });

  const catRow = h(
    'tr',
    {},
    h('th', { scope: 'row' }, tr.t('panel.category')),
    h('td', {}, tr.t(`categories.${a.category}`)),
    h('td', {}, tr.t(`categories.${b.category}`)),
  );

  dialog.replaceChildren(
    h(
      'div',
      { class: 'sheet-body' },
      h(
        'header',
        { class: 'sheet-head plain' },
        h('div', { class: 'sheet-title' }, h('h2', { id: 'compare-title' }, tr.t('compare.title'))),
        h('div', { class: 'sheet-tools' }, close),
      ),
      h(
        'table',
        { class: 'cmp' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, tr.t('compare.property')), head(a), head(b))),
        h('tbody', {}, catRow, ...rows),
      ),
      h('footer', { class: 'sheet-actions' }, swap, restart),
    ),
  );
  if (!dialog.open) dialog.showModal();
  close.focus({ preventScroll: true });
}
