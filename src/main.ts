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
import { store } from './state.ts';

initGrid((z) => {
  if (store.get().compareMode) {
    void import('./features/compare.ts').then((m) => {
      m.pick(z);
    });
  } else openElement(z);
});
initPrefs();
initToolbar();
initInset();
initRouter();

void loadBundle(initialLang()).then((bundle) => {
  store.set({ bundle });
});
