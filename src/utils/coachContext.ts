import type { DailyRecord, UserProfile } from '../types';
import { calculateDailyCalorieTarget, calculateDailyExpenditure, getCaloriesIngested, hasEnergyData } from './helpers.ts';
import { coachDates } from './coachDates.ts';
import { sanitizeCoachContext } from './coachContextContract.ts';
export { sanitizeCoachContext } from './coachContextContract.ts';

export const recentLocalDates = coachDates;

export type CoachContext = ReturnType<typeof sanitizeCoachContext>;

function summarizeDay(profile: UserProfile, record: DailyRecord | undefined, date: string) {
  return {
    date,
    hasData: Boolean(record && (record.meals.length || record.workouts.length || record.steps || record.water || record.weight)),
    calories: record?.meals.length ? getCaloriesIngested(record) : null,
    expenditure: hasEnergyData(record) ? calculateDailyExpenditure(profile, record) : null,
    meals: record?.meals.map(meal => ({ type: meal.type, description: meal.name, calories: meal.calories, time: meal.time })) ?? [],
    workouts: record?.workouts.map(workout => ({ name: workout.activity, duration: workout.duration, calories: workout.calories })) ?? [],
    steps: record?.steps ?? 0, water: record?.water ?? 0, weight: record?.weight ?? null,
  };
}

export function buildCoachContext(profile: UserProfile, today: string): CoachContext {
  const record = profile.records[today];
  const context = sanitizeCoachContext({
    profile: { name: profile.name, sex: profile.sex, age: profile.age, weight: profile.weight, height: profile.height, goal: profile.goal },
    today: { ...summarizeDay(profile, record, today), consumed: getCaloriesIngested(record), expenditure: calculateDailyExpenditure(profile, record), target: calculateDailyCalorieTarget(profile, record) },
    recentDays: recentLocalDates(today).map(date => summarizeDay(profile, profile.records[date], date)),
    historyDays: coachDates(today, 60).map(date => {
      const record = profile.records[date];
      const activities = [...new Set(record?.workouts.map(workout => workout.activity.trim()).filter(Boolean) ?? [])];
      return { date, calories: record?.meals.length ? getCaloriesIngested(record) : null,
        expenditure: hasEnergyData(record) ? calculateDailyExpenditure(profile, record) : null,
        mealCount: record?.meals.length ?? 0, workoutCount: record?.workouts.length ?? 0,
        steps: record?.steps ?? 0, water: record?.water ?? 0, weight: record?.weight ?? null,
        activities: activities.slice(0, 2), omittedActivities: Math.max(0, activities.length - 2) };
    }),
  }, today);
  // Keep the established request context budget even with pathological labels.
  // Drop descriptive labels only; every total and day remains available.
  if (JSON.stringify(context).length > 23000) for (const day of context.historyDays) {
    day.omittedActivities += day.activities.length;
    day.activities = [];
  }
  return context;
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
