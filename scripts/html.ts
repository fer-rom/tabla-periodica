/**
 * Transformaciones del HTML en tiempo de build: textos en el idioma por defecto,
 * grilla prerenderizada y variables del sitio. Sin DOM: expresiones regulares acotadas
 * a los atributos data-i18n que escribimos nosotros en index.html.
 */
import elementsJson from '../src/data/elements.json' with { type: 'json' };
import textsEs from '../src/data/texts.es.json' with { type: 'json' };
import es from '../src/i18n/es.json' with { type: 'json' };
import en from '../src/i18n/en.json' with { type: 'json' };
import textsEn from '../src/data/texts.en.json' with { type: 'json' };
import type { Element } from '../src/data/types.ts';
import { createTranslator, type MessageKey, type Params } from '../src/i18n/index.ts';
import { escapeHtml } from '../src/lib/format.ts';
import { renderTable } from '../src/lib/render-table.ts';

export interface SiteVars {
  readonly siteUrl: string;
  readonly repoUrl: string;
  readonly snapshotDate: string;
}

const tr = createTranslator('es', es);

const dateFormat = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function parseParams(raw: string | undefined): Params | undefined {
  if (!raw) return undefined;
  return Object.fromEntries(
    raw.split(';').map((pair) => {
      const [k = '', v = ''] = pair.split(':');
      return [k, k === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? dateFormat.format(new Date(v)) : v];
    }),
  );
}

export function fillI18n(html: string): string {
  // Contenido de texto: <tag data-i18n="clave" ...></tag>
  let out = html.replace(
    /(<(\w+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)(<\/\2>)/g,
    (_m, open: string, _tag: string, key: string, close: string) => {
      const params = parseParams(/data-i18n-params="([^"]*)"/.exec(open)?.[1]);
      return `${open}${escapeHtml(tr.t(key as MessageKey, params))}${close}`;
    },
  );
  // Atributos: data-i18n-attr="attr:clave;attr2:clave2"
  out = out.replace(/<[^>]*\bdata-i18n-attr="([^"]+)"[^>]*>/g, (tag, spec: string) => {
    let result = tag;
    for (const pair of spec.split(';')) {
      const [attr, key] = pair.split(':');
      if (!attr || !key) continue;
      const value = escapeHtml(tr.t(key as MessageKey));
      const re = new RegExp(`\\s${attr}="[^"]*"`);
      result = re.test(result)
        ? result.replace(re, ` ${attr}="${value}"`)
        : result.replace(/\s*\/?>$/, (end) => ` ${attr}="${value}"${end}`);
    }
    return result;
  });
  return out;
}

const trEn = createTranslator('en', en);

/**
 * El HTML se prerenderiza en español. Si la visita es en inglés, este script síncrono (al final
 * del body, antes del primer pintado) aplica los textos en inglés que ya están a la vista,
 * así los botones no cambian de ancho cuando llega el JavaScript (evita CLS).
 */
export function earlyEnglishScript(html: string): string {
  const dict: Record<string, string> = {};
  for (const m of html.matchAll(/data-i18n="([^"]+)"(?![^>]*data-i18n-params)/g)) {
    const key = m[1] ?? '';
    dict[key] = trEn.t(key as MessageKey);
  }
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const pair of (m[1] ?? '').split(';')) {
      const key = pair.split(':')[1];
      if (key) dict[key] = trEn.t(key as MessageKey);
    }
  }
  const names = Object.fromEntries(Object.entries(textsEn).map(([z, t]) => [z, t.name]));
  const data = JSON.stringify({ t: dict, n: names }).replace(/</g, '\\u003c');
  return `<script>(function(){var d=document.documentElement;if(d.lang!=='en')return;var D=${data};
document.querySelectorAll('[data-i18n]').forEach(function(e){if(e.hasAttribute('data-i18n-params'))return;var v=D.t[e.getAttribute('data-i18n')];if(v!=null)e.textContent=v});
document.querySelectorAll('[data-i18n-attr]').forEach(function(e){e.getAttribute('data-i18n-attr').split(';').forEach(function(p){var k=p.split(':');var v=D.t[k[1]];if(v!=null)e.setAttribute(k[0],v)})});
document.querySelectorAll('.el').forEach(function(e){var n=e.querySelector('.nm'),m=e.querySelector('.ms');if(n&&D.n[e.dataset.z])n.textContent=D.n[e.dataset.z];if(m)m.textContent=m.textContent.replace(',','.')});
})()</script>`;
}

export function transformIndex(html: string, vars: SiteVars): string {
  const table = renderTable(elementsJson as unknown as Element[], textsEs, es, 'es');
  const withVars = html
    .replaceAll('%SITE_URL%', vars.siteUrl)
    .replaceAll('%REPO_URL%', vars.repoUrl)
    .replaceAll('%SNAPSHOT_DATE%', vars.snapshotDate);
  const html2 = fillI18n(withVars).replace('<!--ptable-->', table);
  return html2.replace('<script type="module"', `${earlyEnglishScript(html2)}\n    <script type="module"`);
}
