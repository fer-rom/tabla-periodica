const sw = self;
// El plugin de build reemplaza estos marcadores por la lista de archivos y su hash.
const PRECACHE = JSON.parse("[\"assets/calculator-jWMJnD_4.js\",\"assets/compare-BoFe0GOw.js\",\"assets/en-D0qZTJsU.js\",\"assets/es-BFgCi74R.js\",\"assets/filters-dialog-D-OGbrw8.js\",\"assets/index-BaL0iznT.css\",\"assets/index-DnIY3uTI.js\",\"assets/panel-hSZvOZ-e.js\",\"assets/state-B4xmstcS.js\",\"assets/texts.en-DwWrqWzx.js\",\"assets/texts.es-DV--JI_U.js\",\"assets/trends-DvwzgnH5.js\",\"fonts/atkinson-next-var-latin.woff2\",\"icons/icon-192.png\",\"icons/icon-maskable-512.png\",\"icons/icon.svg\",\"index.html\",\"manifest.webmanifest\"]");
const VERSION = '5899f5e639e5';
const CACHE = `tabla-periodica-${VERSION}`;
const SCOPE = new URL(sw.registration.scope);
const INDEX = new URL('index.html', SCOPE).href;
sw.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        await cache.addAll(PRECACHE.map((path) => new Request(new URL(path, SCOPE).href, { cache: 'reload' })));
        await sw.skipWaiting();
    })());
});
sw.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith('tabla-periodica-') && k !== CACHE).map((k) => caches.delete(k)));
        await sw.clients.claim();
    })());
});
sw.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING')
        void sw.skipWaiting();
});
const SHARE_PAGE = /\/(en\/)?e\/([a-z]{1,2})\/?$/;
sw.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET')
        return;
    const url = new URL(request.url);
    if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname))
        return;
    if (request.mode === 'navigate') {
        const share = SHARE_PAGE.exec(url.pathname);
        if (share) {
            event.respondWith(fetch(request).catch(() => {
                const target = new URL(share[1] ? './?lang=en' : './', SCOPE);
                target.hash = share[2] ?? '';
                return Response.redirect(target.href, 302);
            }));
            return;
        }
        event.respondWith(serveIndex(event));
        return;
    }
    event.respondWith(caches.match(request, { ignoreSearch: true }).then((hit) => hit ??
        fetch(request).then((res) => {
            // Lo que no estaba en la lista (p. ej. imágenes de vista previa) se guarda al pasar.
            if (res.ok && res.type === 'basic') {
                const copy = res.clone();
                void caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
        })));
});
async function serveIndex(event) {
    try {
        const res = await fetch(event.request, { cache: 'no-cache' });
        if (res.ok) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((c) => c.put(INDEX, copy)));
        }
        return res;
    }
    catch {
        const cached = await caches.match(INDEX);
        return (cached ?? new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
    }
}
