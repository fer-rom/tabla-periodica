/** Escalas de los mapas de calor: dominio a partir de los datos, lineal o logarítmica según la propiedad. */
import type { Element } from '../data/types.ts';
import type { HeatProp } from '../state-types.ts';

export interface HeatScale {
  readonly prop: HeatProp;
  readonly log: boolean;
  readonly min: number;
  readonly max: number;
  /** Valor normalizado 0–1, o null si el elemento no tiene dato. */
  readonly t: (el: Element) => number | null;
  readonly value: (el: Element) => number | null;
}

/** Los elementos conocidos desde la antigüedad se ubican en el extremo inferior de la escala de años. */
export function heatValue(el: Element, prop: HeatProp): number | null {
  return el[prop];
}

const LOG_PROPS: ReadonlySet<HeatProp> = new Set(['density']);

export function heatScale(elements: readonly Element[], prop: HeatProp): HeatScale {
  const log = LOG_PROPS.has(prop);
  const values = elements.map((e) => heatValue(e, prop)).filter((v): v is number => v !== null && (!log || v > 0));
  const tf = (v: number): number => (log ? Math.log10(v) : v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const lo = tf(min);
  const span = tf(max) - lo || 1;
  const t = (el: Element): number | null => {
    if (prop === 'year' && el.antiquity) return 0;
    const v = heatValue(el, prop);
    if (v === null || (log && v <= 0)) return null;
    return (tf(v) - lo) / span;
  };
  return { prop, log, min, max, t, value: (el) => heatValue(el, prop) };
}
