import type { WorkoutEntry } from '../types';

const gymPattern = /\b(gimnasio|gym|pesas|musculacion|fuerza|strength)\b|\bweight\s+training\b/;
const footballPattern = /\b(futbol|football|soccer)\b/;
const americanFootballPattern = /\b(american\s+football|football\s+americano|futbol\s+americano)\b/;

export const getHeatmapActivities = (workouts?: readonly Pick<WorkoutEntry, 'activity'>[]) => {
  let gym = false;
  let football = false;
  for (const workout of workouts ?? []) {
    if (typeof workout.activity !== 'string') continue;
    const activity = workout.activity.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    gym ||= gymPattern.test(activity);
    football ||= footballPattern.test(activity) && !americanFootballPattern.test(activity);
  }
  return { gym, football };
};

export const getHeatmapBorder = (activities: ReturnType<typeof getHeatmapActivities>, selected: boolean) =>
  selected ? 'selected' : activities.football ? 'football' : activities.gym ? 'gym' : 'normal';
