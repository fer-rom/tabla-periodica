/** Estado de un elemento a una temperatura dada (1 atm), a partir de sus puntos de fusión y ebullición. */
import type { Element } from '../data/types.ts';
import type { PhaseFilter } from '../state-types.ts';

export function phaseAt(el: Pick<Element, 'meltingPoint' | 'boilingPoint' | 'sublimes'>, kelvin: number): PhaseFilter {
  const { meltingPoint: mp, boilingPoint: bp, sublimes } = el;
  if (sublimes && bp !== null) return kelvin < bp ? 'solid' : 'gas';
  if (mp === null) return bp !== null && kelvin >= bp ? 'gas' : 'unknown';
  if (kelvin < mp) return 'solid';
  if (bp === null) return 'unknown'; // fundido, pero sin dato de ebullición: no se puede afirmar líquido ni gas
  return kelvin < bp ? 'liquid' : 'gas';
}
