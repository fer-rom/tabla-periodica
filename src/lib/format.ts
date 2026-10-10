/** Formateo de valores con unidades según el idioma. Puro: lo usan la app y el prerender. */
import type { Element, Isotope } from '../data/types.ts';
import { formatNumber, type Lang, type Translator } from '../i18n/index.ts';

export const NO_DATA = '—';

/** Masa para mostrar: peso atómico estándar o número másico entre corchetes. */
export function formatMass(lang: Lang, el: Pick<Element, 'atomicWeight' | 'massNumber'>): string {
  if (el.atomicWeight !== null) return formatNumber(lang, el.atomicWeight, { maximumFractionDigits: 6 });
  if (el.massNumber !== null) return `[${String(el.massNumber)}]`;
  return NO_DATA;
}

/** Valor con hasta `digits` cifras significativas y unidad opcional; null → «—». */
export function formatValue(lang: Lang, value: number | null, unit = '', digits = 4): string {
  if (value === null) return NO_DATA;
  const abs = Math.abs(value);
  const text =
    abs !== 0 && (abs < 0.001 || abs >= 1e6)
      ? formatScientific(lang, value, digits)
      : formatNumber(lang, Number(value.toPrecision(digits)), { maximumFractionDigits: 6 });
  return unit ? `${text}\u202f${unit}` : text;
}

export function formatScientific(lang: Lang, value: number, digits = 3): string {
  const [mant = '0', exp = '0'] = value.toExponential(digits - 1).split('e');
  return `${formatNumber(lang, Number(mant), { maximumFractionDigits: digits - 1 })} × 10${toSuperscript(Number(exp))}`;
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
/** Exponente en superíndice Unicode (solo para exponentes; la fuente cubre ¹²³ y el resto cae a la del sistema). */
export function toSuperscript(n: number): string {
  return (n < 0 ? '⁻' : '') + String(Math.abs(n)).replace(/\d/g, (d) => SUP[Number(d)] ?? d);
}

/** Kelvin con su equivalente en grados Celsius. */
export function formatKelvin(lang: Lang, k: number | null): string {
  if (k === null) return NO_DATA;
  const c = k - 273.15;
  return `${formatNumber(lang, k, { maximumFractionDigits: 2 })}\u202fK (${formatNumber(lang, c, { maximumFractionDigits: 1 })}\u202f°C)`;
}

export function formatOxidation(states: readonly number[]): string {
  if (states.length === 0) return NO_DATA;
  return states.map((s) => (s > 0 ? `+${String(s)}` : s < 0 ? `−${String(-s)}` : '0')).join(', ');
}

const YEAR_S = 365.2422 * 86400;

/** Semivida legible: elige la unidad natural (ms, s, min, h, días, años, millones de años…). */
export function formatHalfLife(tr: Translator, iso: Pick<Isotope, 'stable' | 'halfLife'>): string {
  if (iso.stable) return tr.t('panel.stable');
  const s = iso.halfLife;
  if (s === null) return NO_DATA;
  const v = (x: number): string => tr.num(Number(x.toPrecision(3)), { maximumFractionDigits: 3 });
  if (s < 1e-3) return tr.t('halfLife.us', { v: v(s * 1e6) });
  if (s < 1) return tr.t('halfLife.ms', { v: v(s * 1e3) });
  if (s < 120) return tr.t('halfLife.s', { v: v(s) });
  if (s < 7200) return tr.t('halfLife.min', { v: v(s / 60) });
  if (s < 2 * 86400) return tr.t('halfLife.h', { v: v(s / 3600) });
  const y = s / YEAR_S;
  if (y < 1) return tr.t('halfLife.d', { v: v(s / 86400) });
  if (y < 1e4) return tr.t('halfLife.y', { v: v(y) });
  if (y < 1e6) return tr.t('halfLife.ky', { v: v(y / 1e3) });
  if (y < 1e9) return tr.t('halfLife.My', { v: v(y / 1e6) });
  if (y < 1e12) return tr.t('halfLife.Gy', { v: v(y / 1e9) });
  const e = Math.floor(Math.log10(y));
  return tr
    .t('halfLife.long', { v: v(y / 10 ** e), e })
    .replace(/\^(-?\d+)/, (_, x: string) => toSuperscript(Number(x)));
}

/** Escapa texto para insertarlo en HTML generado como string (prerender). */
export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

/** «2p6» → «2p<sup>6</sup>» para configuraciones electrónicas. */
export function configToHtml(config: string): string {
  return escapeHtml(config).replace(/(\d[spdfg])(\d{1,2})/g, '$1<sup>$2</sup>');
}
