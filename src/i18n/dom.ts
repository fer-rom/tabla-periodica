/** Aplica traducciones al marcado estático (data-i18n, data-i18n-attr). */
import type { MessageKey, Params, Translator } from './index.ts';

function params(el: Element, tr: Translator): Params | undefined {
  const raw = el.getAttribute('data-i18n-params');
  if (!raw) return undefined;
  const out: Record<string, string> = {};
  for (const pair of raw.split(';')) {
    const [k = '', v = ''] = pair.split(':');
    out[k] =
      k === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v)
        ? new Intl.DateTimeFormat(tr.lang === 'es' ? 'es-AR' : 'en-US', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          }).format(new Date(v))
        : v;
  }
  return out;
}

export function applyI18n(root: ParentNode, tr: Translator): void {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n') as MessageKey;
    const text = tr.t(key, params(el, tr));
    if (el.textContent !== text) el.textContent = text;
  }
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of (el.getAttribute('data-i18n-attr') ?? '').split(';')) {
      const [attr, key] = pair.split(':');
      if (attr && key) el.setAttribute(attr, tr.t(key as MessageKey));
    }
  }
}
