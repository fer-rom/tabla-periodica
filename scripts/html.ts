/**
 * Transformaciones del HTML en tiempo de build: textos en el idioma por defecto,
 * grilla prerenderizada y variables del sitio. Sin DOM: expresiones regulares acotadas
 * a los atributos data-i18n que escribimos nosotros en index.html.
 */
import elementsJson from '../src/data/elements.json' with { type: 'json' };
import textsEs from '../src/data/texts.es.json' with { type: 'json' };
import es from '../src/i18n/es.json' with { type: 'json' };
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

export function transformIndex(html: string, vars: SiteVars): string {
  const table = renderTable(elementsJson as unknown as Element[], textsEs, es, 'es');
  const withVars = html
    .replaceAll('%SITE_URL%', vars.siteUrl)
    .replaceAll('%REPO_URL%', vars.repoUrl)
    .replaceAll('%SNAPSHOT_DATE%', vars.snapshotDate);
  return fillI18n(withVars).replace('<!--ptable-->', table);
}
