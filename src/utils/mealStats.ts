import type { DailyRecordsMap } from '../types';
import { subDays, parseISO, format } from 'date-fns';

/** Food statistics count meal records, never inferred intake from activity. */
export function calculateMealStats(records: DailyRecordsMap, today: string) {
  const dates = Object.keys(records).filter(date => date <= today && records[date].meals.length > 0);
  const calories = dates.reduce((sum, date) =>
    sum + records[date].meals.reduce((total, meal) => total + meal.calories, 0), 0);
  const previous = (date: string) => format(subDays(parseISO(date), 1), 'yyyy-MM-dd');
  const registered = new Set(dates);
  let cursor = registered.has(today) ? today : previous(today);
  let currentStreak = 0;
  while (registered.has(cursor)) {
    currentStreak++;
    cursor = previous(cursor);
  }
  return { registeredDays: dates.length,
    avgCalories: dates.length ? Math.round(calories / dates.length) : null, currentStreak };
}
