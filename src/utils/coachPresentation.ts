import type { CoachContext } from './coachContext';
import { isValidDateStr, type CoachPresentationHint } from '../services/aiService.ts';

export type CoachCardSnapshot =
  | { type: 'today_summary'; date: string; consumed: number | null; expenditure: number | null;
      balance: number | null; mealCount: number; workoutCount: number; steps: number | null }
  | { type: 'nutrition_recent'; startDate: string; endDate: string; mealDays: number;
      averageCalories: number | null; mealCount: number }
  | { type: 'training_recent'; startDate: string; endDate: string; workoutDays: number;
      workoutCount: number; stepDays: number; averageSteps: number | null; recentActivities: string[] };

const countMeals = (day: CoachContext['today'] | CoachContext['recentDays'][number]) => day.meals.length + day.omittedMeals;
const countWorkouts = (day: CoachContext['today'] | CoachContext['recentDays'][number]) => day.workouts.length + day.omittedWorkouts;
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function buildCoachCard(hint: CoachPresentationHint, context: CoachContext | null): CoachCardSnapshot | undefined {
  if (!context) return;
  if (hint === 'today_summary') {
    const day = context.today;
    const consumed = day.calories !== null && nonnegative(day.consumed) ? Math.round(day.consumed) : null;
    const expenditure = nonnegative(day.expenditure) ? Math.round(day.expenditure) : null;
    return { type: hint, date: day.date, consumed, expenditure,
      balance: consumed !== null && expenditure !== null ? Math.round(day.consumed! - day.expenditure!) : null,
      mealCount: countMeals(day), workoutCount: countWorkouts(day), steps: day.steps > 0 ? Math.round(day.steps) : null };
  }
  const days = context.recentDays;
  if (days.length !== 7) return;
  const dates = { startDate: days[0].date, endDate: days[6].date };
  if (hint === 'nutrition_recent') {
    const mealDays = days.filter(day => day.calories !== null);
    return { type: hint, ...dates, mealDays: mealDays.length,
      averageCalories: mealDays.length ? Math.round(mealDays.reduce((sum, day) => sum + day.calories!, 0) / mealDays.length) : null,
      mealCount: days.reduce((sum, day) => sum + countMeals(day), 0) };
  }
  if (hint === 'training_recent') {
    const stepDays = days.filter(day => day.steps > 0);
    const recentActivities: string[] = [];
    // Newest visible activities first; omission counts are used only for totals.
    for (const day of [...days].reverse()) for (const workout of day.workouts) {
      const name = workout.name.trim();
      if (name && recentActivities.length < 3 && !recentActivities.some(activity => activity.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        recentActivities.push(name);
      }
    }
    return { type: hint, ...dates, workoutDays: days.filter(day => countWorkouts(day) > 0).length,
      workoutCount: days.reduce((sum, day) => sum + countWorkouts(day), 0), stepDays: stepDays.length,
      averageSteps: stepDays.length ? Math.round(stepDays.reduce((sum, day) => sum + day.steps, 0) / stepDays.length) : null,
      recentActivities };
  }
}

export function parseCoachCard(value: unknown): CoachCardSnapshot | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const card = value as Record<string, unknown>;
  const count = (n: unknown): n is number => nonnegative(n) && Number.isSafeInteger(n);
  const nullable = (n: unknown): n is number | null => n === null || nonnegative(n);
  const days = (n: unknown): n is number => count(n) && n <= 7;
  if (card.type === 'today_summary') {
    if (!isValidDateStr(card.date) || !nullable(card.consumed) || !nullable(card.expenditure) ||
      !(card.balance === null || typeof card.balance === 'number' && Number.isFinite(card.balance)) ||
      !count(card.mealCount) || !count(card.workoutCount) || !nullable(card.steps)) return;
    if ((card.consumed === null || card.expenditure === null) && card.balance !== null) return;
    return { type: card.type, date: card.date, consumed: card.consumed, expenditure: card.expenditure,
      balance: card.balance, mealCount: card.mealCount, workoutCount: card.workoutCount, steps: card.steps };
  }
  if (!isValidDateStr(card.startDate) || !isValidDateStr(card.endDate) || card.startDate > card.endDate) return;
  if (card.type === 'nutrition_recent') {
    if (!days(card.mealDays) || !nullable(card.averageCalories) || !count(card.mealCount) ||
      (card.mealDays === 0 && card.averageCalories !== null)) return;
    return { type: card.type, startDate: card.startDate, endDate: card.endDate,
      mealDays: card.mealDays, averageCalories: card.averageCalories, mealCount: card.mealCount };
  }
  if (card.type === 'training_recent') {
    if (!days(card.workoutDays) || !count(card.workoutCount) || !days(card.stepDays) || !nullable(card.averageSteps) ||
      (card.stepDays === 0 && card.averageSteps !== null) || !Array.isArray(card.recentActivities) || card.recentActivities.length > 3 ||
      !card.recentActivities.every((name): name is string => typeof name === 'string' && name.trim().length > 0 && name.length <= 100)) return;
    return { type: card.type, startDate: card.startDate, endDate: card.endDate, workoutDays: card.workoutDays,
      workoutCount: card.workoutCount, stepDays: card.stepDays, averageSteps: card.averageSteps, recentActivities: [...card.recentActivities] };
  }
}
