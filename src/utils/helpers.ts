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

export const CALORIES_PER_STEP = 0.04;

export const getStepCalories = (record: DailyRecord | undefined): number =>
  Math.round((record?.steps ?? 0) * CALORIES_PER_STEP);

// Steps and workouts may overlap. This version uses recorded values without corrections.
export const calculateDailyExpenditure = (profile: UserProfile, record?: DailyRecord): number =>
  Math.round(calculateBMR(profile) + getStepCalories(record) + getWorkoutCalories(record));

export const calculateDailyCalorieTarget = (profile: UserProfile, record?: DailyRecord): number =>
  Math.round(calculateDailyExpenditure(profile, record) + (profile.goal === 'Déficit' ? DEFICIT_ADJUSTMENT
    : profile.goal === 'Superávit' ? SURPLUS_ADJUSTMENT : 0));

export const getRemainingCalories = (record: DailyRecord | undefined, dailyTarget: number) =>
  Math.round(dailyTarget - getCaloriesIngested(record));

export const getRemainingLabel = (remaining: number) =>
  remaining > 0 ? 'Restantes' : remaining < 0 ? 'Exceso' : 'Meta alcanzada';

export const getWorkoutCalories = (record: DailyRecord | undefined) =>
  record?.workouts.reduce((sum, workout) => sum + workout.calories, 0) ?? 0;

export const hasEnergyData = (record: DailyRecord | undefined): record is DailyRecord =>
  !!record && (record.meals.length > 0 || record.workouts.length > 0 || record.steps > 0);

// Historical empty days remain unknown; a daily preview can still show the baseline TMB.
export const getCaloriesBurned = (record: DailyRecord | undefined, profile: UserProfile) =>
  hasEnergyData(record) ? calculateDailyExpenditure(profile, record) : 0;

export const getEstimatedEnergyBalance = (record: DailyRecord | undefined, profile: UserProfile) => {
  if (!hasEnergyData(record)) return null;
  return Math.round(getCaloriesIngested(record) - calculateDailyExpenditure(profile, record));
};

export const getNetBalance = getEstimatedEnergyBalance;

export const buildDailyEnergyContext = (profile: UserProfile, record?: DailyRecord): string => {
  const target = calculateDailyCalorieTarget(profile, record);
  return `Nombre: ${profile.name}
Peso actual: ${profile.weight} kg
TMB: ${calculateBMR(profile)} kcal
TDEE de referencia habitual (no es el gasto de hoy): ${calculateTDEE(profile)} kcal
Nivel de actividad habitual: ${normalizeActivityLevel(profile.activity)}
Objetivo: ${profile.goal}
Gasto estimado hoy: ${calculateDailyExpenditure(profile, record)} kcal
Meta de hoy: ${target} kcal
Consumidas hoy (solo comida/bebida): ${getCaloriesIngested(record)} kcal
Restantes para la meta: ${getRemainingCalories(record, target)} kcal
Pasos hoy: ${record?.steps ?? 0}
Calorías por pasos: ${getStepCalories(record)} kcal
Calorías por ejercicio registrado: ${getWorkoutCalories(record)} kcal
El gasto de hoy es TMB + pasos registrados × 0.04 + calorías de ejercicio registradas.
TDEE y nivel habitual son solo referencia: no los uses para el gasto, la meta ni el balance del día. Nunca uses TDEE + pasos + ejercicio.
Pasos y ejercicio pueden solaparse; esta versión usa los valores registrados sin correcciones arbitrarias.
The user's daily calorie target is already calculated by the application. Do not recalculate or replace it unless the user explicitly asks for an explanation.
La meta ya incluye pasos y ejercicio; no vuelvas a sumarlos. Si las restantes son positivas, usalas para recomendaciones; si son negativas, indicá el exceso sin inventar otra meta; si son cero, indicá que alcanzó la meta.`;
};

// Missing, empty and future days are not assumed to have zero intake.
export const aggregateEnergy = (records: DailyRecordsMap, dates: string[], profile: UserProfile,
  today = formatDateStr(new Date())) => {
  let consumed = 0;
  let days = 0;
  let expenditure = 0;
  let target = 0;
  for (const date of new Set(dates)) {
    const record = records[date];
    if (date > today || !hasEnergyData(record)) continue;
    consumed += getCaloriesIngested(record);
    expenditure += calculateDailyExpenditure(profile, record);
    target += calculateDailyCalorieTarget(profile, record);
    days++;
  }
  const balance = days ? Math.round(consumed - expenditure) : null;
  return { consumed, days, expenditure, target, balance,
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
