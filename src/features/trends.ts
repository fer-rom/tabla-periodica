/**
 * Tendencias periódicas explicadas visualmente: una mini tabla coloreada con los datos reales
 * y una flecha que indica hacia dónde aumenta cada propiedad.
 */
import { h } from '../lib/dom.ts';
import { inkFor, viridis } from '../lib/color.ts';
import { heatScale } from '../lib/heat.ts';
import { elements, store, translator, type HeatProp } from '../state.ts';
import type { Element } from '../data/types.ts';

type TrendId = 'electronegativity' | 'atomicRadius' | 'ionizationEnergy' | 'metallic';
const TRENDS: readonly TrendId[] = ['electronegativity', 'atomicRadius', 'ionizationEnergy', 'metallic'];
/** Dirección de aumento: hacia arriba a la derecha o hacia abajo a la izquierda. */
const UP_RIGHT: ReadonlySet<TrendId> = new Set(['electronegativity', 'ionizationEnergy']);

const CELL = 22;
const GAP = 2;
const COLS = 18;
const ROWS = 7;
const W = COLS * (CELL + GAP);
const H = ROWS * (CELL + GAP);

let root: HTMLElement;
let active: TrendId = 'electronegativity';

const METAL_LEVEL: Readonly<Record<Element['category'], number | null>> = {
  'alkali-metal': 1,
  'alkaline-earth-metal': 0.9,
  lanthanide: 0.8,
  actinide: 0.8,
  'transition-metal': 0.7,
  'post-transition-metal': 0.55,
  metalloid: 0.35,
  nonmetal: 0.12,
  halogen: 0.06,
  'noble-gas': null,
};

function valueOf(trend: TrendId): (el: Element) => number | null {
  if (trend === 'metallic') return (el) => METAL_LEVEL[el.category];
  const scale = heatScale(elements, trend);
  return (el) => scale.t(el);
}

function miniTable(trend: TrendId, label: string): string {
  const t = valueOf(trend);
  const cells: string[] = [];
  for (const el of elements) {
    if (el.y > 7) continue; // la fila f no cambia la lectura de la tendencia
    const v = t(el);
    const x = (el.x - 1) * (CELL + GAP);
    const y = (el.y - 1) * (CELL + GAP);
    const fill = v === null ? 'var(--paper-3)' : viridis(v);
    const ink = v === null ? 'var(--ink-2)' : inkFor(v);
    cells.push(
      `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="3" fill="${fill}"/>` +
        `<text x="${x + CELL / 2}" y="${y + CELL / 2 + 0.5}" fill="${ink}">${el.symbol}</text>`,
    );
  }
  const up = UP_RIGHT.has(trend);
  // Dos flechas en los bordes, sin tapar datos: a lo largo del período (abajo) y del grupo (izquierda).
  const hy = H + 14;
  const vx = -16;
  const [hx1, hx2] = up ? [0, W - 6] : [W - 6, 0];
  const [vy1, vy2] = up ? [H - 2, 4] : [4, H - 2];
  return (
    `<svg class="mini" viewBox="-30 -4 ${W + 34} ${H + 30}" role="img" aria-label="${label}">` +
    `<defs><marker id="ah-${trend}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="var(--accent)"/></marker></defs>` +
    `<g class="mini-cells">${cells.join('')}</g>` +
    `<line class="mini-arrow" x1="${hx1}" y1="${hy}" x2="${hx2}" y2="${hy}" marker-end="url(#ah-${trend})"/>` +
    `<line class="mini-arrow" x1="${vx}" y1="${vy1}" x2="${vx}" y2="${vy2}" marker-end="url(#ah-${trend})"/>` +
    `</svg>`
  );
}

export function initTrends(): void {
  root = document.getElementById('trends-root') as HTMLElement;
  store.select((s) => s.bundle, render);
  render();
}

function render(): void {
  if (!store.get().bundle) return;
  const tr = translator();
  const tabs = h('div', { class: 'seg trends-tabs', role: 'group', 'aria-label': tr.t('trends.title') });
  for (const id of TRENDS) {
    const b = h('button', { type: 'button', 'aria-pressed': String(id === active) }, tr.t(`trends.${id}.title`));
    b.addEventListener('click', () => {
      active = id;
      render();
      root.querySelector<HTMLButtonElement>(`.trends-tabs button[aria-pressed="true"]`)?.focus();
    });
    tabs.append(b);
  }
  const figure = h('figure', { class: 'trend-figure' });
  const title = tr.t(`trends.${active}.title`);
  const direction = tr.t(`trends.${active}.direction`);
  figure.innerHTML = miniTable(active, `${title}: ${tr.t('trends.increases')} ${direction}`);
  const show = h('button', { type: 'button', class: 'btn' }, tr.t('trends.showOnTable'));
  show.addEventListener('click', () => {
    if (active === 'metallic') store.set({ view: 'category', highlight: null });
    else store.set({ view: 'heatmap', heatProp: active as HeatProp });
    document.getElementById('tabla')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  root.replaceChildren(
    tabs,
    h(
      'div',
      { class: 'trend' },
      figure,
      h(
        'div',
        { class: 'trend-text' },
        h('h3', {}, title),
        h('p', { class: 'trend-dir' }, `${tr.t('trends.increases')} ${direction}`),
        h('p', {}, tr.t(`trends.${active}.body`)),
        show,
      ),
    ),
  );
}
