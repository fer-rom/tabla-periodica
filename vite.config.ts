/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { transformIndex } from './scripts/html.ts';

const REPO_URL = 'https://github.com/fer-rom/tabla-periodica';
const ORIGIN = 'https://fer-rom.github.io';

/** Fecha del snapshot de fuentes (ISO, AAAA-MM-DD), tomada del manifiesto de data/raw. */
function snapshotDate(): string {
  const manifest = JSON.parse(readFileSync(new URL('./data/raw/manifest.json', import.meta.url), 'utf8')) as {
    retrieved: string;
  }[];
  return (manifest[0]?.retrieved ?? new Date().toISOString()).slice(0, 10);
}

function site(base: string): Plugin {
  return {
    name: 'tabla-periodica:site',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        transformIndex(html, { siteUrl: ORIGIN + base, repoUrl: REPO_URL, snapshotDate: snapshotDate() }),
    },
  };
}

export default defineConfig(({ command, isPreview }) => {
  const base = command === 'build' || isPreview ? (process.env.BASE_PATH ?? '/tabla-periodica/') : '/';
  return {
    base,
    plugins: [site(base)],
    build: {
      target: 'es2022',
      cssMinify: true,
      modulePreload: { polyfill: false },
      reportCompressedSize: true,
    },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
  };
});
