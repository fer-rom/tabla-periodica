/**
 * i18n propio y liviano.
 *
 * - `es.json` es la fuente de verdad: su forma define el tipo `Messages`.
 * - `en.json` se asigna a `Messages` al cargarse, así que una clave faltante es un error de compilación.
 * - Las claves sobrantes las detecta tests/i18n.test.ts (paridad exacta).
 * - Solo se descarga el idioma activo; el otro se precarga cuando el navegador está libre.
 */
import type { ElementTexts } from '../data/types.ts';

export type { Messages } from './schema.ts';
import type { Messages } from './schema.ts';
export const LANGS = ['es', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'es';

/** Rutas de clave «a.b.c» de un objeto anidado cuyas hojas son strings. */
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Messages>;
/** Claves con variantes de plural `_one` / `_other`. */
export type PluralKey = MessageKey extends infer K ? (K extends `${infer B}_other` ? B : never) : never;

export type Params = Readonly<Record<string, string | number>>;

const messageLoaders: Readonly<Record<Lang, () => Promise<Messages>>> = {
  es: () => import('./es.json', { with: { type: 'json' } }).then((m) => m.default),
  en: () =>
    import('./en.json', { with: { type: 'json' } }).then((m) => {
      const typed: Messages = m.default;
      return typed;
    }),
};

const textLoaders: Readonly<Record<Lang, () => Promise<ElementTexts>>> = {
  es: () => import('../data/texts.es.json', { with: { type: 'json' } }).then((m) => m.default as ElementTexts),
  en: () => import('../data/texts.en.json', { with: { type: 'json' } }).then((m) => m.default as ElementTexts),
};

export interface Bundle {
  readonly lang: Lang;
  readonly messages: Messages;
  readonly texts: ElementTexts;
}

const cache = new Map<Lang, Promise<Bundle>>();

export function loadBundle(lang: Lang): Promise<Bundle> {
  let p = cache.get(lang);
  if (!p) {
    p = Promise.all([messageLoaders[lang](), textLoaders[lang]()]).then(([messages, texts]) => ({
      lang,
      messages,
      texts,
    }));
    cache.set(lang, p);
  }
  return p;
}

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v);

/** Idioma de primera visita: español si el navegador empieza con «es», si no inglés. */
export function detectLang(languages: readonly string[]): Lang {
  const first = languages[0]?.toLowerCase() ?? DEFAULT_LANG;
  return first.startsWith('es') ? 'es' : 'en';
}

function lookup(messages: Messages, key: string): string {
  let node: unknown = messages;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return key;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : key;
}

export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = params[name];
    return v === undefined ? match : String(v);
  });
}

export interface Translator {
  readonly lang: Lang;
  t(key: MessageKey, params?: Params): string;
  /** Plural con Intl.PluralRules: elige `key_one` o `key_other`. */
  tp(key: PluralKey, n: number, params?: Params): string;
  /** Número con separadores del idioma (coma decimal en español). */
  num(value: number, options?: Intl.NumberFormatOptions): string;
}

const numberFormats = new Map<string, Intl.NumberFormat>();

export function formatNumber(lang: Lang, value: number, options: Intl.NumberFormatOptions = {}): string {
  const id = `${lang}|${JSON.stringify(options)}`;
  let f = numberFormats.get(id);
  if (!f) {
    f = new Intl.NumberFormat(lang === 'es' ? 'es' : 'en-US', options);
    numberFormats.set(id, f);
  }
  return f.format(value);
}

export function createTranslator(lang: Lang, messages: Messages): Translator {
  const rules = new Intl.PluralRules(lang);
  return {
    lang,
    t: (key, params) => interpolate(lookup(messages, key), params),
    tp: (key, n, params) => {
      const form = rules.select(n) === 'one' ? 'one' : 'other';
      return interpolate(lookup(messages, `${key}_${form}`), { n: formatNumber(lang, n), ...params });
    },
    num: (value, options) => formatNumber(lang, value, options),
  };
}
