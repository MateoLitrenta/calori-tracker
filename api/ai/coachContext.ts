const MAX_MEALS = 6;
const MAX_WORKOUTS = 3;
const text = (value: unknown, limit = 100) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

function recentLocalDates(today: string): string[] {
  const [year, month, day] = today.split('-').map(Number);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day - 6 + index);
    date.setUTCHours(12, 0, 0, 0);
    return `${date.getUTCFullYear().toString().padStart(4, '0')}-${(date.getUTCMonth() + 1).toString().padStart(2, '0')}-${date.getUTCDate().toString().padStart(2, '0')}`;
  });
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

// Bound and whitelist untrusted client context at the API boundary.
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
