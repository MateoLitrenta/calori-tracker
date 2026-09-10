import { format } from 'date-fns';
import type { ActivityLevel, DailyRecord, DailyRecordsMap, UserProfile } from '../types';

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

export const ACTIVITY_MULTIPLIERS: Readonly<Record<ActivityLevel, number>> = {
  Sedentario: 1.20, Moderado: 1.375, Activo: 1.55,
};
export const DEFICIT_ADJUSTMENT = -400;
export const SURPLUS_ADJUSTMENT = 300;

export const normalizeActivityLevel = (value: unknown): ActivityLevel =>
  value === 'Moderado' || value === 'Activo' ? value : 'Sedentario';

export const getActivityMultiplier = (profile: UserProfile): number =>
  ACTIVITY_MULTIPLIERS[normalizeActivityLevel(profile.activity)];

export const calculateTDEE = (profile: UserProfile): number =>
  Math.round(calculateBMR(profile) * getActivityMultiplier(profile));

export const calculateDailyCalorieTarget = (profile: UserProfile): number =>
  Math.round(calculateTDEE(profile) + (profile.goal === 'Déficit' ? DEFICIT_ADJUSTMENT
    : profile.goal === 'Superávit' ? SURPLUS_ADJUSTMENT : 0));

export const getRemainingCalories = (record: DailyRecord | undefined, dailyTarget: number) =>
  dailyTarget - getCaloriesIngested(record);

export const getRemainingLabel = (remaining: number) =>
  remaining > 0 ? 'Restantes' : remaining < 0 ? 'Exceso' : 'Meta alcanzada';

export const getWorkoutCalories = (record: DailyRecord | undefined) =>
  record?.workouts.reduce((sum, workout) => sum + workout.calories, 0) ?? 0;

export const hasEnergyData = (record: DailyRecord | undefined): record is DailyRecord =>
  !!record && (record.meals.length > 0 || record.workouts.length > 0 || record.steps > 0);

// Compatibility helper: expenditure is TDEE only, never TDEE plus tracked activity.
export const getCaloriesBurned = (record: DailyRecord | undefined, dailyTDEE: number) =>
  hasEnergyData(record) ? dailyTDEE : 0;

export const getEstimatedEnergyBalance = (record: DailyRecord | undefined, dailyTDEE: number) => {
  if (!hasEnergyData(record)) return null;
  return Math.round(getCaloriesIngested(record) - dailyTDEE);
};

export const getNetBalance = getEstimatedEnergyBalance;

// Missing, empty and future days are not assumed to have zero intake.
export const aggregateEnergy = (records: DailyRecordsMap, dates: string[], dailyTDEE: number,
  today = formatDateStr(new Date())) => {
  let consumed = 0;
  let days = 0;
  for (const date of new Set(dates)) {
    const record = records[date];
    if (date > today || !hasEnergyData(record)) continue;
    consumed += getCaloriesIngested(record);
    days++;
  }
  const expenditure = days * dailyTDEE;
  const balance = days ? consumed - expenditure : null;
  return { consumed, days, expenditure, balance,
    averageBalance: balance === null ? null : Math.round(balance / days) };
};

export const getHeatmapColor = (balance: number | null) => {
  if (balance === null) return 'bg-slate-200 dark:bg-[#2d333b]';
  if (balance < -500) return 'bg-heatmap-deficit-high';
  if (balance >= -500 && balance < -250) return 'bg-heatmap-deficit-medium';
  if (balance >= -250 && balance < -100) return 'bg-heatmap-deficit-low';
  if (balance >= -100 && balance <= 100) return 'bg-heatmap-neutral';
  if (balance > 100 && balance <= 250) return 'bg-heatmap-surplus-low';
  if (balance > 250 && balance <= 500) return 'bg-heatmap-surplus-medium';
  if (balance > 500) return 'bg-heatmap-surplus-high';
  return 'bg-slate-200 dark:bg-[#2d333b]';
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
