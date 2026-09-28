import type { DailyRecord, UserProfile } from '../types';
import { calculateDailyExpenditure, formatDateStr, getCaloriesIngested } from './helpers.ts';

const MAX_MEALS = 6;
const MAX_WORKOUTS = 3;
const text = (value: unknown, limit = 100) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function recentLocalDates(today: string): string[] {
  const [year, month, day] = today.split('-').map(Number);
  return Array.from({ length: 7 }, (_, index) => formatDateStr(new Date(year, month - 1, day - 6 + index, 12)));
}

function compactDay(value: unknown, date: string) {
  const day = object(value);
  const meals = Array.isArray(day.meals) ? day.meals : [];
  const workouts = Array.isArray(day.workouts) ? day.workouts : [];
  return {
    date,
    hasData: day.hasData === true,
    calories: number(day.calories),
    steps: number(day.steps) ?? 0,
    water: number(day.water) ?? 0,
    weight: number(day.weight),
    meals: meals.slice(0, MAX_MEALS).map(value => {
      const meal = object(value);
      return { type: text(meal.type, 20), description: text(meal.description), calories: number(meal.calories),
        ...(typeof meal.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(meal.time) ? { time: meal.time } : {}) };
    }),
    workouts: workouts.slice(0, MAX_WORKOUTS).map(value => {
      const workout = object(value);
      return { name: text(workout.name), duration: number(workout.duration), calories: number(workout.calories) };
    }),
    omittedMeals: Math.max(number(day.omittedMeals) ?? 0, meals.length - MAX_MEALS, 0),
    omittedWorkouts: Math.max(number(day.omittedWorkouts) ?? 0, workouts.length - MAX_WORKOUTS, 0),
  };
}

// Whitelist and bound client context again at the API boundary. Never forward whole objects.
export function sanitizeCoachContext(value: unknown, today: string) {
  const source = object(value);
  const profile = object(source.profile);
  const current = object(source.today);
  const days = Array.isArray(source.recentDays) ? source.recentDays.slice(0, 7) : [];
  return {
    profile: { name: text(profile.name, 60), sex: text(profile.sex, 20), age: number(profile.age),
      weight: number(profile.weight), height: number(profile.height) },
    today: { ...compactDay(current, today), consumed: number(current.consumed), expenditure: number(current.expenditure) },
    recentDays: recentLocalDates(today).map(date => compactDay(days.find(day => object(day).date === date), date)),
  };
}

export type CoachContext = ReturnType<typeof sanitizeCoachContext>;

function summarizeDay(record: DailyRecord | undefined, date: string) {
  return {
    date,
    hasData: Boolean(record && (record.meals.length || record.workouts.length || record.steps || record.water || record.weight)),
    calories: record?.meals.length ? getCaloriesIngested(record) : null,
    meals: record?.meals.map(meal => ({ type: meal.type, description: meal.name, calories: meal.calories, time: meal.time })) ?? [],
    workouts: record?.workouts.map(workout => ({ name: workout.activity, duration: workout.duration, calories: workout.calories })) ?? [],
    steps: record?.steps ?? 0, water: record?.water ?? 0, weight: record?.weight ?? null,
  };
}

export function buildCoachContext(profile: UserProfile, today: string): CoachContext {
  const record = profile.records[today];
  return sanitizeCoachContext({
    profile: { name: profile.name, sex: profile.sex, age: profile.age, weight: profile.weight, height: profile.height },
    today: { ...summarizeDay(record, today), consumed: getCaloriesIngested(record), expenditure: calculateDailyExpenditure(profile, record) },
    recentDays: recentLocalDates(today).map(date => summarizeDay(profile.records[date], date)),
  }, today);
}

export function coachSuggestions(context: CoachContext | null): string[] {
  if (!context || !context.recentDays.some(day => day.hasData)) {
    return ['Armame una rutina de 30 minutos', '¿Qué puedo comer hoy?', '¿Cómo funciona Calori?'];
  }
  if (context.recentDays.some(day => day.workouts.length)) {
    return ['¿Cómo vengo entrenando?', 'Armame una rutina para hoy', '¿Cómo comí esta semana?'];
  }
  return ['¿Cómo comí esta semana?', '¿Cuánta actividad hice esta semana?', '¿Qué podría cenar hoy?'];
}
