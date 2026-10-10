/**
 * Presupuesto de rendimiento sobre dist/: falla el build si se excede.
 *   JS total (gzip)              < 80 KB
 *   Peso total sin fuentes (gzip) < 300 KB   (todo lo que la app descarga y precarga)
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { appFiles } from './pwa.ts';

const DIST = join(import.meta.dirname, '..', 'dist');
const KB = 1024;
const BUDGET = { js: 80 * KB, total: 300 * KB };

const files = await appFiles(DIST);
const rows: { file: string; gz: number }[] = [];
for (const file of [...files, 'sw.js']) {
  const buf = await readFile(join(DIST, file));
  // Imágenes y fuentes ya vienen comprimidas: se cuentan tal cual.
  const gz = /\.(png|woff2)$/.test(file) ? buf.byteLength : gzipSync(buf, { level: 9 }).byteLength;
  rows.push({ file, gz });
}

const js = rows.filter((r) => r.file.endsWith('.js')).reduce((a, r) => a + r.gz, 0);
const total = rows.filter((r) => !r.file.startsWith('fonts/')).reduce((a, r) => a + r.gz, 0);
const fmt = (n: number): string => `${(n / KB).toFixed(1)} KB`;

for (const r of rows.sort((a, b) => b.gz - a.gz)) console.log(`  ${fmt(r.gz).padStart(9)}  ${r.file}`);
console.log(`\nJS total (gzip):          ${fmt(js)} / ${fmt(BUDGET.js)}`);
console.log(`Total sin fuentes (gzip): ${fmt(total)} / ${fmt(BUDGET.total)}`);

if (js > BUDGET.js || total > BUDGET.total) {
  console.error('✗ Presupuesto de rendimiento excedido');
  process.exit(1);
}
console.log('✓ Dentro del presupuesto');
