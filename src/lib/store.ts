/**
 * Estado centralizado mínimo: un objeto inmutable, `set` con parches parciales y
 * suscripciones por selector. Cada suscriptor se ejecuta solo si su porción cambió
 * (comparación por Object.is), así mover el slider de temperatura no toca el panel.
 */
export type Listener<T> = (value: T, previous: T) => void;

export interface Store<S> {
  get(): S;
  set(patch: Partial<S> | ((s: S) => Partial<S>)): void;
  select<T>(selector: (s: S) => T, listener: Listener<T>, options?: { immediate?: boolean }): () => void;
}

export function createStore<S extends object>(initial: S): Store<S> {
  let state = initial;
  const subs = new Set<{ selector: (s: S) => unknown; listener: Listener<unknown>; last: unknown }>();

  return {
    get: () => state,
    set(patch) {
      const next = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
      if (Object.keys(next).every((k) => Object.is(next[k as keyof S], state[k as keyof S]))) return;
      state = next;
      for (const sub of [...subs]) {
        const value = sub.selector(state);
        if (!Object.is(value, sub.last)) {
          const prev = sub.last;
          sub.last = value;
          sub.listener(value, prev);
        }
      }
    },
    select(selector, listener, options) {
      const sub = { selector, listener: listener as Listener<unknown>, last: selector(state) as unknown };
      subs.add(sub);
      if (options?.immediate)
        listener(sub.last as ReturnType<typeof selector>, sub.last as ReturnType<typeof selector>);
      return () => void subs.delete(sub);
    },
  };
}
