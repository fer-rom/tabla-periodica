/** localStorage con try/catch: en modo privado, con cookies bloqueadas o en vistas previas puede fallar. */
export function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento: la preferencia vale solo para esta visita.
  }
}
