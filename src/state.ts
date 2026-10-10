import elementsJson from './data/elements.json' with { type: 'json' };
import type { Category, Element } from './data/types.ts';
import { createTranslator, type Bundle, type Lang, type Translator } from './i18n/index.ts';
import { createStore } from './lib/store.ts';

export const elements = elementsJson as unknown as readonly Element[];
export const byZ = (z: number): Element | undefined => elements[z - 1];
export const bySymbol = new Map(elements.map((e) => [e.symbol.toLowerCase(), e]));

export * from './state-types.ts';
import { NO_FILTERS, type Filters, type HeatProp, type Theme, type View } from './state-types.ts';

export interface AppState {
  readonly lang: Lang;
  readonly theme: Theme;
  readonly bundle: Bundle | null;
  readonly view: View;
  readonly heatProp: HeatProp;
  readonly temperature: number;
  readonly query: string;
  readonly filters: Filters;
  readonly highlight: Category | null;
  /** Elemento abierto en la ficha (Z) o null. */
  readonly selected: number | null;
  readonly compareMode: boolean;
  readonly compare: readonly number[];
  readonly fit: boolean;
}

const root = document.documentElement;

export const store = createStore<AppState>({
  lang: root.dataset.lang === 'en' ? 'en' : 'es',
  theme: root.dataset.theme === 'dark' ? 'dark' : 'light',
  bundle: null,
  view: 'category',
  heatProp: 'electronegativity',
  temperature: 298,
  query: '',
  filters: NO_FILTERS,
  highlight: null,
  selected: null,
  compareMode: false,
  compare: [],
  fit: false,
});

const translators = new WeakMap<Bundle, Translator>();

/** Traductor del idioma cargado. Solo se usa después de que el bundle está listo. */
export function translator(): Translator {
  const b = store.get().bundle;
  if (!b) throw new Error('i18n sin cargar');
  let tr = translators.get(b);
  if (!tr) {
    tr = createTranslator(b.lang, b.messages);
    translators.set(b, tr);
  }
  return tr;
}

export function nameOf(z: number): string {
  const b = store.get().bundle;
  return b?.texts[String(z)]?.name ?? byZ(z)?.symbol ?? String(z);
}

export const activeFilterCount = (f: Filters): number =>
  f.blocks.length + f.categories.length + f.phases.length + f.periods.length;
