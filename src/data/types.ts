/**
 * Modelo de datos de la tabla periódica.
 *
 * Convenciones de unidades (validadas en tests/data.test.ts):
 * - masas: unidad de masa atómica unificada (u = Da)
 * - radios: picómetros (pm)
 * - energías: electronvoltios (eV)
 * - temperaturas: kelvin (K)
 * - densidad: g/cm³ (también para gases, a 273 K y 1 atm)
 * - abundancia en la corteza: mg/kg (ppm en masa)
 * - abundancia isotópica: fracción molar entre 0 y 1
 *
 * `null` significa desconocido o no aplicable. La interfaz lo muestra como «—».
 */

export const BLOCKS = ['s', 'p', 'd', 'f'] as const;
export type Block = (typeof BLOCKS)[number];

/** Clasificación según el campo GroupBlock de PubChem. IUPAC no define estas categorías. */
export const CATEGORIES = [
  'alkali-metal',
  'alkaline-earth-metal',
  'transition-metal',
  'post-transition-metal',
  'metalloid',
  'nonmetal',
  'halogen',
  'noble-gas',
  'lanthanide',
  'actinide',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const PHASES = ['solid', 'liquid', 'gas'] as const;
export type Phase = (typeof PHASES)[number];

export interface Isotope {
  /** Número másico A. */
  readonly a: number;
  /** Masa atómica relativa del isótopo (u). */
  readonly mass: number | null;
  /** Fracción molar natural (0–1). `null` si no tiene abundancia natural representativa. */
  readonly abundance: number | null;
  readonly stable: boolean;
  /** Período de semidesintegración en segundos (`null` si es estable o no se conoce). */
  readonly halfLife: number | null;
}

/** Datos numéricos e invariantes por idioma. */
export interface Element {
  /** Número atómico Z (1–118). */
  readonly z: number;
  readonly symbol: string;
  /**
   * Peso atómico estándar abreviado (IUPAC/CIAAW).
   * `null` para elementos sin peso atómico estándar (ver `massNumber`).
   */
  readonly atomicWeight: number | null;
  /** Intervalo del peso atómico estándar cuando IUPAC lo publica como intervalo. */
  readonly atomicWeightInterval: readonly [number, number] | null;
  /** Número másico del isótopo más estable, para elementos sin peso atómico estándar. */
  readonly massNumber: number | null;
  /** Grupo 1–18. `null` para lantánidos y actínidos de la fila f. */
  readonly group: number | null;
  readonly period: number;
  readonly block: Block;
  readonly category: Category;
  /** Columna de la grilla (1–18). */
  readonly x: number;
  /** Fila de la grilla (1–7; 9 = lantánidos; 10 = actínidos). */
  readonly y: number;
  readonly electronConfiguration: string;
  readonly electronConfigurationShort: string;
  /** Electrones por capa, de K hacia afuera. */
  readonly shells: readonly number[];
  /** Escala de Pauling (adimensional). */
  readonly electronegativity: number | null;
  /** Radio atómico de van der Waals (pm). */
  readonly atomicRadius: number | null;
  /** Radio covalente (pm). */
  readonly covalentRadius: number | null;
  /** Primera energía de ionización (eV). */
  readonly ionizationEnergy: number | null;
  /** Afinidad electrónica (eV). */
  readonly electronAffinity: number | null;
  readonly oxidationStates: readonly number[];
  /** Estado a 298 K y 1 atm. `null` si no se conoce experimentalmente. */
  readonly phase: Phase | null;
  /** Estado predicho teóricamente cuando no hay dato experimental. */
  readonly predictedPhase: Phase | null;
  /** Punto de fusión (K). */
  readonly meltingPoint: number | null;
  /** Punto de ebullición (K). Para elementos que subliman, temperatura de sublimación. */
  readonly boilingPoint: number | null;
  /** El elemento sublima a 1 atm en lugar de fundir. */
  readonly sublimes: boolean;
  /** Densidad (g/cm³). */
  readonly density: number | null;
  /** Año de descubrimiento. `null` si se conoce desde la antigüedad o no está registrado. */
  readonly year: number | null;
  readonly antiquity: boolean;
  readonly isotopes: readonly Isotope[];
  /** Abundancia en la corteza terrestre (mg/kg). */
  readonly crustAbundance: number | null;
}

/** Textos por idioma, en archivos separados para cargar solo el idioma activo. */
export interface ElementText {
  readonly name: string;
  /** Variantes aceptadas para la búsqueda (p. ej. «tungsteno», «cinc»). */
  readonly aliases: readonly string[];
  /** Descubridor/es o institución (los nombres de instituciones se traducen). */
  readonly discoverers: string | null;
  readonly uses: string | null;
  readonly fact: string | null;
}

export type ElementTexts = Readonly<Record<string, ElementText>>;
