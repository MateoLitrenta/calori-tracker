import { isValidDateStr } from '../services/aiService.ts';
import type { CoachCardSnapshot } from './coachCardMetrics.ts';
export { buildCoachCard, type CoachCardSnapshot } from './coachCardMetrics.ts';

const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

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
