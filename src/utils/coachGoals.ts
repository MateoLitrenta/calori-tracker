import { coachDates } from './coachDates.ts';
import { aggregateCoachMetrics } from './coachCardMetrics.ts';
import type { HabitDay } from './coachContextContract.ts';

export type CoachGoalType = 'workout_sessions' | 'step_days';
export interface CoachGoalValues {
  type: CoachGoalType; target: number; startDate: string; endDate: string; stepThreshold: number | null;
}
export interface CoachGoal extends CoachGoalValues {
  id: string; status: 'active' | 'cancelled'; version: number; createdAt: string; updatedAt: string;
}
export interface CoachGoalProposal extends CoachGoalValues {
  operation: 'accept' | 'update' | 'cancel'; id: string; expectedVersion?: number;
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const isGoalId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export function isGoalDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function goalDates(goal: Pick<CoachGoalValues, 'startDate' | 'endDate'>): string[] {
  const length = Math.round((Date.parse(goal.endDate + 'T12:00:00Z') - Date.parse(goal.startDate + 'T12:00:00Z')) / 86400000) + 1;
  return length > 0 && length <= 31 ? coachDates(goal.endDate, length) : [];
}
export function parseGoalValues(value: unknown): CoachGoalValues | undefined {
  const goal = object(value);
  if (!isGoalDate(goal.startDate) || !isGoalDate(goal.endDate) || !Number.isSafeInteger(goal.target) || (goal.target as number) < 1) return;
  const dates = goalDates({ startDate: goal.startDate, endDate: goal.endDate });
  if (!dates.length) return;
  if (goal.type === 'workout_sessions' && (goal.target as number) <= 31) {
    return { type: goal.type, target: goal.target as number, startDate: goal.startDate, endDate: goal.endDate, stepThreshold: null };
  }
  if (goal.type === 'step_days' && (goal.target as number) <= dates.length && Number.isSafeInteger(goal.stepThreshold)
    && (goal.stepThreshold as number) >= 100 && (goal.stepThreshold as number) <= 100000) {
    return { type: goal.type, target: goal.target as number, startDate: goal.startDate, endDate: goal.endDate, stepThreshold: goal.stepThreshold as number };
  }
}
export function parseCoachGoal(value: unknown): CoachGoal | undefined {
  const goal = object(value), values = parseGoalValues(goal);
  if (!values || !isGoalId(goal.id) || !['active', 'cancelled'].includes(goal.status as string)
    || !Number.isSafeInteger(goal.version) || (goal.version as number) < 1
    || typeof goal.createdAt !== 'string' || !Number.isFinite(Date.parse(goal.createdAt))
    || typeof goal.updatedAt !== 'string' || !Number.isFinite(Date.parse(goal.updatedAt))) return;
  return { ...values, id: goal.id, status: goal.status as CoachGoal['status'], version: goal.version as number,
    createdAt: goal.createdAt, updatedAt: goal.updatedAt };
}
export function parseGoalProposal(value: unknown): CoachGoalProposal | undefined {
  const proposal = object(value), values = parseGoalValues(proposal);
  if (!values || !isGoalId(proposal.id) || !['accept', 'update', 'cancel'].includes(proposal.operation as string)) return;
  const operation = proposal.operation as CoachGoalProposal['operation'];
  if (operation !== 'accept' && (!Number.isSafeInteger(proposal.expectedVersion) || (proposal.expectedVersion as number) < 1)) return;
  return { ...values, operation, id: proposal.id, ...(operation !== 'accept' ? { expectedVersion: proposal.expectedVersion as number } : {}) };
}

// Only official persisted goals are accepted commitments. Missing days stay
// unknown; reaching a logged target is not proof of unrecorded behavior.
export function evaluateCoachGoal(goal: CoachGoal, history: HabitDay[], today: string) {
  const dates = goalDates(goal), elapsedDates = dates.filter(date => date <= today);
  const availableDates = new Set(history.map(day => day.date));
  const available = elapsedDates.every(date => availableDates.has(date));
  const days = history.filter(day => elapsedDates.includes(day.date));
  const registered = goal.type === 'workout_sessions' ? aggregateCoachMetrics(days).workoutCount
    : days.filter(day => day.steps >= goal.stepThreshold!).length;
  const observedDays = goal.type === 'workout_sessions' ? aggregateCoachMetrics(days).workoutDays : days.filter(day => day.steps > 0).length;
  return { id: goal.id, type: goal.type, target: goal.target, stepThreshold: goal.stepThreshold,
    period: { startDate: goal.startDate, endDate: goal.endDate, days: dates.length },
    status: goal.status, version: goal.version, createdAt: goal.createdAt, updatedAt: goal.updatedAt,
    phase: goal.status === 'cancelled' ? 'cancelled' : today < goal.startDate ? 'not_started' : today > goal.endDate ? 'ended' : 'in_progress',
    elapsedDays: elapsedDates.length, observedDays, unknownDays: elapsedDates.length - observedDays,
    registered: available ? registered : null,
    remainingToRegister: available ? Math.max(0, goal.target - registered) : null,
    classification: !available ? 'history_unavailable' : registered >= goal.target ? 'registered_target_reached' : 'recorded_progress_only',
    limitations: ['missing_records_do_not_confirm_noncompliance', 'current_day_is_provisional',
      'current_goal_revision_not_original_plan', ...(goal.type === 'step_days' ? ['positive_step_entries_only'] : [])] };
}

export function isActionableCoachingQuery(messages: { role: string; text: string }[]): boolean {
  const users = messages.filter(message => message.role === 'user');
  const last = (users.at(-1)?.text ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/\b(?:registra(?:me)?|anota(?:me)?|carga(?:me)?|agrega(?:me)?|guardar (?:esta|la) comida)\b/.test(last)
    || /\b(?:quiero|necesito|podes|puedes|podrias)\b.*\b(?:registrar|anotar|cargar|agregar)\b/.test(last)
    || /^(?:recien|acabo de|comi|cene|almorce|tome|bebi|entrene|jugue|hice|termine|me pese)\b/.test(last.trim())) return false;
  if (/\b(?:plan\w*|rutina|organiz\w*|objetivos?|recomenda\w*|mejor\w*|disponib\w*|equipamiento|experiencia|prefer\w*|cambiemos|cancel\w*)\b|\bquiero (?:entrenar|caminar|dejar de seguir)\b|como me fue|solo (?:tengo|puedo)|\b(?:los|el) (?:lunes|martes|miercoles|jueves|viernes|sabados?|domingos?)\b.*\b(?:juego|puedo|dispongo|entreno)\b/.test(last)) return true;
  return (/^[¿\s]*(?:y\b|por que\b|si\b|dale\b|solo\b|cambi\w*\b)/.test(last)
    || /^(?:\d+\s*(?:minutos|min|dias|veces)|mancuernas|en casa|sin equipamiento)\b/.test(last.trim())) && users.length > 1
    ? isActionableCoachingQuery(users.slice(0, -1)) : false;
}
