/**
 * Marcado de la grilla como string. Se ejecuta en el build (plugin de Vite) para que la tabla
 * llegue completa en el HTML: el LCP no depende del JavaScript. En el navegador, el JS solo
 * engancha eventos y cambia atributos; nunca vuelve a generar estas celdas.
 */
import { CATEGORIES, type Element, type ElementTexts } from '../data/types.ts';
import { createTranslator, type Lang, type Messages } from '../i18n/index.ts';
import { escapeHtml, formatMass } from './format.ts';

/** Fila CSS de la grilla: 1 = encabezados de grupo, 2–8 = períodos, 9 = separador, 10–11 = fila f. */
export const cssRow = (y: number): number => y + 1;
export const cssCol = (x: number): number => x + 1;

function renderLegend(tr: ReturnType<typeof createTranslator>): string {
  const items = CATEGORIES.map(
    (cat) =>
      `<li><button type="button" data-hl="${cat}" aria-pressed="false">` +
      `<span class="swatch" data-cat="${cat}" aria-hidden="true"></span>` +
      `<span data-i18n="categories.${cat}">${escapeHtml(tr.t(`categories.${cat}`))}</span></button></li>`,
  ).join('');
  return (
    `<div class="legend-area" id="legend-area">` +
    `<ul class="legend" data-i18n-attr="aria-label:legend.title" aria-label="${escapeHtml(tr.t('legend.title'))}">${items}` +
    `<li class="legend-static"><span class="swatch" data-cat="nonmetal" data-hydrogen aria-hidden="true"></span>` +
    `<span data-i18n="legend.hydrogen">${escapeHtml(tr.t('legend.hydrogen'))}</span></li></ul>` +
    `<p class="inset-hint" data-i18n="legend.hint">${escapeHtml(tr.t('legend.hint'))}</p></div>`
  );
}

export function cellLabel(tr: ReturnType<typeof createTranslator>, el: Element, name: string): string {
  return tr.t('grid.cellLabel', { name, symbol: el.symbol, z: el.z, category: tr.t(`categories.${el.category}`) });
}

export function renderTable(elements: readonly Element[], texts: ElementTexts, messages: Messages, lang: Lang): string {
  const tr = createTranslator(lang, messages);
  const out: string[] = [];
  // El contenedor visual es una grilla CSS; el role="grid" (con display: contents) solo agrupa filas
  // y celdas, de modo que encabezados, leyenda y marcadores quedan fuera del árbol del grid ARIA.
  out.push('<div class="ptable" id="ptable">');

  // Encabezados de grupo y período: decorativos (la información está en cada celda).
  for (let g = 1; g <= 18; g++) {
    const topRow = g === 1 || g === 18 ? 1 : g === 2 || g >= 13 ? 2 : 4;
    out.push(`<span class="ghead" aria-hidden="true" style="grid-area:${cssRow(topRow) - 1}/${cssCol(g)}">${g}</span>`);
  }
  for (let p = 1; p <= 7; p++) {
    out.push(`<span class="phead" aria-hidden="true" style="grid-area:${cssRow(p)}/1">${p}</span>`);
  }

  out.push(
    `<div class="pgrid" role="grid" aria-label="${escapeHtml(tr.t('grid.label'))}" aria-describedby="grid-hint" aria-rowcount="9" aria-colcount="18">`,
  );
  const rows = [1, 2, 3, 4, 5, 6, 7, 9, 10];
  rows.forEach((y, rowIndex) => {
    out.push(`<div role="row" class="prow" aria-rowindex="${rowIndex + 1}">`);
    for (const el of elements.filter((e) => e.y === y).sort((a, b) => a.x - b.x)) {
      const name = texts[String(el.z)]?.name ?? el.symbol;
      const first = el.z === 1;
      out.push(
        `<div role="gridcell" class="el" id="el-${el.z}" data-z="${el.z}" data-cat="${el.category}"${el.z === 1 ? ' data-hydrogen' : ''} data-block="${el.block}"` +
          ` aria-colindex="${el.x}" tabindex="${first ? 0 : -1}" aria-label="${escapeHtml(cellLabel(tr, el, name))}"` +
          ` style="grid-area:${cssRow(el.y)}/${cssCol(el.x)}">` +
          `<span class="z" aria-hidden="true">${el.z}</span>` +
          `<span class="sym" aria-hidden="true">${escapeHtml(el.symbol)}</span>` +
          `<span class="nm" aria-hidden="true">${escapeHtml(name)}</span>` +
          `<span class="ms" aria-hidden="true">${escapeHtml(formatMass(lang, el))}</span>` +
          `</div>`,
      );
    }
    out.push('</div>');
  });

  out.push('</div>');

  // Marcadores de la fila f dentro del cuerpo principal.
  out.push(
    `<a class="fmark" href="#frow" style="grid-area:${cssRow(6)}/${cssCol(3)}" data-frow="9" aria-label="${escapeHtml(tr.t('grid.lanthanides'))}"><span>57–71</span></a>`,
    `<a class="fmark" href="#frow" style="grid-area:${cssRow(7)}/${cssCol(3)}" data-frow="10" aria-label="${escapeHtml(tr.t('grid.actinides'))}"><span>89–103</span></a>`,
    `<span class="flabel" id="frow" data-i18n="grid.lanthanides" style="grid-area:${cssRow(9)}/1/span 1/${cssCol(3)}">${escapeHtml(tr.t('grid.lanthanides'))}</span>`,
    `<span class="flabel" data-i18n="grid.actinides" style="grid-area:${cssRow(10)}/1/span 1/${cssCol(3)}">${escapeHtml(tr.t('grid.actinides'))}</span>`,
    // El hueco superior central (grupos 3–12, períodos 1–2) aloja la tarjeta del elemento o los controles de la vista.
    `<div class="inset" id="inset" style="grid-area:1/${cssCol(3)}/${cssRow(3)}/${cssCol(13)}"></div>`,
    // Leyenda: siempre debajo de la tabla. Va en el HTML para que no empuje el contenido al cargar.
    renderLegend(tr),
  );
  out.push('</div>');
  return out.join('');
}
