/** Tipos y constantes del estado, sin efectos secundarios (importables desde tests en Node). */
import type { Block, Category, Phase } from './data/types.ts';

export type Theme = 'light' | 'dark';
export type View = 'category' | 'heatmap' | 'temperature';
export const HEAT_PROPS = [
  'electronegativity',
  'atomicRadius',
  'ionizationEnergy',
  'density',
  'meltingPoint',
  'year',
] as const;
export type HeatProp = (typeof HEAT_PROPS)[number];
export type PhaseFilter = Phase | 'unknown';

export interface Filters {
  readonly blocks: readonly Block[];
  readonly categories: readonly Category[];
  readonly phases: readonly PhaseFilter[];
  readonly periods: readonly number[];
}

export const NO_FILTERS: Filters = { blocks: [], categories: [], phases: [], periods: [] };
