/**
 * Páginas estáticas para compartir (/e/fe/ y /en/e/fe/): WhatsApp y los buscadores ignoran
 * el #hash, así que cada elemento necesita su propia URL con metadatos Open Graph.
 * La página redirige al instante a la ficha dentro de la app (/#Fe).
 */
import elementsJson from '../src/data/elements.json' with { type: 'json' };
import textsEs from '../src/data/texts.es.json' with { type: 'json' };
import textsEn from '../src/data/texts.en.json' with { type: 'json' };
import es from '../src/i18n/es.json' with { type: 'json' };
import en from '../src/i18n/en.json' with { type: 'json' };
import type { Element, ElementTexts } from '../src/data/types.ts';
import { createTranslator, type Lang } from '../src/i18n/index.ts';
import { escapeHtml, formatMass } from '../src/lib/format.ts';

export const elements = elementsJson as unknown as readonly Element[];
const TEXTS: Readonly<Record<Lang, ElementTexts>> = { es: textsEs, en: textsEn };

export interface SharePage {
  /** Ruta relativa al directorio de salida, p. ej. «e/fe/index.html». */
  readonly path: string;
  readonly html: string;
}

export function elementSummary(el: Element, lang: Lang): { title: string; description: string; name: string } {
  const tr = createTranslator(lang, lang === 'es' ? es : en);
  const name = TEXTS[lang][String(el.z)]?.name ?? el.symbol;
  return {
    name,
    title: tr.t('meta.elementTitle', { name, symbol: el.symbol }),
    description: tr.t('meta.elementDescription', {
      name,
      z: el.z,
      category: tr.t(`categories.${el.category}`),
      mass: formatMass(lang, el),
      config: el.electronConfigurationShort,
    }),
  };
}

export function sharePages(siteUrl: string): SharePage[] {
  const pages: SharePage[] = [];
  for (const lang of ['es', 'en'] as const) {
    const tr = createTranslator(lang, lang === 'es' ? es : en);
    for (const el of elements) {
      const sym = el.symbol.toLowerCase();
      const dir = `${lang === 'en' ? 'en/' : ''}e/${sym}/`;
      const up = lang === 'en' ? '../../../' : '../../';
      const target = `${up}?lang=${lang}#${el.symbol}`;
      const { title, description } = elementSummary(el, lang);
      const t = escapeHtml(title);
      const d = escapeHtml(description);
      pages.push({
        path: `${dir}index.html`,
        html: `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${siteUrl}${dir}">
<link rel="alternate" hreflang="es" href="${siteUrl}e/${sym}/">
<link rel="alternate" hreflang="en" href="${siteUrl}en/e/${sym}/">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${escapeHtml(tr.t('meta.title'))}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${siteUrl}${dir}">
<meta property="og:image" content="${siteUrl}og/${lang}/${sym}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${t}">
<meta property="og:locale" content="${lang === 'es' ? 'es_AR' : 'en_US'}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#13111c">
<link rel="icon" href="${up}icons/icon.svg" type="image/svg+xml">
<meta http-equiv="refresh" content="0; url=${target}">
<script>location.replace(${JSON.stringify(target)})</script>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#13111c;color:#ece9f4;font:1.0625rem/1.5 system-ui,sans-serif;padding:1.5rem}main{max-width:36rem}a{color:#ff7b6b}</style>
</head>
<body>
<main>
<h1>${t}</h1>
<p>${d}</p>
<p><a href="${target}">${escapeHtml(tr.t('meta.openInTable'))}</a></p>
</main>
</body>
</html>
`,
      });
    }
  }
  return pages;
}
