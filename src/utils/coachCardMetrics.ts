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

