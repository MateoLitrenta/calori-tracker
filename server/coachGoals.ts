import { randomUUID } from 'node:crypto';
import { supabaseUrl, supabasePublishableKey } from '../src/lib/supabaseConfig.ts';
import { AIError } from './aiSecurity.ts';
import { coachDates } from '../src/utils/coachDates.ts';
import { isGoalDate, isGoalId, parseCoachGoal, parseGoalProposal, parseGoalValues, type CoachGoal, type CoachGoalProposal } from '../src/utils/coachGoals.ts';
import type { HabitDay } from '../src/utils/coachContextContract.ts';

export const coachGoalsEnabled = () => process.env.AI_COACH_GOALS_ENABLED === 'true';
const unavailable = () => new AIError('goals_unavailable', 503, 'No pudimos consultar o guardar tus objetivos. Intentá nuevamente.');
const conflict = () => new AIError('goal_conflict', 409, 'El objetivo cambió o ya existe. Consultalo nuevamente antes de confirmar.');
const invalid = () => new AIError('invalid_goal', 400, 'Revisá el tipo, valor y período del objetivo.');
const select = 'id,user_id,type,target,step_threshold,start_date,end_date,status,version,created_at,updated_at';

function fromRow(row: Record<string, unknown>, userId: string): CoachGoal {
  const parsed = parseCoachGoal({ ...row, startDate: row.start_date, endDate: row.end_date,
    stepThreshold: row.step_threshold, createdAt: row.created_at, updatedAt: row.updated_at });
  if (row.user_id !== userId || !parsed) throw unavailable();
  return parsed;
}
async function requestGoals(request: Request, query: string, options: RequestInit = {}, resource = 'coach_goals', complete = false): Promise<Record<string, unknown>[]> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 5000);
  try {
    // Use the verified user's JWT, never the AI service key: RLS remains active.
    const response = await fetch(`${supabaseUrl}/rest/v1/${resource}?${query}`, { ...options, signal: controller.signal,
      headers: { apikey: supabasePublishableKey, Authorization: request.headers.get('Authorization')!,
        'Content-Type': 'application/json', Prefer: complete ? 'count=exact' : 'return=representation', ...options.headers } });
    if (response.status === 409) throw conflict();
    if (!response.ok) throw unavailable();
    const rows: unknown = await response.json();
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw unavailable();
    if (complete && Number(response.headers.get('Content-Range')?.match(/\/(\d+)$/)?.[1]) !== rows.length) throw unavailable();
    return rows as Record<string, unknown>[];
  } catch (error) { if (error instanceof AIError) throw error; throw unavailable(); }
  finally { clearTimeout(timer); }
}
export async function readCoachGoals(request: Request, userId: string) {
  const rows = await requestGoals(request, `select=${select}&user_id=eq.${userId}&order=status.asc,end_date.desc,created_at.desc&limit=13`);
  return { goals: rows.slice(0, 12).map(row => fromRow(row, userId)), hasMore: rows.length > 12 };
}

export async function readGoalActivity(request: Request, userId: string, today: string): Promise<HabitDay[]> {
  const dates = coachDates(today, 60);
  const filter = `user_id=eq.${userId}&date=gte.${dates[0]}&date=lte.${today}&limit=1001`;
  const [logs, workouts] = await Promise.all([
    requestGoals(request, 'select=date,user_id,steps&' + filter, {}, 'daily_logs', true),
    requestGoals(request, 'select=date,user_id&' + filter, {}, 'workouts', true),
  ]);
  if (logs.length > 60 || workouts.length > 1000) throw unavailable();
  const history = dates.map(date => ({ date, calories: null, expenditure: null, mealCount: 0, workoutCount: 0,
    steps: 0, water: 0, weight: null, activities: [], omittedActivities: 0 } as HabitDay));
  const seen = new Set();
  for (const log of logs) {
    const day = history.find(day => day.date === log.date);
    const steps = log.steps === null ? 0 : log.steps;
    if (!day || log.user_id !== userId || !Number.isSafeInteger(steps) || (steps as number) < 0 || seen.has(log.date)) throw unavailable();
    seen.add(log.date); day.steps = steps as number;
  }
  for (const workout of workouts) {
    const day = history.find(day => day.date === workout.date);
    if (!day || workout.user_id !== userId || !isGoalDate(workout.date)) throw unavailable();
    day.workoutCount++;
  }
  return history;
}

export function normalizeGoalSuggestion(value: unknown, today: string, goals: CoachGoal[]): CoachGoalProposal | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const suggested = value as Record<string, unknown>;
  if (suggested.operation === 'accept') {
    const values = parseGoalValues(suggested);
    if (!values || values.startDate < coachDates(today)[0] || values.startDate > coachDates(today, 1, -30)[0]) return;
    return { ...values, id: randomUUID(), operation: 'accept' };
  }
  const existing = goals.find(goal => goal.id === suggested.id && goal.status === 'active');
  if (!existing) return;
  if (suggested.operation === 'cancel') return { ...existing, operation: 'cancel', expectedVersion: existing.version };
  if (suggested.operation === 'update') {
    const values = parseGoalValues(suggested);
    if (!values || values.type !== existing.type || values.startDate !== existing.startDate || values.endDate !== existing.endDate) return;
    return { ...values, id: existing.id, operation: 'update', expectedVersion: existing.version };
  }
}
export async function saveCoachGoal(request: Request, userId: string, value: unknown, today: string): Promise<CoachGoal> {
  const proposal = parseGoalProposal(value);
  if (!proposal || !isGoalId(proposal.id)) throw invalid();
  const { operation, id, type, target, startDate, endDate, stepThreshold, expectedVersion } = proposal;
  const values = { type, target, start_date: startDate, end_date: endDate, step_threshold: stepThreshold };
  if (operation === 'accept') {
    if (startDate < coachDates(today)[0] || startDate > coachDates(today, 1, -30)[0]) throw invalid();
    const rows = await requestGoals(request, `select=${select}&on_conflict=id`, { method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify({ ...values, id, user_id: userId }) });
    if (rows.length === 1) return fromRow(rows[0], userId);
    const existing = await requestGoals(request, `select=${select}&user_id=eq.${userId}&id=eq.${id}&limit=1`);
    if (existing.length !== 1) throw conflict();
    const saved = fromRow(existing[0], userId);
    if (saved.status !== 'active' || saved.type !== type || saved.target !== target || saved.startDate !== startDate
      || saved.endDate !== endDate || saved.stepThreshold !== stepThreshold) throw conflict();
    return saved;
  }
  const match = `select=${select}&user_id=eq.${userId}&id=eq.${id}&status=eq.active&version=eq.${expectedVersion}`;
  const current = await requestGoals(request, match + '&limit=1');
  if (current.length !== 1) throw conflict();
  const before = fromRow(current[0], userId);
  if (before.type !== type || before.startDate !== startDate || before.endDate !== endDate) throw invalid();
  const rows = await requestGoals(request, match,
    { method: 'PATCH', body: JSON.stringify(operation === 'cancel' ? { status: 'cancelled' }
      : { target, step_threshold: stepThreshold }) });
  if (rows.length !== 1) throw conflict();
  const saved = fromRow(rows[0], userId);
  if (operation === 'update' && (saved.startDate !== startDate || saved.endDate !== endDate || saved.type !== type)) throw conflict();
  return saved;
}
