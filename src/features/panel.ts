/**
 * Ficha de detalle (cargada bajo demanda): todos los datos por secciones y diagrama de Bohr.
 * Es un <dialog> modal: atrapa el foco, Esc cierra y el foco vuelve a la celda de origen.
 */
import { bohrSvg } from '../components/bohr.ts';
import type { Element } from '../data/types.ts';
import { h, prefersReducedMotion } from '../lib/dom.ts';
import {
  configToHtml,
  formatHalfLife,
  formatKelvin,
  formatMass,
  formatOxidation,
  formatValue,
  NO_DATA,
} from '../lib/format.ts';
import { byZ, nameOf, store, translator } from '../state.ts';
import { focusCell } from './grid.ts';
import { closeElement, openElement } from './router.ts';

const EV_TO_KJ_MOL = 96.485_332_12;

let dialog: HTMLDialogElement | null = null;
let shownZ: number | null = null;

function ensureDialog(): HTMLDialogElement {
  if (dialog) return dialog;
  const d = document.getElementById('panel') as HTMLDialogElement;
  d.addEventListener('cancel', (ev) => {
    ev.preventDefault();
    closeElement();
  });
  // Clic en el fondo (fuera del contenido) cierra.
  d.addEventListener('click', (ev) => {
    if (ev.target === d) closeElement();
  });
  d.addEventListener('keydown', (ev) => {
    if ((ev.target as HTMLElement).closest('input, select, textarea')) return;
    const z = store.get().selected;
    if (z === null) return;
    if (ev.key === 'ArrowRight' && z < 118) {
      ev.preventDefault();
      openElement(z + 1);
    } else if (ev.key === 'ArrowLeft' && z > 1) {
      ev.preventDefault();
      openElement(z - 1);
    }
  });
  store.select(
    (s) => s.selected,
    (z) => {
      if (z === null) hidePanel();
    },
  );
  store.select(
    (s) => s.bundle,
    () => {
      const z = store.get().selected;
      if (z !== null && dialog?.open) render(z);
    },
  );
  dialog = d;
  return d;
}

export function showPanel(z: number): void {
  const d = ensureDialog();
  if (!store.get().bundle) return;
  render(z);
  if (!d.open) {
    d.showModal();
    d.querySelector<HTMLElement>('.sheet-close')?.focus({ preventScroll: true });
  }
  focusCell(z, false);
}

function hidePanel(): void {
  if (!dialog?.open) return;
  const d = dialog;
  const z = shownZ;
  const finish = (): void => {
    d.classList.remove('closing');
    d.close();
    if (z !== null) focusCell(z, true);
  };
  if (prefersReducedMotion()) finish();
  else {
    d.classList.add('closing');
    d.addEventListener('animationend', finish, { once: true });
    setTimeout(finish, 320);
  }
}

function row(label: string, value: string | Node, hint?: string): HTMLElement {
  return h(
    'div',
    { class: 'kv' },
    h('dt', {}, label),
    h('dd', {}, value, hint ? h('span', { class: 'kv-hint' }, hint) : null),
  );
}

function section(title: string, ...children: (Node | null)[]): HTMLElement {
  return h('section', { class: 'sheet-section' }, h('h3', {}, title), ...children);
}

function html(markup: string): HTMLSpanElement {
  const span = h('span');
  span.innerHTML = markup; // marcado generado por la app (configToHtml escapa el texto)
  return span;
}

function render(z: number): void {
  const el = byZ(z);
  const d = dialog;
  if (!el || !d) return;
  shownZ = z;
  const tr = translator();
  const lang = tr.lang;
  const texts = store.get().bundle?.texts[String(z)];
  const name = nameOf(z);
  const prev = byZ(z - 1);
  const next = byZ(z + 1);

  const nav = (target: Element | undefined, dir: 'prev' | 'next'): HTMLElement => {
    const btn = h(
      'button',
      {
        type: 'button',
        class: 'btn icon',
        disabled: !target,
        'aria-label': target
          ? tr.t(dir === 'prev' ? 'panel.previous' : 'panel.next', { name: nameOf(target.z) })
          : null,
      },
      html(
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="${dir === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      ),
    );
    btn.addEventListener('click', () => {
      if (target) openElement(target.z);
    });
    return btn;
  };

  const close = h(
    'button',
    { type: 'button', class: 'btn icon sheet-close', 'aria-label': tr.t('panel.close') },
    html(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke-linecap="round"/></svg>',
    ),
  );
  close.addEventListener('click', closeElement);

  const share = h(
    'button',
    { type: 'button', class: 'btn' },
    html(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    ),
    tr.t('panel.share'),
  );
  share.addEventListener('click', () => {
    void shareElement(el, name, share);
  });

  const compare = h('button', { type: 'button', class: 'btn' }, tr.t('panel.compare'));
  compare.addEventListener('click', () => {
    void import('./compare.ts').then((m) => {
      m.startCompareWith(z);
    });
  });

  // Identidad
  const weight =
    el.atomicWeight !== null
      ? row(
          tr.t('panel.atomicWeightStandard'),
          `${formatMass(lang, el)}\u202fu`,
          el.atomicWeightInterval
            ? `${tr.t('panel.interval')}: [${tr.num(el.atomicWeightInterval[0], { maximumFractionDigits: 6 })}; ${tr.num(el.atomicWeightInterval[1], { maximumFractionDigits: 6 })}]`
            : undefined,
        )
      : row(tr.t('panel.atomicWeight'), formatMass(lang, el), tr.t('panel.massNumberNote'));

  const phaseText =
    el.phase !== null
      ? tr.t(`phases.${el.phase}`)
      : el.predictedPhase !== null
        ? tr.t('phases.predicted', { phase: tr.t(`phases.${el.predictedPhase}`) })
        : NO_DATA;

  const ie = el.ionizationEnergy;
  const ieText =
    ie === null ? NO_DATA : `${formatValue(lang, ie, 'eV', 5)} · ${formatValue(lang, ie * EV_TO_KJ_MOL, 'kJ/mol', 4)}`;

  const isoNatural = el.isotopes.some((i) => i.abundance !== null);
  const isoTable =
    el.isotopes.length === 0
      ? h('p', {}, NO_DATA)
      : h(
          'table',
          { class: 'iso' },
          h('caption', { class: 'sr-only' }, tr.t(isoNatural ? 'panel.isotopesNatural' : 'panel.isotopesLongLived')),
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              h('th', { scope: 'col' }, tr.t('panel.isotopes')),
              h('th', { scope: 'col' }, tr.t('panel.isotopeMass')),
              h('th', { scope: 'col' }, tr.t('panel.isotopeAbundance')),
              h('th', { scope: 'col' }, tr.t('panel.isotopeHalfLife')),
            ),
          ),
          h(
            'tbody',
            {},
            ...el.isotopes.map((iso) =>
              h(
                'tr',
                {},
                h('th', { scope: 'row' }, html(`<sup>${iso.a}</sup>${el.symbol}`)),
                h('td', {}, iso.mass === null ? NO_DATA : tr.num(iso.mass, { maximumFractionDigits: 5 })),
                h(
                  'td',
                  {},
                  iso.abundance === null
                    ? NO_DATA
                    : tr.num(iso.abundance, { style: 'percent', maximumFractionDigits: iso.abundance < 0.001 ? 4 : 2 }),
                ),
                h('td', {}, formatHalfLife(tr, iso)),
              ),
            ),
          ),
        );

  const content = h(
    'div',
    { class: 'sheet-body', 'data-cat': el.category },
    h(
      'header',
      { class: 'sheet-head', 'data-cat': el.category },
      h(
        'div',
        { class: 'tile', 'aria-hidden': 'true' },
        h('span', { class: 'z' }, String(el.z)),
        h('span', { class: 'sym' }, el.symbol),
      ),
      h(
        'div',
        { class: 'sheet-title' },
        h('h2', { id: 'panel-title' }, name),
        h('p', {}, `${tr.t(`categories.${el.category}`)} · ${tr.t('panel.atomicNumber')} ${el.z}`),
      ),
      h('div', { class: 'sheet-tools' }, nav(prev, 'prev'), nav(next, 'next'), close),
    ),
    h(
      'dl',
      { class: 'kv-grid' },
      weight,
      row(tr.t('panel.group'), el.group === null ? tr.t('panel.groupNone') : String(el.group)),
      row(tr.t('panel.period'), String(el.period)),
      row(tr.t('panel.block'), el.block),
    ),
    section(
      tr.t('panel.sectionStructure'),
      h(
        'div',
        { class: 'structure' },
        html(bohrSvg(el.symbol, el.shells, tr.t('panel.bohrLabel', { name, shells: el.shells.join(', ') }))),
        h(
          'dl',
          { class: 'kv-list' },
          row(tr.t('panel.configurationShort'), html(configToHtml(el.electronConfigurationShort))),
          row(tr.t('panel.configurationFull'), html(configToHtml(el.electronConfiguration))),
          row(tr.t('panel.shells'), el.shells.join(', ')),
        ),
      ),
    ),
    section(
      tr.t('panel.sectionPhysical'),
      h(
        'dl',
        { class: 'kv-grid' },
        row(tr.t('panel.phase'), phaseText, el.sublimes ? tr.t('panel.sublimes') : undefined),
        row(tr.t('properties.meltingPoint'), el.sublimes ? NO_DATA : formatKelvin(lang, el.meltingPoint)),
        row(
          tr.t(el.sublimes ? 'properties.sublimationPoint' : 'properties.boilingPoint'),
          formatKelvin(lang, el.boilingPoint),
        ),
        row(tr.t('properties.density'), formatValue(lang, el.density, 'g/cm³', 4)),
        row(tr.t('properties.atomicRadius'), formatValue(lang, el.atomicRadius, 'pm'), 'van der Waals'),
        row(tr.t('properties.covalentRadius'), formatValue(lang, el.covalentRadius, 'pm')),
      ),
    ),
    section(
      tr.t('panel.sectionChemical'),
      h(
        'dl',
        { class: 'kv-grid' },
        row(tr.t('properties.electronegativity'), formatValue(lang, el.electronegativity), 'Pauling'),
        row(tr.t('properties.ionizationEnergy'), ieText),
        row(tr.t('properties.electronAffinity'), formatValue(lang, el.electronAffinity, 'eV')),
        row(tr.t('panel.oxidationStates'), formatOxidation(el.oxidationStates)),
      ),
    ),
    section(
      tr.t('panel.sectionAbundance'),
      h('p', { class: 'iso-caption' }, tr.t(isoNatural ? 'panel.isotopesNatural' : 'panel.isotopesLongLived')),
      isoTable,
      h(
        'dl',
        { class: 'kv-grid' },
        row(tr.t('panel.crustAbundance'), formatValue(lang, el.crustAbundance, tr.t('panel.crustUnit'), 3)),
      ),
    ),
    section(
      tr.t('panel.sectionHistory'),
      h(
        'dl',
        { class: 'kv-grid' },
        row(
          tr.t('panel.discovered'),
          el.antiquity ? tr.t('panel.knownSinceAntiquity') : el.year === null ? NO_DATA : String(el.year),
        ),
        row(tr.t('panel.discoverers'), texts?.discoverers ?? NO_DATA),
      ),
      h('h4', {}, tr.t('panel.uses')),
      h('p', {}, texts?.uses ?? NO_DATA),
      h('h4', {}, tr.t('panel.fact')),
      h('p', {}, texts?.fact ?? NO_DATA),
      h('p', { class: 'kv-hint' }, tr.t('panel.editorialNote')),
    ),
    h('footer', { class: 'sheet-actions' }, share, compare),
  );

  d.setAttribute('aria-label', tr.t('panel.label', { name }));
  d.replaceChildren(content);
}

async function shareElement(el: Element, name: string, button: HTMLElement): Promise<void> {
  const tr = translator();
  const base = new URL(import.meta.env.BASE_URL, window.location.origin);
  const url = new URL(`${tr.lang === 'en' ? 'en/' : ''}e/${el.symbol.toLowerCase()}/`, base).href;
  const text = tr.t('panel.shareText', { name, symbol: el.symbol });
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: text, url });
      return;
    } catch {
      // Cancelado por el usuario o sin permiso: se copia el enlace.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    const label = button.lastChild;
    if (label) {
      const original = label.textContent;
      label.textContent = tr.t('panel.copied');
      setTimeout(() => {
        label.textContent = original;
      }, 1800);
    }
  } catch {
    window.prompt(text, url);
  }
}
