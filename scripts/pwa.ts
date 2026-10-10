/**
 * Paso final del build: escribe las páginas para compartir y genera dist/sw.js con la lista
 * de precarga (todo lo que la app necesita para funcionar sin conexión) y su versión.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import ts from 'typescript';
import { sharePages } from './share-pages.ts';

/** Fuera de la precarga: páginas para compartir, imágenes de vista previa, licencias y el propio SW. */
const EXCLUDE = [
  /^e\//,
  /^en\//,
  /^og\//,
  /^sw\.js$/,
  /\.txt$/,
  /^icons\/apple-touch-icon\.png$/,
  /^icons\/icon-512\.png$/,
];

async function walk(dir: string, root = dir): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, root)));
    else out.push(relative(root, full).split(sep).join('/'));
  }
  return out;
}

/** Archivos que la app descarga y guarda para funcionar sin conexión. */
export async function appFiles(outDir: string): Promise<string[]> {
  return (await walk(outDir)).filter((f) => !EXCLUDE.some((re) => re.test(f))).sort();
}

export async function finishBuild(
  outDir: string,
  siteUrl: string,
  swSource: string,
): Promise<{ files: number; version: string }> {
  for (const page of sharePages(siteUrl)) {
    const file = join(outDir, page.path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, page.html);
  }

  const files = await appFiles(outDir);
  const hash = createHash('sha256');
  for (const f of files) {
    hash.update(f);
    hash.update(await readFile(join(outDir, f)));
  }
  const version = hash.digest('hex').slice(0, 12);

  const js = ts
    .transpileModule(swSource, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: false },
    })
    .outputText.replace(/^export \{\};\s*$/m, '')
    .replace("'__PRECACHE_LIST__'", JSON.stringify(JSON.stringify(files)))
    .replace('__PRECACHE_VERSION__', version);
  await writeFile(join(outDir, 'sw.js'), js);
  return { files: files.length, version };
}
