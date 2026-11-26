import type { DataAction } from '../services/aiService';

const MAX_RECOVERED_NAME_LENGTH = 96;
const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
const compact = (value: string) => value.replace(/\s+/gu, ' ').trim();

function isPlaceholder(value: string) {
  const name = fold(compact(value)).replace(/[.!:;]+$/u, '').trim();
  return /^(?:(?:mi|el|la|un|una) )?(?:desayuno|almuerzo|merienda|cena|snack|comida|bebida)(?: (?:registrad[oa]|estimad[oa]|pendiente|del dia|de hoy|de ayer|del coach|con ia|por ia))?$/u.test(name)
    || /^(?:registro|propuesta|estimacion) de (?:una )?comida$/u.test(name);
}

function recoverName(details: unknown): string {
  if (typeof details !== 'string') return '';
  // This is an extract from this action, never a summary of the conversation.
  // Keep the original description untouched, including its line breaks.
  const description = compact(details).replace(/^(?:comida|alimentos?|plato|bebida|descripci[oó]n|desayuno|almuerzo|merienda|cena|snack)\s*:\s*/iu, '');
  const comparable = fold(description);
  if (!description || !/\p{L}/u.test(description) || isPlaceholder(description)) return '';

  // Reject recognizable notes/assumptions instead of presenting them as a dish.
  // This deliberately does not guess ingredients or parse free-form Spanish.
  if (/^(?:sin|con|no|nota|notas|detalle|detalles|observacion|observaciones|supuesto|supuestos|asumo|asumi|asumido|estimacion|estimado|estimada|estimo|aproximadamente|aproximado|aproximada|cantidad|preparacion|porcion|porciones|racion|raciones|tamano|casero|casera|mediano|mediana|grande|pequeno|pequena|calorias|kcal|hora|fecha|hoy|ayer|anteayer|a las|alrededor de)\b/u.test(comparable)) return '';
  if (/^(?:al horno|a la plancha|al vapor|a la parrilla|hech[oa]s?|preparad[oa]s?|cocinad[oa]s?|se (?:asumio|estima|estimo|calculo|considero))\b/u.test(comparable)) return '';
  if (/^(?:una?|media|medio|doble|\d+(?:[.,]\d+)?)\s+(?:porcion|porciones|racion|raciones|plato|platos|unidad|unidades)\b/u.test(comparable)
    && !/\bde\s+\p{L}/u.test(comparable)) return '';
  if (/^[~≈]?\s*\d+(?:[.,]\d+)?\s*(?:kcal|calorias|g|gr|gramos|kg|ml|l|litros|hs?|horas|min|minutos)(?:\s|[.,;:]|$)/u.test(comparable)
    && !/^\d+(?:[.,]\d+)?\s*(?:g|gr|gramos|kg|ml|l|litros)\s+de\s+\p{L}/u.test(comparable)) return '';
  if (/^\d{1,4}[:/–-]\d{1,2}(?:[:/–-]\d{1,4})?(?:\s|$)/u.test(comparable)) return '';

  if (description.length <= MAX_RECOVERED_NAME_LENGTH) return description;
  const boundary = description.lastIndexOf(' ', MAX_RECOVERED_NAME_LENGTH - 1);
  // An unbroken token cannot be shortened at a word boundary safely.
  if (boundary <= 0) return '';
  return `${description.slice(0, boundary).trimEnd()}…`;
}

/**
 * Prepare only a newly received Coach action. Call once after response shape
 * validation, never on an existing record or a manually edited proposal.
 * An unresolved placeholder becomes an empty name so the UI keeps the draft
 * and asks the person to name it before saving; it is not a discarded action.
 */
export function prepareCoachMealAction(action: DataAction): DataAction {
  if (action.type !== 'add_meal' || typeof action.payload.name !== 'string'
    || !isPlaceholder(action.payload.name)) return action;
  return { ...action, payload: { ...action.payload, name: recoverName(action.payload.details) } };
}
