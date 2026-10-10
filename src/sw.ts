/**
 * Service worker: precarga todo lo necesario en la instalación y responde cache-first,
 * así la app funciona sin conexión después de la primera visita.
 *
 * - Assets con hash, datos e idiomas: cache-first (nunca cambian para una misma versión).
 * - Navegaciones: se sirve el index.html de esta versión (coherente con sus assets).
 * - Páginas para compartir (/e/fe/): red primero; sin red, redirige a la ficha dentro de la app.
 * - Cada deploy genera una lista distinta → versión nueva → la app ofrece «Actualizar».
 */
/// <reference lib="webworker" />
export {};
const sw = self as unknown as ServiceWorkerGlobalScope;

// El plugin de build reemplaza estos marcadores por la lista de archivos y su hash.
const PRECACHE: readonly string[] = JSON.parse('__PRECACHE_LIST__') as string[];
const VERSION = '__PRECACHE_VERSION__';
const CACHE = `tabla-periodica-${VERSION}`;
const SCOPE = new URL(sw.registration.scope);
const INDEX = new URL('index.html', SCOPE).href;

sw.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((path) => new URL(path, SCOPE).href))));
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith('tabla-periodica-') && k !== CACHE).map((k) => caches.delete(k)),
      );
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void sw.skipWaiting();
});

const SHARE_PAGE = /\/(en\/)?e\/([a-z]{1,2})\/?$/;

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;

  if (request.mode === 'navigate') {
    const share = SHARE_PAGE.exec(url.pathname);
    if (share) {
      event.respondWith(
        fetch(request).catch(() => {
          const target = new URL(share[1] ? './?lang=en' : './', SCOPE);
          target.hash = share[2] ?? '';
          return Response.redirect(target.href, 302);
        }),
      );
      return;
    }
    event.respondWith(serveIndex(event));
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(
      (hit) =>
        hit ??
        fetch(request).then((res) => {
          // Lo que no estaba en la lista (p. ej. imágenes de vista previa) se guarda al pasar.
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        }),
    ),
  );
});

async function serveIndex(event: FetchEvent): Promise<Response> {
  // El index se actualiza solo junto con su service worker: así nunca apunta a assets
  // de otra versión que no estén guardados.
  const cached = await caches.match(INDEX);
  if (cached) return cached;
  try {
    return await fetch(event.request);
  } catch {
    return new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
