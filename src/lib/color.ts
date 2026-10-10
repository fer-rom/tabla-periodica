/**
 * Escalas de color perceptualmente uniformes y aptas para daltónicos (viridis, de matplotlib)
 * y color de cuerpo negro para el slider de temperatura.
 */

type RGB = readonly [number, number, number];

const VIRIDIS: readonly RGB[] = [
  [68, 1, 84],
  [72, 40, 120],
  [62, 73, 137],
  [49, 104, 142],
  [38, 130, 142],
  [31, 158, 137],
  [53, 183, 121],
  [109, 205, 89],
  [180, 222, 44],
  [253, 231, 37],
];

const hex = (c: RGB): string => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

function sample(stops: readonly RGB[], t: number): RGB {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i] ?? [0, 0, 0];
  const b = stops[i + 1] ?? a;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export const viridis = (t: number): string => hex(sample(VIRIDIS, t));

/** Gradiente CSS de la escala, para la leyenda. */
export function viridisGradient(direction = 'to right'): string {
  return `linear-gradient(${direction}, ${VIRIDIS.map((c, i) => `${hex(c)} ${((i / (VIRIDIS.length - 1)) * 100).toFixed(1)}%`).join(', ')})`;
}

function luminance([r, g, b]: RGB): number {
  const lin = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const contrast = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

// Negro puro: con blanco como alternativa garantiza contraste ≥ 4,5:1 en toda la escala.
const DARK_INK: RGB = [0, 0, 0];
const LIGHT_INK: RGB = [255, 255, 255];

/** Tinta (oscura o blanca) con mayor contraste sobre el color de la escala. */
export function inkFor(t: number): string {
  const bg = luminance(sample(VIRIDIS, t));
  return contrast(bg, luminance(DARK_INK)) >= contrast(bg, luminance(LIGHT_INK)) ? hex(DARK_INK) : hex(LIGHT_INK);
}

/** Contraste WCAG entre el color de la escala y su tinta (para tests). */
export function inkContrast(t: number): number {
  const bg = luminance(sample(VIRIDIS, t));
  const ink = inkFor(t) === hex(DARK_INK) ? DARK_INK : LIGHT_INK;
  return contrast(bg, luminance(ink));
}

/**
 * Color aproximado de un cuerpo negro a la temperatura T (K), con su brillo:
 * por debajo del punto de Draper (~798 K) no emite luz visible.
 * Aproximación de Tanner Helland al locus de Planck (válida ~1000–40 000 K).
 */
export function blackbody(kelvin: number): string {
  const t = Math.max(1000, kelvin) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const clamp = (v: number): number => Math.min(255, Math.max(0, v));
  // Intensidad: oscuro hasta el punto de Draper, luego crece hasta saturar cerca de 3000 K.
  const glow = Math.min(1, Math.max(0, (kelvin - 798) / 2200)) ** 0.6;
  const base = 38;
  const mix = (v: number): number => base + (clamp(v) - base) * glow;
  return hex([mix(r), mix(g), mix(b)]);
}

/** Gradiente CSS del cuerpo negro entre 0 y `max` K. */
export function blackbodyGradient(max: number, steps = 24): string {
  const stops: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const k = (i / steps) * max;
    stops.push(`${blackbody(k)} ${((i / steps) * 100).toFixed(1)}%`);
  }
  return `linear-gradient(to right, ${stops.join(', ')})`;
}
