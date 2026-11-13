import type { DailyRecord, DailyRecordsMap, UserProfile, WorkoutEntry } from '../types';
import {
  aggregateEnergy,
  getBalanceCategory,
  getBalanceLabel,
  getNetBalance,
  hasEnergyData,
} from './helpers';
import { getHeatmapActivities } from './heatmapActivity';

export interface HistorySports {
  total: number;
  football: number;
  gym: number;
  other: number;
}

/** Counts stored sessions, using the existing sport classifier without new categories. */
export function getHistorySports(
  workouts: readonly Pick<WorkoutEntry, 'activity'>[] = [],
): HistorySports {
  const result: HistorySports = { total: workouts.length, football: 0, gym: 0, other: 0 };
  for (const workout of workouts) {
    const sports = getHeatmapActivities([workout]);
    if (sports.football) result.football++;
    if (sports.gym) result.gym++;
    if (!sports.football && !sports.gym) result.other++;
  }
  return result;
}

export const hasHistoryActivity = (record?: DailyRecord) =>
  !!record &&
  (record.meals.length > 0 ||
    record.workouts.length > 0 ||
    record.steps > 0 ||
    record.water > 0 ||
    (record.weight ?? 0) > 0);

/** Presentation eligibility only. A meal entry does not prove a complete dietary history. */
export function getHistoryDay(
  record: DailyRecord | undefined,
  date: string,
  profile: UserProfile,
  today: string,
) {
  const future = date > today;
  const activity = !future && hasHistoryActivity(record);
  const withMeals = activity && !!record?.meals.length;
  const state = future ? 'future' : !activity ? 'empty' : withMeals ? 'with-meals' : 'partial';
  const balance = future ? null : getNetBalance(record, profile);
  const canColorBalance = withMeals && balance !== null;
  return {
    state,
    activity,
    withMeals,
    balance,
    canColorBalance,
    category: getBalanceCategory(canColorBalance ? balance : null),
    label: canColorBalance
      ? getBalanceLabel(balance)
      : state === 'future'
        ? 'Fecha futura'
        : state === 'partial'
          ? 'Registro parcial · Sin comidas'
          : 'Sin registros',
    sports: getHistorySports(future ? [] : record?.workouts),
  };
}

/** Official arithmetic and denominator stay untouched; coverage is reported separately. */
export function getHistoryPeriod(
  records: DailyRecordsMap,
  dates: readonly string[],
  profile: UserProfile,
  today: string,
) {
  const unique = [...new Set(dates)];
  const elapsed = unique.filter((date) => date <= today);
  const foodDays = elapsed.filter((date) => !!records[date]?.meals.length).length;
  const activityDays = elapsed.filter((date) => hasHistoryActivity(records[date])).length;
  const partialDays = elapsed.filter(
    (date) => hasHistoryActivity(records[date]) && !records[date]?.meals.length,
  ).length;
  const energyWithoutMeals = elapsed.filter(
    (date) => hasEnergyData(records[date]) && !records[date]?.meals.length,
  ).length;
  const summary = aggregateEnergy(records, unique, profile, today);
  const provisional = energyWithoutMeals > 0;
  const canColorBalance = foodDays > 0 && !provisional && summary.averageBalance !== null;
  return {
    summary,
    elapsedDays: elapsed.length,
    foodDays,
    activityDays,
    partialDays,
    energyWithoutMeals,
    provisional,
    canColorBalance,
    category: getBalanceCategory(canColorBalance ? summary.averageBalance : null),
    label: canColorBalance
      ? getBalanceLabel(summary.averageBalance)
      : provisional
        ? 'Promedio provisional'
        : 'Sin datos energéticos',
    sports: getHistorySports(elapsed.flatMap((date) => records[date]?.workouts ?? [])),
  };
}
