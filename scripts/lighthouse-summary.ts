/**
 * Resume los resultados de Lighthouse CI (.lighthouseci/lhr-*.json): mediana por URL de las
 * cuatro categorías y de las métricas clave, como anotaciones de GitHub y resumen del job.
 * Falla si alguna categoría baja de 95 o si LCP ≥ 1,5 s o CLS ≥ 0,05.
 */
import { appendFile, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Lhr {
  finalDisplayedUrl: string;
  categories: Record<string, { score: number | null }>;
  audits: Record<string, { numericValue?: number }>;
}

const DIR = '.lighthouseci';
const CATS = ['performance', 'accessibility', 'best-practices', 'seo'] as const;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
};

const files = (await readdir(DIR)).filter((f) => /^lhr-.*\.json$/.test(f));
const byUrl = new Map<string, Lhr[]>();
for (const f of files) {
  const lhr = JSON.parse(await readFile(join(DIR, f), 'utf8')) as Lhr;
  const list = byUrl.get(lhr.finalDisplayedUrl) ?? [];
  list.push(lhr);
  byUrl.set(lhr.finalDisplayedUrl, list);
}

let failed = false;
const lines = ['| URL | Perf | A11y | BP | SEO | LCP | CLS | TBT |', '|---|---|---|---|---|---|---|---|'];
for (const [url, runs] of byUrl) {
  const score = (c: string): number => Math.round(median(runs.map((r) => (r.categories[c]?.score ?? 0) * 100)));
  const metric = (a: string): number => median(runs.map((r) => r.audits[a]?.numericValue ?? 0));
  const s = CATS.map(score);
  const lcp = metric('largest-contentful-paint');
  const cls = metric('cumulative-layout-shift');
  const tbt = metric('total-blocking-time');
  const text = `Perf ${s[0]} · A11y ${s[1]} · BP ${s[2]} · SEO ${s[3]} · LCP ${(lcp / 1000).toFixed(2)} s · CLS ${cls.toFixed(3)} · TBT ${Math.round(tbt)} ms (${runs.length} corridas)`;
  console.log(`::notice title=Lighthouse ${url}::${text}`);
  lines.push(
    `| ${url} | ${s.join(' | ')} | ${(lcp / 1000).toFixed(2)} s | ${cls.toFixed(3)} | ${Math.round(tbt)} ms |`,
  );
  if (s.some((v) => v < 95) || lcp >= 1500 || cls >= 0.05) {
    failed = true;
    console.log(`::error title=Presupuesto Lighthouse::${url} no cumple: ${text}`);
  }
}
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
if (failed) process.exit(1);
