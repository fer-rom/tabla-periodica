/**
 * Imágenes de vista previa (Open Graph, 1200×630) para cada elemento en ambos idiomas y para
 * la portada. Se renderizan con Chromium headless usando la misma fuente de la app.
 * Corre después de `vite build` (en CI, antes del deploy): npm run og
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import es from '../src/i18n/es.json' with { type: 'json' };
import en from '../src/i18n/en.json' with { type: 'json' };
import type { Category, Element } from '../src/data/types.ts';
import { createTranslator, type Lang } from '../src/i18n/index.ts';
import { escapeHtml, formatMass } from '../src/lib/format.ts';
import { elements, elementSummary } from './share-pages.ts';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'dist', 'og');

const HUE: Readonly<Record<Category, number>> = {
  'alkali-metal': 25,
  'alkaline-earth-metal': 62,
  'transition-metal': 240,
  'post-transition-metal': 200,
  metalloid: 160,
  nonmetal: 125,
  halogen: 95,
  'noble-gas': 295,
  lanthanide: 330,
  actinide: 355,
};

const BALMER = `<svg width="56" height="56" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1c1928"/><rect x="13" y="14" width="3.6" height="36" rx="1.8" fill="#8f5cf0"/><rect x="19" y="14" width="4" height="36" rx="2" fill="#5c6bf0"/><rect x="28.5" y="14" width="4.4" height="36" rx="2.2" fill="#22b8cf"/><rect x="45" y="14" width="5.4" height="36" rx="2.7" fill="#ff5a4e"/></svg>`;

function shell(fontUrl: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:A;src:url(${fontUrl}) format('woff2');font-weight:200 800}
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px}
body{background:#13111c;color:#ece9f4;font-family:A,sans-serif;font-variant-numeric:tabular-nums;overflow:hidden;position:relative}
.wrap{position:absolute;inset:64px 72px;display:flex;gap:64px;align-items:center}
.tile{flex:none;width:380px;height:420px;border-radius:24px;padding:28px 34px;display:grid;grid-template-rows:auto 1fr auto;background:oklch(30% calc(var(--c,1) * .07) var(--h));box-shadow:inset 0 -14px 0 oklch(74% calc(var(--c,1) * .13) var(--h))}
.z{font-size:44px;color:#c9c3dd}
.sym{font-size:190px;font-weight:800;line-height:1;align-self:center;letter-spacing:-.02em}
.mass{font-size:36px;color:#c9c3dd}
.info{display:grid;gap:18px;min-width:0}
.name{font-size:84px;font-weight:800;line-height:1.02;letter-spacing:-.015em}
.cat{font-size:34px;color:oklch(80% calc(var(--c,1) * .12) var(--h))}
.cfg{font-size:32px;color:#c9c3dd}
.cfg sup{font-size:.62em;vertical-align:.7em;line-height:0}
.brand{position:absolute;left:72px;bottom:40px;display:flex;align-items:center;gap:16px;font-size:28px;font-weight:700;color:#c9c3dd}
.lines{position:absolute;right:72px;bottom:52px;display:flex;gap:10px;align-items:end}
.lines i{display:block;width:6px;height:34px;border-radius:3px}
.home{position:absolute;inset:60px 72px;display:grid;grid-template-columns:repeat(18,1fr);grid-auto-rows:44px;gap:5px;align-content:start}
.home b{border-radius:6px;background:oklch(32% calc(var(--c,1) * .07) var(--h));box-shadow:inset 0 -4px 0 oklch(72% calc(var(--c,1) * .13) var(--h));font-size:17px;display:grid;place-items:center;font-weight:700}
.title{position:absolute;left:72px;right:72px;bottom:110px;font-size:64px;font-weight:800;letter-spacing:-.015em}
.sub{position:absolute;left:72px;bottom:62px;font-size:28px;color:#c9c3dd}
</style></head><body>${body}</body></html>`;
}

function elementCard(el: Element, lang: Lang): string {
  const tr = createTranslator(lang, lang === 'es' ? es : en);
  const { name } = elementSummary(el, lang);
  const cfg = escapeHtml(el.electronConfigurationShort).replace(/(\d[spdf])(\d{1,2})/g, '$1<sup>$2</sup>');
  return `<div class="wrap" style="--h:${HUE[el.category]};${el.z === 1 ? '--c:0' : ''}">
  <div class="tile"><span class="z">${el.z}</span><span class="sym">${escapeHtml(el.symbol)}</span><span class="mass">${escapeHtml(formatMass(lang, el))}</span></div>
  <div class="info"><p class="name">${escapeHtml(name)}</p><p class="cat">${escapeHtml(tr.t(`categories.${el.category}`))}</p><p class="cfg">${cfg}</p></div>
</div>
<div class="brand">${BALMER}${escapeHtml(tr.t('meta.title'))}</div>
<div class="lines"><i style="background:#8f5cf0"></i><i style="background:#5c6bf0"></i><i style="background:#22b8cf"></i><i style="background:#ff5a4e;width:8px"></i></div>`;
}

function homeCard(lang: Lang): string {
  const tr = createTranslator(lang, lang === 'es' ? es : en);
  const cells = elements
    .filter((e) => e.y <= 7)
    .map(
      (e) =>
        `<b style="grid-column:${e.x};grid-row:${e.y};--h:${HUE[e.category]};${e.z === 1 ? '--c:0' : ''}">${escapeHtml(e.symbol)}</b>`,
    )
    .join('');
  return `<div class="home">${cells}</div>
<p class="title">${escapeHtml(tr.t('meta.title'))}</p>
<p class="sub">IUPAC · PubChem · NIST — ${lang === 'es' ? 'español / inglés, sin conexión' : 'English / Spanish, works offline'}</p>`;
}

async function main(): Promise<void> {
  const font = await readFile(join(ROOT, 'public', 'fonts', 'atkinson-next-var-latin.woff2'));
  const fontUrl = `data:font/woff2;base64,${font.toString('base64')}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const shot = async (html: string, file: string): Promise<void> => {
    await page.setContent(shell(fontUrl, html), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await writeFile(file, await page.screenshot({ type: 'png' }));
  };
  for (const lang of ['es', 'en'] as const) {
    await mkdir(join(OUT, lang), { recursive: true });
    for (const el of elements) await shot(elementCard(el, lang), join(OUT, lang, `${el.symbol.toLowerCase()}.png`));
    await shot(homeCard(lang), join(OUT, lang === 'es' ? 'home.png' : 'home-en.png'));
    console.log(`✓ og/${lang}: ${elements.length + 1} imágenes`);
  }
  await browser.close();
}

await main();
