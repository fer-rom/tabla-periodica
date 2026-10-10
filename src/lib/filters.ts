/** Filtros combinables: AND entre grupos (bloque, categoría, estado, período), OR dentro de cada grupo. */
import type { Element } from '../data/types.ts';
import type { Filters, PhaseFilter } from '../state-types.ts';

export const phaseOf = (el: Element): PhaseFilter => el.phase ?? 'unknown';

export function matchesFilters(el: Element, f: Filters): boolean {
  return (
    (f.blocks.length === 0 || f.blocks.includes(el.block)) &&
    (f.categories.length === 0 || f.categories.includes(el.category)) &&
    (f.phases.length === 0 || f.phases.includes(phaseOf(el))) &&
    (f.periods.length === 0 || f.periods.includes(el.period))
  );
}

/** Conjunto visible: intersección de búsqueda, filtros y categoría resaltada. `null` = todos. */
export function visibleSet(
  elements: readonly Element[],
  searchResult: readonly number[] | null,
  filters: Filters,
  highlight: Element['category'] | null,
): Set<number> | null {
  const hasFilters =
    filters.blocks.length + filters.categories.length + filters.phases.length + filters.periods.length > 0;
  if (searchResult === null && !hasFilters && highlight === null) return null;
  const inSearch = searchResult === null ? null : new Set(searchResult);
  const out = new Set<number>();
  for (const el of elements) {
    if (inSearch && !inSearch.has(el.z)) continue;
    if (highlight !== null && el.category !== highlight) continue;
    if (!matchesFilters(el, filters)) continue;
    out.add(el.z);
  }
  return out;
}

/** Alterna un valor dentro de una lista (para chips de filtro). */
export function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
