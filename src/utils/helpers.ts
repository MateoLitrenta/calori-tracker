import { format } from 'date-fns';
import type { DailyRecord, UserProfile } from '../types';

export const formatDateStr = (date: Date) => format(date, 'yyyy-MM-dd');

export const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export const calculateBMR = (profile: UserProfile): number => {
  const base = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age;
  return Math.round(profile.sex === 'Masculino' ? base + 5 : base - 161);
};

export const getCaloriesIngested = (record: DailyRecord | undefined) => {
  if (!record) return 0;
  return record.meals.reduce((sum, meal) => sum + meal.calories, 0);
};

export const getCaloriesBurned = (record: DailyRecord | undefined, currentBMR: number) => {
  if (!record) return 0;
  const workoutCals = record.workouts.reduce((sum, w) => sum + w.calories, 0);
  const stepsCals = record.steps * 0.04; // aprox 0.04 kcal per step
  return currentBMR + workoutCals + stepsCals;
};

export const getNetBalance = (record: DailyRecord | undefined, currentBMR: number) => {
  if (!record) return null;
  // If there are no meals and no workouts and no steps, maybe consider it 'empty'?
  if (record.meals.length === 0 && record.workouts.length === 0 && record.steps === 0) {
    return null; // Equivalent to 'no data'
  }
  return Math.round(getCaloriesIngested(record) - getCaloriesBurned(record, currentBMR));
};

export const getHeatmapColor = (balance: number | null) => {
  if (balance === null) return 'bg-heatmap-empty';
  if (balance < -500) return 'bg-heatmap-deficit-high';
  if (balance >= -500 && balance < -250) return 'bg-heatmap-deficit-medium';
  if (balance >= -250 && balance < -100) return 'bg-heatmap-deficit-low';
  if (balance >= -100 && balance <= 100) return 'bg-heatmap-neutral';
  if (balance > 100 && balance <= 250) return 'bg-heatmap-surplus-low';
  if (balance > 250 && balance <= 500) return 'bg-heatmap-surplus-medium';
  if (balance > 500) return 'bg-heatmap-surplus-high';
  return 'bg-heatmap-empty';
};

export const getBalanceLabel = (balance: number | null) => {
  if (balance === null) return 'Sin datos';
  if (balance < -500) return 'Déficit Alto';
  if (balance >= -500 && balance < -250) return 'Déficit Moderado';
  if (balance >= -250 && balance < -100) return 'Déficit Leve';
  if (balance >= -100 && balance <= 100) return 'Mantenimiento';
  if (balance > 100 && balance <= 250) return 'Superávit Leve';
  if (balance > 250 && balance <= 500) return 'Superávit Moderado';
  if (balance > 500) return 'Superávit Alto';
  return '';
};
