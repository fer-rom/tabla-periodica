/**
 * Descarga las fuentes oficiales y guarda un snapshot versionado en data/raw/.
 *
 * Se ejecuta en GitHub Actions (workflow `data.yml`), que tiene acceso a internet,
 * y el resultado se commitea al repo. Así cada valor de la app es trazable a un
 * archivo crudo con fecha y hash, y el build nunca depende de la red.
 *
 * Uso: npm run data:fetch
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const RAW_DIR = join(import.meta.dirname, '..', 'data', 'raw');
const UA = 'tabla-periodica-data-fetch/1.0 (+https://github.com/fer-rom/tabla-periodica)';

interface Source {
  readonly id: string;
  readonly url: string;
  readonly file: string;
  readonly publisher: string;
}

const SOURCES: readonly Source[] = [
  {
    id: 'pubchem-periodictable',
    publisher: 'PubChem (NIH/NCBI)',
    url: 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/periodictable/JSON',
    file: 'pubchem-periodictable.json',
  },
  {
    id: 'nist-compositions',
    publisher: 'NIST — Atomic Weights and Isotopic Compositions',
    url: 'https://physics.nist.gov/cgi-bin/Compositions/stand_alone.pl?ele=&ascii=ascii2&isotype=all',
    file: 'nist-compositions.txt',
  },
  {
    id: 'nist-ionization',
    publisher: 'NIST Atomic Spectra Database — Ionization Energies',
    url:
      'https://physics.nist.gov/cgi-bin/ASD/ie.pl?spectra=H-Og+I&submit=Retrieve+Data&units=1&format=2' +
      '&order=0&at_num_out=on&sp_name_out=on&ion_charge_out=on&el_name_out=on&e_out=0&unc_out=on&biblio=on',
    file: 'nist-ionization.csv',
  },
  {
    id: 'ciaaw-abridged',
    publisher: 'IUPAC CIAAW — Abridged standard atomic weights',
    url: 'https://www.ciaaw.org/abridged-atomic-weights.htm',
    file: 'ciaaw-abridged.html',
  },
  {
    id: 'ciaaw-standard',
    publisher: 'IUPAC CIAAW — Standard atomic weights',
    url: 'https://www.ciaaw.org/atomic-weights.htm',
    file: 'ciaaw-standard.html',
  },
];

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function get(url: string, attempt = 1): Promise<string> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.text();
  } catch (err) {
    if (attempt >= 4) throw new Error(`${url}: ${String(err)}`, { cause: err });
    await sleep(1500 * attempt);
    return get(url, attempt + 1);
  }
}

const sha256 = (s: string | Buffer): string => createHash('sha256').update(s).digest('hex');

/** Estructura mínima del JSON de PUG View que necesitamos recorrer. */
interface PugValue {
  Number?: number[];
  Unit?: string;
  StringWithMarkup?: { String: string }[];
}
interface PugInfo {
  ReferenceNumber?: number;
  Name?: string;
  Value?: PugValue;
}
interface PugSection {
  TOCHeading?: string;
  Section?: PugSection[];
  Information?: PugInfo[];
}
interface PugRecord {
  Record?: {
    Section?: PugSection[];
    Reference?: { ReferenceNumber: number; SourceName?: string; Name?: string; URL?: string }[];
  };
}

export interface FlatInfo {
  readonly path: string;
  readonly name: string | null;
  readonly text: string | null;
  readonly numbers: readonly number[] | null;
  readonly unit: string | null;
  readonly source: string | null;
  readonly sourceUrl: string | null;
}

/** Aplana una página de elemento de PUG View conservando ruta, valor, unidad y fuente. */
function flattenPug(json: PugRecord): FlatInfo[] {
  const refs = new Map((json.Record?.Reference ?? []).map((r) => [r.ReferenceNumber, r]));
  const out: FlatInfo[] = [];
  const walk = (sections: PugSection[] | undefined, trail: string[]): void => {
    for (const s of sections ?? []) {
      const path = [...trail, s.TOCHeading ?? '?'];
      for (const info of s.Information ?? []) {
        const ref = info.ReferenceNumber === undefined ? undefined : refs.get(info.ReferenceNumber);
        const text = info.Value?.StringWithMarkup?.map((m) => m.String).join(' | ') ?? null;
        out.push({
          path: path.join(' > '),
          name: info.Name ?? null,
          text,
          numbers: info.Value?.Number ?? null,
          unit: info.Value?.Unit ?? null,
          source: ref?.SourceName ?? null,
          sourceUrl: ref?.URL ?? null,
        });
      }
      walk(s.Section, path);
    }
  };
  walk(json.Record?.Section, []);
  return out;
}

async function main(): Promise<void> {
  await mkdir(RAW_DIR, { recursive: true });
  const retrieved = new Date().toISOString();
  const manifest: Record<string, unknown>[] = [];

  for (const src of SOURCES) {
    process.stdout.write(`↓ ${src.id} … `);
    const body = await get(src.url);
    await writeFile(join(RAW_DIR, src.file), body);
    manifest.push({ ...src, retrieved, bytes: Buffer.byteLength(body), sha256: sha256(body) });
    console.log(`${Buffer.byteLength(body)} bytes`);
    await sleep(500);
  }

  // Páginas por elemento de PubChem (descubridor, isótopos, abundancia, radios…).
  // PubChem pide ≤ 5 solicitudes por segundo.
  const elements: Record<number, FlatInfo[]> = {};
  for (let z = 1; z <= 118; z++) {
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/element/${z}/JSON`;
    const json = JSON.parse(await get(url)) as PugRecord;
    elements[z] = flattenPug(json);
    if (z % 10 === 0) console.log(`↓ pubchem element ${z}/118`);
    await sleep(350);
  }
  const flat = JSON.stringify(elements);
  const gz = gzipSync(flat, { level: 9 });
  await writeFile(join(RAW_DIR, 'pubchem-elements.json.gz'), gz);
  manifest.push({
    id: 'pubchem-elements',
    publisher: 'PubChem (NIH/NCBI) — PUG View element pages, flattened',
    url: 'https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/element/{1..118}/JSON',
    file: 'pubchem-elements.json.gz',
    retrieved,
    bytes: gz.byteLength,
    sha256: sha256(gz),
  });

  await writeFile(join(RAW_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('✓ snapshot guardado en data/raw/');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
