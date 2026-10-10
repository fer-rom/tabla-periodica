/**
 * Hidrata la grilla prerenderizada: un único listener delegado para clic y teclado,
 * tabindex itinerante y actualizaciones por atributo. Las 118 celdas nunca se regeneran;
 * cada cambio de estado escribe solo en las celdas cuyo valor cambió.
 */
import { formatMass } from '../lib/format.ts';
import { inkFor, viridis } from '../lib/color.ts';
import { heatScale } from '../lib/heat.ts';
import { phaseAt } from '../lib/phase.ts';
import { cellLabel } from '../lib/render-table.ts';
import { $ } from '../lib/dom.ts';
import { elements, nameOf, store, translator, type HeatProp } from '../state.ts';

const ROWS = [1, 2, 3, 4, 5, 6, 7, 9, 10] as const;

/** cells[z] = celda del elemento Z. */
const cells: HTMLElement[] = [];
/** matrix[fila][x] = Z (o undefined en huecos). */
const matrix = new Map<number, (number | undefined)[]>();
let table: HTMLElement;
let current = 1;

export type ActivateHandler = (z: number, source: 'click' | 'keyboard') => void;

export function initGrid(onActivate: ActivateHandler): void {
  table = $('#ptable');
  for (const y of ROWS)
    matrix.set(
      y,
      Array.from({ length: 19 }, () => undefined),
    );
  for (const el of elements) {
    const cell = document.getElementById(`el-${el.z}`);
    if (!cell) throw new Error(`Falta la celda ${el.z}`);
    cells[el.z] = cell;
    const row = matrix.get(el.y);
    if (row) row[el.x] = el.z;
  }

  table.addEventListener('click', (ev) => {
    const cell = (ev.target as Element).closest<HTMLElement>('.el');
    if (cell?.dataset.z) {
      const z = Number(cell.dataset.z);
      focusCell(z, false);
      onActivate(z, 'click');
      return;
    }
    const mark = (ev.target as Element).closest<HTMLElement>('.fmark');
    if (mark) {
      ev.preventDefault();
      focusCell(mark.dataset.frow === '9' ? 57 : 89, true);
    }
  });

  table.addEventListener('keydown', (ev) => {
    const cell = (ev.target as Element).closest<HTMLElement>('.el');
    if (!cell?.dataset.z) return;
    const z = Number(cell.dataset.z);
    const next = navigate(z, ev.key, ev.ctrlKey || ev.metaKey);
    if (next !== null) {
      ev.preventDefault();
      focusCell(next, true);
    } else if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      onActivate(z, 'keyboard');
    }
  });

  store.select(
    (s) => s.fit,
    (fit) => {
      table.dataset.fit = String(fit);
    },
  );
  store.select(
    (s) => s.bundle,
    () => {
      updateNames();
    },
  );
  store.select(
    (s) => s.view,
    (view) => {
      table.dataset.view = view;
      if (view === 'heatmap') applyHeat(store.get().heatProp);
      if (view === 'temperature') applyTemperature(store.get().temperature);
    },
    { immediate: true },
  );
  store.select(
    (s) => s.heatProp,
    (prop) => {
      if (store.get().view === 'heatmap') applyHeat(prop);
    },
  );
  store.select(
    (s) => s.temperature,
    (k) => {
      if (store.get().view === 'temperature') applyTemperature(k);
    },
  );
}

/** Movimiento con flechas, Inicio/Fin y Ctrl+Inicio/Fin, saltando huecos de la tabla. */
export function navigate(z: number, key: string, ctrl: boolean): number | null {
  const el = elements[z - 1];
  if (!el) return null;
  const rowIndex = ROWS.indexOf(el.y as (typeof ROWS)[number]);
  const row = matrix.get(el.y) ?? [];
  const inRow = (r: (number | undefined)[]): number[] => r.filter((v): v is number => v !== undefined);
  switch (key) {
    case 'ArrowRight':
      for (let x = el.x + 1; x <= 18; x++) if (row[x] !== undefined) return row[x] ?? null;
      return null;
    case 'ArrowLeft':
      for (let x = el.x - 1; x >= 1; x--) if (row[x] !== undefined) return row[x] ?? null;
      return null;
    case 'ArrowDown':
    case 'ArrowUp': {
      const step = key === 'ArrowDown' ? 1 : -1;
      for (let r = rowIndex + step; r >= 0 && r < ROWS.length; r += step) {
        const target = matrix.get(ROWS[r] ?? 0) ?? [];
        if (target[el.x] !== undefined) return target[el.x] ?? null;
        // Sin celda en la misma columna (p. ej. de Be hacia arriba): la más cercana de esa fila.
        const candidates = inRow(target);
        if (candidates.length > 0 && (step < 0 ? r < rowIndex : r > rowIndex)) {
          const nearest = candidates.reduce((best, c) =>
            Math.abs((elements[c - 1]?.x ?? 0) - el.x) < Math.abs((elements[best - 1]?.x ?? 0) - el.x) ? c : best,
          );
          return nearest;
        }
      }
      return null;
    }
    case 'Home':
      return ctrl ? 1 : (inRow(row)[0] ?? null);
    case 'End':
      return ctrl ? 118 : (inRow(row).at(-1) ?? null);
    default:
      return null;
  }
}

export function focusCell(z: number, moveFocus: boolean): void {
  const prev = cells[current];
  const next = cells[z];
  if (!next) return;
  if (prev && prev !== next) prev.tabIndex = -1;
  next.tabIndex = 0;
  current = z;
  if (moveFocus) {
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

export function cellOf(z: number): HTMLElement | undefined {
  return cells[z];
}

/** Atenúa las celdas fuera del conjunto visible (null = todas visibles). */
export function applyVisible(visible: ReadonlySet<number> | null): void {
  for (const el of elements) {
    const cell = cells[el.z];
    if (!cell) continue;
    const dim = visible !== null && !visible.has(el.z);
    if (dim !== cell.hasAttribute('data-dim')) cell.toggleAttribute('data-dim', dim);
  }
}

export function setAttrOn(z: number, attr: string, on: boolean): void {
  const cell = cells[z];
  if (cell && cell.hasAttribute(attr) !== on) cell.toggleAttribute(attr, on);
}

/** Nombres, masas y etiquetas accesibles en el idioma activo (solo al cambiar de idioma). */
function updateNames(): void {
  const s = store.get();
  if (!s.bundle) return;
  const tr = translator();
  for (const el of elements) {
    const cell = cells[el.z];
    if (!cell) continue;
    const name = nameOf(el.z);
    const nm = cell.querySelector('.nm');
    const ms = cell.querySelector('.ms');
    if (nm && nm.textContent !== name) nm.textContent = name;
    const mass = formatMass(s.lang, el);
    if (ms && ms.textContent !== mass) ms.textContent = mass;
    cell.setAttribute('aria-label', cellLabel(tr, el, name));
  }
}

const heatCache = new Map<HeatProp, Map<number, [string, string] | null>>();

function applyHeat(prop: HeatProp): void {
  let colors = heatCache.get(prop);
  if (!colors) {
    const scale = heatScale(elements, prop);
    colors = new Map(
      elements.map((el) => {
        const t = scale.t(el);
        return [el.z, t === null ? null : [viridis(t), inkFor(t)]];
      }),
    );
    heatCache.set(prop, colors);
  }
  for (const el of elements) {
    const cell = cells[el.z];
    const c = colors.get(el.z);
    if (!cell) continue;
    if (c) {
      cell.style.setProperty('--heat', c[0]);
      cell.style.setProperty('--heat-ink', c[1]);
      if (cell.hasAttribute('data-null')) cell.removeAttribute('data-null');
    } else if (!cell.hasAttribute('data-null')) cell.setAttribute('data-null', '');
  }
}

let rafId = 0;
let pendingK = 298;

/** El slider puede disparar decenas de eventos por segundo: se agrupan en un cuadro de animación. */
function applyTemperature(kelvin: number): void {
  pendingK = kelvin;
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    for (const el of elements) {
      const cell = cells[el.z];
      if (!cell) continue;
      const phase = phaseAt(el, pendingK);
      if (cell.dataset.phase !== phase) cell.dataset.phase = phase;
    }
  });
}
