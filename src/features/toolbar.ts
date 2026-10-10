/** Búsqueda, modo de color, propiedad del mapa de calor, ajuste de tamaño y estado de resultados. */
import type { ElementTexts } from '../data/types.ts';
import { loadBundle, LANGS } from '../i18n/index.ts';
import { $, $$, idle } from '../lib/dom.ts';
import { visibleSet } from '../lib/filters.ts';
import { buildIndex, search, type SearchIndex } from '../lib/search.ts';
import { activeFilterCount, elements, HEAT_PROPS, store, translator, type HeatProp, type View } from '../state.ts';
import { applyVisible, focusCell } from './grid.ts';

let index: SearchIndex | null = null;
let lastResult: number[] | null = null;

export function initToolbar(): void {
  const input = $<HTMLInputElement>('#q');
  const clear = $<HTMLButtonElement>('.search .clear');
  const status = $('#status');
  const heatSelect = $<HTMLSelectElement>('#heat-prop');
  const fitBtn = $<HTMLButtonElement>('#fit-btn');
  const filtersLabel = $('#filters-btn span');

  input.addEventListener('input', () => {
    store.set({ query: input.value });
  });
  input.addEventListener('keydown', (ev) => {
    // Enter lleva el foco al primer resultado; Escape limpia.
    if (ev.key === 'Enter' && lastResult?.[0] !== undefined) {
      ev.preventDefault();
      focusCell(lastResult[0], true);
    } else if (ev.key === 'Escape' && input.value !== '') {
      ev.preventDefault();
      input.value = '';
      store.set({ query: '' });
    }
  });
  clear.addEventListener('click', () => {
    input.value = '';
    store.set({ query: '' });
    input.focus();
  });

  for (const btn of $$<HTMLButtonElement>('.seg [data-view]')) {
    btn.addEventListener('click', () => {
      store.set({ view: btn.dataset.view as View });
    });
  }
  heatSelect.addEventListener('change', () => {
    const v = heatSelect.value;
    if ((HEAT_PROPS as readonly string[]).includes(v)) store.set({ heatProp: v as HeatProp });
  });
  $('#compare-btn').addEventListener('click', () => {
    void import('./compare.ts').then((m) => {
      m.toggleCompareMode();
    });
  });
  $('#filters-btn').addEventListener('click', () => {
    void import('./filters-dialog.ts').then((m) => {
      m.openFilters();
    });
  });
  fitBtn.addEventListener('click', () => {
    store.set((s) => ({ fit: !s.fit }));
  });

  store.select(
    (s) => s.view,
    (view) => {
      for (const btn of $$<HTMLButtonElement>('.seg [data-view]')) {
        btn.setAttribute('aria-pressed', String(btn.dataset.view === view));
      }
      heatSelect.hidden = view !== 'heatmap';
    },
    { immediate: true },
  );
  store.select(
    (s) => s.fit,
    (fit) => {
      fitBtn.setAttribute('aria-pressed', String(fit));
      fitBtn.setAttribute('aria-label', translator().t(fit ? 'toolbar.zoomIn' : 'toolbar.zoomOut'));
    },
  );

  // Índice de búsqueda con los nombres de ambos idiomas: el segundo se carga cuando el navegador está libre.
  store.select(
    (s) => s.bundle,
    (bundle) => {
      if (!bundle) return;
      const texts: ElementTexts[] = [bundle.texts];
      index = buildIndex(elements, texts);
      idle(() => {
        void Promise.all(LANGS.map((l) => loadBundle(l))).then((bundles) => {
          index = buildIndex(
            elements,
            bundles.map((b) => b.texts),
          );
          if (store.get().query) refresh();
        });
      });
      refresh();
    },
  );

  const refresh = (): void => {
    const s = store.get();
    lastResult = index ? search(index, s.query) : null;
    applyVisible(visibleSet(elements, lastResult, s.filters, s.highlight));
    clear.hidden = s.query === '';
    if (!s.bundle) return;
    const tr = translator();
    const n = activeFilterCount(s.filters);
    filtersLabel.textContent = n > 0 ? tr.tp('toolbar.filtersActive', n) : tr.t('toolbar.filters');
    if (s.query.trim() === '' && n === 0) status.textContent = '';
    else if (lastResult?.length === 0) status.textContent = tr.t('toolbar.noResults', { q: s.query.trim() });
    else {
      const visible = visibleSet(elements, lastResult, s.filters, null);
      status.textContent = tr.tp('toolbar.results', visible?.size ?? elements.length);
    }
  };

  store.select((s) => s.query, refresh);
  store.select((s) => s.filters, refresh);
  store.select((s) => s.highlight, refresh);
}
