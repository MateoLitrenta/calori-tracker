import { coachDates } from '../src/utils/coachDates.ts';
import { isGoalDate, parseGoalValues, type CoachGoalValues } from '../src/utils/coachGoals.ts';

type Message = { role: string; text: string };
type Period = { startDate: string; endDate: string };
type Draft = { target: number; weekly: boolean; period?: Period };
export type WorkoutGoalConversation = { values: CoachGoalValues; reply?: never } | { reply: string; values?: never };
const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
const counts: Record<string, number> = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
const count = '(\\d{1,3}|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)';
const asCount = (value: string) => counts[value] ?? Number(value);
const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const month = `(?:${months.join('|')})(?: (?:de )?\\d{4})?`;
const periodText = `(?:(?:los )?proximos ${count} dias|esta semana|(?:el )?(?:mes de )?${month}|del \\d{4}-\\d{2}-\\d{2} al \\d{4}-\\d{2}-\\d{2})`;
const request = new RegExp(`^quiero (?:(?:(?:establecer|crear|definir|fijar) un objetivo de|un objetivo de|una meta de) )?(?:${count} (?:sesiones de entrenamiento|entrenamientos)|(?:entrenar|ir al gimnasio) ${count} veces)( por semana| a la semana)?(?: (?:durante |para |en )?(${periodText}))?$`);
const clarifyPeriod = new RegExp(`^(?:(?:perdon,? )?(?:(?:es|era) para |quise decir |para |durante |en )?)(${periodText})(?:,? no (?:${periodText}))?$`);
const totalChoice = new RegExp(`^(?:quiero|prefiero|acepto) (?:una meta|un objetivo) total de ${count} (?:sesiones|entrenamientos)(?: (?:durante |para |en )?(${periodText}))?(?:,? (?:sin exigir|sin tener que cumplir) (?:tres|\\d+) (?:sesiones|veces) (?:por|cada) semana)?$`);
const weeklyChoice = new RegExp(`^(?:quiero|prefiero|acepto) (?:la opcion semanal|un objetivo semanal)(?: (?:de )?${count} sesiones)?(?: (?:durante|para) (?:los )?proximos siete dias)?$`);
const saveReference = /^(?:¿)?(?:quiero guardar (?:mi|el) objetivo(?: que acabamos de definir)?|(?:podes|puedes) guardar mi objetivo|guardar mi objetivo)$/;
const noOtherGoals = /^(?:no,? )?(?:no quiero otras metas|no quiero otros objetivos|solo (?:esa meta|ese objetivo))$/;

function period(value: string, today: string): Period | undefined {
  const relative = value.match(new RegExp(`^(?:los )?proximos ${count} dias$`));
  if (relative) {
    const days = asCount(relative[1]);
    if (days < 1 || days > 31) return;
    return { startDate: today, endDate: coachDates(today, 1, -(days - 1))[0] };
  }
  if (value === 'esta semana') {
    const weekday = new Date(today + 'T12:00:00Z').getUTCDay();
    return { startDate: today, endDate: coachDates(today, 1, -((7 - weekday) % 7))[0] };
  }
  const dates = value.match(/^del (\d{4}-\d{2}-\d{2}) al (\d{4}-\d{2}-\d{2})$/);
  if (dates) return { startDate: dates[1], endDate: dates[2] };
  const namedMonth = value.match(new RegExp(`^(?:el )?(?:mes de )?(${months.join('|')})(?: (?:de )?(\\d{4}))?$`));
  if (!namedMonth) return;
  // An omitted year means the current year, never a silently rolled-over year.
  const year = Number(namedMonth[2] ?? today.slice(0, 4)), index = months.indexOf(namedMonth[1]);
  const startDate = `${String(year).padStart(4, '0')}-${String(index + 1).padStart(2, '0')}-01`;
  const end = new Date(startDate + 'T12:00:00Z'); end.setUTCMonth(index + 1, 0);
  if (!Number.isFinite(end.getTime())) return;
  return { startDate, endDate: end.toISOString().slice(0, 10) };
}

// Only complete, allowlisted user statements contribute values. Bot replies are
// never evidence of intent or persistence. An unrelated/ambiguous user turn
// breaks the draft instead of borrowing a stale goal from another topic.
export function workoutGoalConversation(messages: Message[], today: string): WorkoutGoalConversation | undefined {
  if (!isGoalDate(today)) return;
  let draft: Draft | undefined;
  let invalidPeriod = false;
  for (const message of messages) {
    if (message.role !== 'user') continue;
    const text = normalize(message.text).replace(/(?: y guardarlo en calori|\. quiero guardarlo en calori(?: para que puedas hacer seguimiento de mi progreso)?)$/, '')
      .replace(/ (?:comenzando|empezando) hoy$/, '');
    const initial = text.match(request);
    if (initial) {
      // periodText contains its own count capture after the two target captures.
      const target = asCount(initial[1] ?? initial[2]);
      const periodValue = initial[4];
      draft = { target, weekly: !!initial[3], period: periodValue ? period(periodValue, today) : undefined };
      invalidPeriod = !!periodValue && !draft.period;
      continue;
    }
    if (!draft) continue;
    const correction = text.match(clarifyPeriod);
    const total = text.match(totalChoice);
    const weekly = text.match(weeklyChoice);
    if (correction) {
      draft.period = period(correction[1], today); invalidPeriod = !draft.period;
    } else if (total) {
      draft.target = asCount(total[1]); draft.weekly = false;
      if (total[2]) { draft.period = period(total[2], today); invalidPeriod = !draft.period; }
    } else if (weekly) {
      // Choosing the offered weekly alternative is explicit consent to a NEW
      // seven-day period starting today, not a monthly recurrence conversion.
      if (weekly[1]) draft.target = asCount(weekly[1]);
      draft.weekly = false; draft.period = period('proximos siete dias', today); invalidPeriod = false;
    } else if (!saveReference.test(text) && !noOtherGoals.test(text)) {
      draft = undefined; invalidPeriod = false;
    }
  }
  if (!draft) return;
  if (invalidPeriod) return { reply: 'El período debe tener entre 1 y 31 días y fechas válidas. ¿Qué fechas querés usar? Todavía no se guardó ningún objetivo.' };
  if (draft.period && draft.period.endDate < today) return { reply: 'Ese período ya pasó. Conservo la meta que pediste: ¿qué período futuro querés usar? Todavía no se guardó ningún objetivo.' };
  if (draft.weekly) return { reply: `Pediste ${draft.target} sesiones por semana. Por ahora Calori guarda un total de sesiones por período y cuenta todos los entrenamientos registrados; no puede exigir una frecuencia cada semana ni filtrar solo gimnasio. Podés elegir un objetivo semanal de ${draft.target} sesiones en los próximos 7 días, o indicar y aceptar un total para el mes, sin exigir esa frecuencia semanal. ¿Cuál preferís? Todavía no se guardó ningún objetivo.` };
  if (!draft.period) return { reply: `Conservo tu meta de ${draft.target} sesiones. ¿Qué período o fechas querés usar? Todavía no se guardó ningún objetivo.` };
  const values = parseGoalValues({ type: 'workout_sessions', target: draft.target, ...draft.period, stepThreshold: null });
  if (!values) return { reply: 'La meta debe ser de 1 a 31 sesiones en un período de 1 a 31 días con fechas válidas. ¿Qué valores querés usar? Todavía no se guardó ningún objetivo.' };
  if (values.startDate < coachDates(today)[0] || values.startDate > coachDates(today, 1, -30)[0]) return { reply: 'El inicio debe estar entre los últimos 7 días y los próximos 31 días. ¿Qué fechas querés usar? Conservo la cantidad de sesiones; todavía no se guardó ningún objetivo.' };
  return { values };
}
