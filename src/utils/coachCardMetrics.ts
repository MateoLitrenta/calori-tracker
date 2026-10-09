// Shared, dependency-free metric builder used by both the card and the AI API.
export type CoachCardHint = 'none' | 'today_summary' | 'nutrition_recent' | 'training_recent';

interface CoachCardDay {
  date: string; calories: number | null; steps: number;
  meals: unknown[]; workouts: { name: string }[]; omittedMeals: number; omittedWorkouts: number;
}
export interface CoachCardContext {
  today: CoachCardDay & { consumed: number | null; expenditure: number | null };
  recentDays: CoachCardDay[];
}

export type CoachCardSnapshot =
  | { type: 'today_summary'; date: string; consumed: number | null; expenditure: number | null;
      balance: number | null; mealCount: number; workoutCount: number; steps: number | null }
  | { type: 'nutrition_recent'; startDate: string; endDate: string; mealDays: number;
      averageCalories: number | null; mealCount: number }
  | { type: 'training_recent'; startDate: string; endDate: string; workoutDays: number;
      workoutCount: number; stepDays: number; averageSteps: number | null; recentActivities: string[] };

const countMeals = (day: CoachCardContext['today'] | CoachCardContext['recentDays'][number]) => day.meals.length + day.omittedMeals;
const countWorkouts = (day: CoachCardContext['today'] | CoachCardContext['recentDays'][number]) => day.workouts.length + day.omittedWorkouts;
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

// Official registered-day denominators, shared by cards and habit windows.
export function aggregateCoachMetrics(days: { calories: number | null; steps: number; mealCount: number; workoutCount: number }[]) {
  const meals = days.filter(day => day.calories !== null);
  const steps = days.filter(day => day.steps > 0);
  return { mealDays: meals.length, mealCount: days.reduce((sum, day) => sum + day.mealCount, 0),
    averageCalories: meals.length ? Math.round(meals.reduce((sum, day) => sum + day.calories!, 0) / meals.length) : null,
    workoutDays: days.filter(day => day.workoutCount > 0).length, workoutCount: days.reduce((sum, day) => sum + day.workoutCount, 0),
    stepDays: steps.length, averageSteps: steps.length ? Math.round(steps.reduce((sum, day) => sum + day.steps, 0) / steps.length) : null };
}

export function buildCoachCard(hint: CoachCardHint, context: CoachCardContext | null): CoachCardSnapshot | undefined {
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
  const metrics = aggregateCoachMetrics(days.map(day => ({ ...day, mealCount: countMeals(day), workoutCount: countWorkouts(day) })));
  if (hint === 'nutrition_recent') {
    return { type: hint, ...dates, mealDays: metrics.mealDays, averageCalories: metrics.averageCalories, mealCount: metrics.mealCount };
  }
  if (hint === 'training_recent') {
    const recentActivities: string[] = [];
    // Newest visible activities first; omission counts are used only for totals.
    for (const day of [...days].reverse()) for (const workout of day.workouts) {
      const name = workout.name.trim();
      if (name && recentActivities.length < 3 && !recentActivities.some(activity => activity.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        recentActivities.push(name);
      }
    }
    return { type: hint, ...dates, workoutDays: metrics.workoutDays,
      workoutCount: metrics.workoutCount, stepDays: metrics.stepDays,
      averageSteps: metrics.averageSteps,
      recentActivities };
  }
}

