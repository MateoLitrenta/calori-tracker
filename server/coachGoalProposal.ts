import { coachDates } from '../src/utils/coachDates.ts';
import { isGoalDate, parseGoalValues, type CoachGoal, type CoachGoalValues } from '../src/utils/coachGoals.ts';
import { normalizeGoalSuggestion } from './coachGoals.ts';
import { workoutGoalConversation } from './coachGoalConversation.ts';

const normalized = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const words: Record<string, number> = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
const number = '(\\d{1,2}|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)';
// Whole-message allowlist, not keyword extraction. Extra dates, negations,
// conditions, quotes, alternatives or restrictions prevent this fallback.
const workoutRequest = new RegExp(`^quiero (?:establecer|crear|definir|fijar) un objetivo de ${number} (?:sesiones de entrenamiento|entrenamientos) (?:durante|para) (?:los )?proximos ${number} dias(?: (?:comenzando|empezando) hoy)?(?: y guardarlo en calori|\\. quiero guardarlo en calori(?: para que puedas hacer seguimiento de mi progreso)?)?\\.?$`);
export function explicitWorkoutGoal(text: string, today: string): CoachGoalValues | undefined {
  if (!isGoalDate(today)) return;
  const match = normalized(text).match(workoutRequest);
  if (!match) return;
  const target = words[match[1]] ?? Number(match[1]), days = words[match[2]] ?? Number(match[2]);
  if (!Number.isSafeInteger(days) || days < 1 || days > 31) return;
  return parseGoalValues({ type: 'workout_sessions', target, startDate: today,
    endDate: coachDates(today, 1, -(days - 1))[0], stepThreshold: null });
}

function isNonCommittingRequest(text: string) {
  return /(?:^|\b)(?:no|nunca|tampoco)\s+(?:(?:quiero|deseo|voy a|vamos a)\s+)?(?:lo\s+)?(?:establec\w*|cre\w*|defin\w*|fij\w*|guard\w*|registr\w*|acept\w*|cancel\w*|modific\w*|seguir|sigas)\b|\bsin (?:guardar|registrar|aceptar)\b/.test(text)
    || /["“”«»]|\b(?:o|tal vez|quizas|si)\b/.test(text)
    || /^(?:¿\s*)?(?:si\b|supongamos\b|imagina\b|imaginemos\b|hipoteticamente\b|que pasaria\b|y si\b|como\b|cuantos\b|cuantas\b|cuales\b|que objetivos tengo\b|quiero (?:ver|consultar|saber)\b)/.test(text);
}

export function resolveCoachGoalProposal(input: { text: string; messages?: { role: string; text: string }[]; today: string; reply: string; suggestion: unknown;
  availability: 'available' | 'disabled' | 'unavailable'; goals: CoachGoal[] }) {
  const conversation = workoutGoalConversation(input.messages ?? [{ role: 'user', text: input.text }], input.today);
  if (conversation) {
    if (input.availability === 'disabled') return { reply: 'Los objetivos persistentes no están habilitados. No preparé una propuesta para guardar; podemos seguir conversando sobre un plan.' };
    if (input.availability === 'unavailable') return { reply: 'No pude consultar tus objetivos y no preparé una propuesta para guardar. Intentá nuevamente cuando estén disponibles.' };
    if (conversation.reply) return { reply: conversation.reply };
    const goalProposal = normalizeGoalSuggestion({ ...conversation.values, operation: 'accept' }, input.today, input.goals);
    if (goalProposal) return { goalProposal, reply: `Preparé una propuesta de ${goalProposal.target} sesiones de entrenamiento del ${goalProposal.startDate} al ${goalProposal.endDate}. Cuenta todos los entrenamientos registrados, sin exigir una frecuencia semanal ni filtrar solo gimnasio. Revisala y aceptala con el botón; todavía no está guardada.` };
  }
  const text = normalized(input.text), reply = normalized(input.reply);
  const blocked = isNonCommittingRequest(text);
  const unsupportedRecurrence = !blocked && /\b(?:(?:por|a la|cada) semana|semanales?)\b/.test(text);
  const explicit = blocked ? undefined : explicitWorkoutGoal(input.text, input.today);
  const mentionsGoal = /\bobjetivos?\b/.test(text);
  const goalCommand = !blocked && mentionsGoal && /\b(?:quiero|necesito|establece|crea|define|fija|guarda|guardar|cancela|cancelar|modifica|modificar)\b/.test(text);
  const hasTarget = new RegExp(`\\b${number} (?:sesion(?:es)?(?: de entrenamiento)?|entrenamientos?|veces)\\b`).test(text)
    || (new RegExp(`\\b${number} dias\\b`).test(text) && /\b\d{3,6} pasos\b/.test(text));
  const hasPeriod = new RegExp(`\\bproximos ${number} dias\\b|\\besta semana\\b`).test(text)
    || /\b\d{4}-\d{2}-\d{2}\b.*\b\d{4}-\d{2}-\d{2}\b/.test(text);
  const invalidDates = (text.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? []).some(date => !isGoalDate(date));
  const invalidExactRequest = workoutRequest.test(text) && !explicit;
  const writeClaim = /\b(?:guarde|registre|acepte|cancele|modifique|actualice)\b/.test(reply)
    || (/(?:\bobjetivos?\b.{0,60}\b(?:guardad[oa]|aceptad[oa]|registrad[oa]|cancelad[oa]|modificad[oa]|actualizad[oa])\b|\b(?:guardad[oa]|aceptad[oa]|registrad[oa]|cancelad[oa]|modificad[oa]|actualizad[oa])\b.{0,60}\bobjetivos?\b)/.test(reply)
      && (goalCommand || input.suggestion != null || input.goals.length === 0));
  const confirmationPromise = /\bobjetivos?\b/.test(reply) && /confirm|\b(?:propuesta|propon(?:go|emos)|listo para guardar)\b/.test(reply);
  let modelProposal = !blocked && !invalidDates && !invalidExactRequest && input.availability === 'available'
    ? normalizeGoalSuggestion(input.suggestion, input.today, input.goals) : undefined;
  if (modelProposal?.operation === 'accept' && (!hasTarget || !hasPeriod || unsupportedRecurrence)) modelProposal = undefined;
  const goalProposal = input.availability === 'available' && explicit
    ? normalizeGoalSuggestion({ ...explicit, operation: 'accept' }, input.today, input.goals) : modelProposal;
  if (goalProposal) {
    // Bind the reply to the user's exact values, even when Gemini disagrees.
    return { goalProposal, reply: explicit
      ? `Preparé una propuesta de ${goalProposal.target} sesiones de entrenamiento del ${goalProposal.startDate} al ${goalProposal.endDate}. Revisala y aceptala con el botón; todavía no está guardada.`
      : writeClaim ? 'Preparé una propuesta de objetivo para que la revises y confirmes con el botón. Todavía no se guardó ningún cambio.' : input.reply };
  }
  if (goalCommand || explicit || unsupportedRecurrence || input.suggestion != null || writeClaim || confirmationPromise) {
    if (input.availability === 'disabled') return { reply: 'Los objetivos persistentes no están habilitados. No preparé una propuesta para guardar; podemos seguir conversando sobre un plan.' };
    if (input.availability === 'unavailable') return { reply: 'No pude consultar tus objetivos y no preparé una propuesta para guardar. Intentá nuevamente cuando estén disponibles.' };
    if (blocked) return { reply: 'Podemos hablar de tus objetivos sin guardarlos. No preparé una propuesta de confirmación.' };
    if (unsupportedRecurrence) return { reply: 'Calori guarda un total por período y todavía no admite recurrencias semanales. Elegí una meta para los próximos 7 días, o un total mensual sin exigir una frecuencia cada semana. Indicame la cantidad y el período; todavía no se guardó ningún objetivo.' };
    return { reply: 'No pude preparar una propuesta confirmable. Indicame el tipo de objetivo, la meta y el período o las fechas que querés seguir. No se guardó ningún cambio.' };
  }
  return { reply: input.reply };
}
