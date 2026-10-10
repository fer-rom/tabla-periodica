/**
 * Rutas por elemento en el hash (/#Fe). Abrir una ficha agrega una entrada al historial,
 * así «Atrás» la cierra; el título y la descripción de la página siguen al elemento abierto.
 */
import { formatMass } from '../lib/format.ts';
import { bySymbol, byZ, nameOf, store, translator } from '../state.ts';

let pushed = false;

function zFromHash(hash: string): number | null {
  const key = decodeURIComponent(hash.replace(/^#/, '')).trim().toLowerCase();
  if (key === '') return null;
  return bySymbol.get(key)?.z ?? null;
}

export function initRouter(): void {
  const initial = zFromHash(window.location.hash);
  if (initial !== null) store.set({ selected: initial });

  window.addEventListener('popstate', () => {
    pushed = false;
    store.set({ selected: zFromHash(window.location.hash) });
  });
  window.addEventListener('hashchange', () => {
    const z = zFromHash(window.location.hash);
    if (z !== store.get().selected) store.set({ selected: z });
  });

  const show = (): void => {
    const z = store.get().selected;
    if (z === null || !store.get().bundle) return;
    void import('./panel.ts').then((m) => {
      m.showPanel(z);
    });
  };
  store.select(
    (s) => s.selected,
    () => {
      show();
      updateMeta();
    },
    { immediate: true },
  );
  // Con /#Fe en la URL inicial, la ficha se abre en cuanto llegan los textos del idioma.
  store.select(
    (s) => s.bundle,
    (_bundle, previous) => {
      if (!previous) show();
      updateMeta();
    },
  );
}

/** Abre la ficha de un elemento desde la tabla, la búsqueda o el comparador. */
export function openElement(z: number): void {
  const el = byZ(z);
  if (!el) return;
  const hash = `#${el.symbol}`;
  if (window.location.hash !== hash) {
    if (store.get().selected === null) {
      window.history.pushState({ panel: true }, '', hash);
      pushed = true;
    } else window.history.replaceState(window.history.state, '', hash);
  }
  store.set({ selected: z });
}

/** Cierra la ficha y quita el hash (volviendo atrás si lo agregamos nosotros). */
export function closeElement(): void {
  if (store.get().selected === null) return;
  store.set({ selected: null });
  if (pushed) {
    pushed = false;
    window.history.back();
  } else if (window.location.hash) {
    const url = new URL(window.location.href);
    url.hash = '';
    window.history.replaceState(null, '', url);
  }
}

function updateMeta(): void {
  const s = store.get();
  if (!s.bundle) return;
  const tr = translator();
  const el = s.selected === null ? undefined : byZ(s.selected);
  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!el) {
    document.title = tr.t('meta.title');
    description?.setAttribute('content', tr.t('meta.description'));
    return;
  }
  const name = nameOf(el.z);
  document.title = tr.t('meta.elementTitle', { name, symbol: el.symbol });
  description?.setAttribute(
    'content',
    tr.t('meta.elementDescription', {
      name,
      z: el.z,
      category: tr.t(`categories.${el.category}`),
      mass: formatMass(s.lang, el),
      config: el.electronConfigurationShort,
    }),
  );
}
