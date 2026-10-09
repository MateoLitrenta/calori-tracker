import { coachDates } from './coachDates.ts';

const text = (value: unknown, limit = 100) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const count = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : 0;
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

function compactDay(value: unknown, date: string) {
  const day = object(value);
  const meals = Array.isArray(day.meals) ? day.meals : [];
  const workouts = Array.isArray(day.workouts) ? day.workouts : [];
  return { date, hasData: day.hasData === true, calories: number(day.calories), expenditure: number(day.expenditure),
    steps: number(day.steps) ?? 0, water: number(day.water) ?? 0, weight: number(day.weight),
    meals: meals.slice(0, 6).map(value => { const meal = object(value); return {
      type: text(meal.type, 20), description: text(meal.description), calories: number(meal.calories),
      ...(typeof meal.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(meal.time) ? { time: meal.time } : {}) }; }),
    workouts: workouts.slice(0, 3).map(value => { const workout = object(value); return {
      name: text(workout.name), duration: number(workout.duration), calories: number(workout.calories) }; }),
    omittedMeals: Math.max(number(day.omittedMeals) ?? 0, meals.length - 6, 0),
    omittedWorkouts: Math.max(number(day.omittedWorkouts) ?? 0, workouts.length - 3, 0) };
}

export interface HabitDay {
  date: string; calories: number | null; expenditure: number | null; steps: number; water: number; weight: number | null;
  mealCount: number; workoutCount: number; activities: string[]; omittedActivities: number;
}

// Shared client/server whitelist. History contains bounded daily totals, never
// meals, notes, identities, inferred traits or caller-computed insights.
export function sanitizeCoachContext(value: unknown, today: string) {
  const source = object(value), profile = object(source.profile), current = object(source.today);
  const days = Array.isArray(source.recentDays) ? source.recentDays.slice(0, 7) : [];
  const recentDays = coachDates(today).map(date => compactDay(days.find(day => object(day).date === date), date));
  const history = Array.isArray(source.historyDays) ? source.historyDays.slice(0, 60) : [];
  const historyDays: HabitDay[] = coachDates(today, 60).map(date => {
    const day = object(history.find(day => object(day).date === date));
    const recent = recentDays.find(day => day.date === date);
    const activities = Array.isArray(day.activities) ? [...new Set(day.activities.map(value => text(value, 40)).filter(Boolean))].slice(0, 2)
      : [...new Set(recent?.workouts.map(workout => text(workout.name, 40)).filter(Boolean) ?? [])].slice(0, 2);
    return { date, calories: recent ? recent.calories : number(day.calories),
      expenditure: recent ? recent.expenditure : number(day.expenditure),
      steps: recent ? recent.steps : number(day.steps) ?? 0, water: recent ? recent.water : number(day.water) ?? 0,
      weight: recent ? recent.weight : number(day.weight),
      mealCount: recent ? recent.meals.length + recent.omittedMeals : count(day.mealCount),
      workoutCount: recent ? recent.workouts.length + recent.omittedWorkouts : count(day.workoutCount),
      activities, omittedActivities: count(day.omittedActivities) };
  });
  return { profile: { name: text(profile.name, 60), sex: text(profile.sex, 20), age: number(profile.age),
    weight: number(profile.weight), height: number(profile.height),
    goal: ['Déficit', 'Mantenimiento', 'Superávit'].includes(profile.goal as string) ? profile.goal as string : null },
    today: { ...compactDay(current, today), consumed: number(current.consumed), expenditure: number(current.expenditure), target: number(current.target) },
    recentDays, historyDays };
}
