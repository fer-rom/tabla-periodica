/**
 * Diagrama de Bohr en SVG: núcleo con el símbolo y una órbita por capa con sus electrones.
 * Cada órbita gira con una animación CSS de `transform` (rotación), más lenta hacia afuera
 * y en sentidos alternados; con movimiento reducido queda quieta.
 */
import { escapeHtml } from '../lib/format.ts';

const SIZE = 220;
const C = SIZE / 2;

export function bohrSvg(symbol: string, shells: readonly number[], label: string): string {
  const n = shells.length;
  const inner = 30;
  const outer = C - 8;
  const step = n > 1 ? (outer - inner) / (n - 1) : 0;
  const rings: string[] = [];
  shells.forEach((count, i) => {
    const r = inner + i * step;
    const dots: string[] = [];
    const dotR = n > 5 ? 2.6 : 3.4;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 - Math.PI / 2;
      dots.push(
        `<circle cx="${(C + r * Math.cos(a)).toFixed(2)}" cy="${(C + r * Math.sin(a)).toFixed(2)}" r="${dotR}"/>`,
      );
    }
    const dur = 14 + i * 7;
    rings.push(
      `<circle class="orbit" cx="${C}" cy="${C}" r="${r.toFixed(2)}"/>` +
        `<g class="electrons" style="--dur:${dur}s;--dir:${i % 2 === 0 ? 'normal' : 'reverse'}">${dots.join('')}</g>`,
    );
  });
  return (
    `<svg class="bohr" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="${escapeHtml(label)}">` +
    `<circle class="nucleus" cx="${C}" cy="${C}" r="${inner - 10}"/>` +
    `<text class="nucleus-label" x="${C}" y="${C}" text-anchor="middle" dominant-baseline="central">${escapeHtml(symbol)}</text>` +
    rings.join('') +
    `</svg>`
  );
}
