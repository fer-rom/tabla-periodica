/** Diálogo de filtros combinables: bloque, categoría, estado a 298 K y período. */
import { BLOCKS, CATEGORIES } from '../data/types.ts';
import { $, h } from '../lib/dom.ts';
import { matchesFilters, toggle } from '../lib/filters.ts';
import { elements, NO_FILTERS, store, translator, type Filters, type PhaseFilter } from '../state.ts';

const PHASES: readonly PhaseFilter[] = ['solid', 'liquid', 'gas', 'unknown'];
const PERIODS = [1, 2, 3, 4, 5, 6, 7] as const;

let dialog: HTMLDialogElement | null = null;

export function openFilters(): void {
  if (!dialog) {
    const d = $<HTMLDialogElement>('#filters-dialog');
    dialog = d;
    d.addEventListener('close', () => {
      $('#filters-btn').setAttribute('aria-expanded', 'false');
    });
    d.addEventListener('click', (ev) => {
      if (ev.target === d) d.close();
    });
    store.select(
      (s) => s.filters,
      () => {
        if (dialog?.open) render();
      },
    );
    store.select(
      (s) => s.bundle,
      () => {
        if (dialog?.open) render();
      },
    );
  }
  render();
  dialog.showModal();
  $('#filters-btn').setAttribute('aria-expanded', 'true');
}

function chipGroup<T extends string | number>(
  legend: string,
  values: readonly T[],
  selected: readonly T[],
  label: (v: T) => string,
  key: keyof Filters,
): HTMLElement {
  return h(
    'fieldset',
    { class: 'chips' },
    h('legend', {}, legend),
    ...values.map((v) => {
      const btn = h(
        'button',
        { type: 'button', class: 'chip', 'aria-pressed': String(selected.includes(v)) },
        label(v),
      );
      btn.addEventListener('click', () => {
        store.set((s) => ({ filters: { ...s.filters, [key]: toggle(s.filters[key] as readonly T[], v) } }));
      });
      return btn;
    }),
  );
}

function render(): void {
  if (!dialog || !store.get().bundle) return;
  const tr = translator();
  const f = store.get().filters;
  const shown = elements.filter((e) => matchesFilters(e, f)).length;
  const done = h('button', { type: 'button', class: 'btn primary' }, tr.t('filters.close'));
  done.addEventListener('click', () => dialog?.close());
  const clear = h('button', { type: 'button', class: 'btn' }, tr.t('toolbar.clearFilters'));
  clear.addEventListener('click', () => {
    store.set({ filters: NO_FILTERS });
  });
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement.textContent : null;
  dialog.replaceChildren(
    h(
      'div',
      { class: 'sheet-body' },
      h(
        'header',
        { class: 'sheet-head plain' },
        h('div', { class: 'sheet-title' }, h('h2', { id: 'filters-title' }, tr.t('filters.title'))),
      ),
      chipGroup(tr.t('filters.block'), BLOCKS, f.blocks, (b) => tr.t('filters.blockValue', { b }), 'blocks'),
      chipGroup(tr.t('filters.category'), CATEGORIES, f.categories, (c) => tr.t(`categories.${c}`), 'categories'),
      chipGroup(tr.t('filters.phase'), PHASES, f.phases, (p) => tr.t(`phases.${p}`), 'phases'),
      chipGroup(tr.t('filters.period'), PERIODS, f.periods, (n) => String(n), 'periods'),
      h(
        'footer',
        { class: 'sheet-actions' },
        h('p', { class: 'status', role: 'status' }, tr.t('filters.showing', { n: shown })),
        clear,
        done,
      ),
    ),
  );
  // Al re-renderizar, devolver el foco al chip que se acaba de tocar.
  if (focused) {
    for (const b of dialog.querySelectorAll<HTMLButtonElement>('button')) {
      if (b.textContent === focused) {
        b.focus();
        break;
      }
    }
  }
}
