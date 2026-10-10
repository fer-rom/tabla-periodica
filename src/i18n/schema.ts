/** Forma de los mensajes: la define es.json. Solo se importa como tipo (no entra en el bundle). */
import es from './es.json' with { type: 'json' };

export type Messages = typeof es;
