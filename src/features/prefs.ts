/**
 * Switches de idioma y tema. El idioma se refleja en ?lang=, en <html lang> y en los metadatos,
 * y ambas preferencias se guardan (con try/catch) para la próxima visita.
 */
import { applyI18n } from '../i18n/dom.ts';
import { isLang, loadBundle, type Lang } from '../i18n/index.ts';
import { $, prefersReducedMotion } from '../lib/dom.ts';
import { writePref } from '../lib/storage.ts';
import { store, translator, type Theme } from '../state.ts';

export const PREF_LANG = 'tp.lang';
export const PREF_THEME = 'tp.theme';

export function initPrefs(): void {
  const langSwitch = $('#lang-switch');
  const themeSwitch = $('#theme-switch');

  langSwitch.addEventListener('click', () => {
    const next: Lang = store.get().lang === 'es' ? 'en' : 'es';
    writePref(PREF_LANG, next);
    void setLang(next);
  });

  themeSwitch.addEventListener('click', () => {
    const next: Theme = store.get().theme === 'dark' ? 'light' : 'dark';
    writePref(PREF_THEME, next);
    setTheme(next);
  });

  store.select(
    (s) => s.lang,
    (lang) => {
      langSwitch.setAttribute('aria-checked', String(lang === 'en'));
    },
    { immediate: true },
  );
  store.select(
    (s) => s.theme,
    (theme) => {
      themeSwitch.setAttribute('aria-checked', String(theme === 'dark'));
      document.documentElement.dataset.theme = theme;
      for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
        meta.content = theme === 'dark' ? '#13111c' : '#eef2ee';
        meta.removeAttribute('media');
      }
    },
    { immediate: true },
  );
  store.select(
    (s) => s.bundle,
    () => {
      const tr = translator();
      const root = document.documentElement;
      root.lang = tr.lang;
      root.dataset.lang = tr.lang;
      applyI18n(document, tr);
      syncUrl(tr.lang);
      document.querySelector<HTMLAnchorElement>('.brand')?.setAttribute('href', `./?lang=${tr.lang}`);
    },
  );
}

/** Cambia el idioma sin recargar: carga el paquete (ya precargado en general) y notifica. */
export async function setLang(lang: Lang): Promise<void> {
  const bundle = await loadBundle(lang);
  store.set({ lang, bundle });
}

function setTheme(theme: Theme): void {
  const apply = (): void => {
    store.set({ theme });
  };
  // Fundido entre temas con View Transitions (solo opacidad); sin ella o con movimiento reducido, directo.
  if ('startViewTransition' in document && !prefersReducedMotion()) document.startViewTransition(apply);
  else apply();
}

/** Mantiene ?lang= en la URL sin recargar ni ensuciar el historial; conserva el hash (#Fe). */
function syncUrl(lang: Lang): void {
  const url = new URL(window.location.href);
  if (url.searchParams.get('lang') === lang) return;
  url.searchParams.set('lang', lang);
  window.history.replaceState(window.history.state, '', url);
}

export function initialLang(): Lang {
  const v = document.documentElement.dataset.lang;
  return isLang(v) ? v : 'es';
}
