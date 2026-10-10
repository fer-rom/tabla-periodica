import './styles/tokens.css';
import './styles/base.css';
import './styles/table.css';
import './styles/components.css';
import './styles/sheet.css';
import './styles/sections.css';

import { loadBundle } from './i18n/index.ts';
import { initGrid } from './features/grid.ts';
import { initInset } from './features/inset.ts';
import { initialLang, initPrefs } from './features/prefs.ts';
import { initRouter, openElement } from './features/router.ts';
import { initToolbar } from './features/toolbar.ts';
import { initOffline } from './features/offline.ts';
import { store } from './state.ts';

/** La tarjeta resumen vive en el hueco central, que solo existe con la tabla a lo ancho. */
const insetVisible = (): boolean => (document.getElementById('scroller')?.clientWidth ?? 0) >= 1080;

initGrid((z) => {
  const s = store.get();
  if (s.compareMode) {
    void import('./features/compare.ts').then((m) => {
      m.pick(z);
    });
  } else if (s.view === 'category' && insetVisible() && s.preview !== z) {
    // Primer toque: resumen en la tarjeta. Segundo toque sobre el mismo: ficha completa.
    store.set({ preview: z });
  } else openElement(z);
});
initPrefs();
initToolbar();
initInset();
initRouter();
initOffline();

void loadBundle(initialLang()).then((bundle) => {
  store.set({ bundle });
});

// Secciones de abajo: su código se descarga cuando están por entrar en pantalla.
const lazySections: Record<string, () => Promise<void>> = {
  tendencias: () =>
    import('./features/trends.ts').then((m) => {
      m.initTrends();
    }),
  'masa-molar': () =>
    import('./features/calculator.ts').then((m) => {
      m.initCalculator();
    }),
};
const io = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      io.unobserve(entry.target);
      void lazySections[entry.target.id]?.();
    }
  },
  { rootMargin: '600px 0px' },
);
for (const id of Object.keys(lazySections)) {
  const section = document.getElementById(id);
  if (section) io.observe(section);
}
