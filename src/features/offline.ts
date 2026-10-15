/**
 * Registro del service worker y estado de conexión en el pie: «Lista para usar sin conexión»,
 * «Sin conexión» y aviso de versión nueva con botón para actualizar.
 */
import { $, h } from '../lib/dom.ts';
import { store, translator } from '../state.ts';

type NetState = 'pending' | 'ready' | 'offline' | 'update';

let state: NetState = 'pending';
let waiting: ServiceWorker | null = null;

export function initOffline(): void {
  const net = $('#net');
  const render = (): void => {
    if (!store.get().bundle) return;
    const tr = translator();
    const shown: NetState = !navigator.onLine ? 'offline' : state;
    net.dataset.state = shown === 'update' ? 'ready' : shown;
    if (shown === 'pending') {
      net.replaceChildren();
      return;
    }
    if (shown === 'update') {
      const btn = h('button', { type: 'button', class: 'linklike' }, tr.t('footer.update'));
      btn.addEventListener('click', () => {
        waiting?.postMessage({ type: 'SKIP_WAITING' });
      });
      net.replaceChildren(`${tr.t('footer.updateReady')}. `, btn);
      return;
    }
    net.replaceChildren(tr.t(shown === 'offline' ? 'footer.offline' : 'footer.offlineReady'));
  };
  store.select((s) => s.bundle, render);
  window.addEventListener('online', render);
  window.addEventListener('offline', render);

  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const base = import.meta.env.BASE_URL;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).then((reg) => {
      const track = (worker: ServiceWorker | null): void => {
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              waiting = worker;
              state = 'update';
            } else state = 'ready';
            render();
          }
          if (worker.state === 'activated' && state === 'pending') {
            state = 'ready';
            render();
          }
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) {
        waiting = reg.waiting;
        state = 'update';
      } else if (reg.active) state = 'ready';
      track(reg.installing);
      reg.addEventListener('updatefound', () => {
        track(reg.installing);
      });
      render();
    });
    // Si una versión nueva reemplaza a la que controlaba la página, se recarga una vez
    // para que la página y sus archivos sean de la misma versión.
    const hadController = navigator.serviceWorker.controller !== null;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading || !hadController) return;
      reloading = true;
      window.location.reload();
    });
  });
}
