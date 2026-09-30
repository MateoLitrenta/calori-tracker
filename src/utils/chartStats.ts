import type { DailyRecordsMap, UserProfile } from '../types/index.ts';
import { aggregateEnergy, formatDateStr, getWorkoutCalories, hasEnergyData } from './helpers.ts';
import { calculateMealStats } from './mealStats.ts';

export type ChartPeriod = 'Semana' | 'Mes' | 'Año';

export interface ChartSummary {
  consumed: number | null;
  expenditure: number | null;
  balance: number | null;
  mealDays: number;
  energyDays: number;
  stepDays: number;
  steps: number | null;
  workoutCalories: number | null;
  workoutCount: number;
}

export interface ChartBucket {
  label: string;
  title: string;
  start: string;
  end: string;
  summary: ChartSummary;
}

const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const weekdayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const dateStr = (date: Date) => date.toISOString().slice(0, 10);
const moveDays = (date: Date, days: number) => new Date(Date.UTC(
  date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));

function periodRange(period: ChartPeriod, reference: Date) {
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth();
  if (period === 'Semana') {
    const start = moveDays(reference, -((reference.getUTCDay() + 6) % 7));
    return { start, end: moveDays(start, 6) };
  }
  if (period === 'Mes') {
    return { start: new Date(Date.UTC(year, month, 1)), end: new Date(Date.UTC(year, month + 1, 0)) };
  }
  return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year, 11, 31)) };
}

function rangeDates(start: Date, end: Date) {
  const dates: string[] = [];
  for (let date = start; date <= end; date = moveDays(date, 1)) dates.push(dateStr(date));
  return dates;
}

function summarize(records: DailyRecordsMap, dates: string[], profile: UserProfile, today: string): ChartSummary {
  const energyDates = dates.filter(date => date <= today && hasEnergyData(records[date]));
  const mealDates = energyDates.filter(date => records[date].meals.length > 0);
  const stepDates = energyDates.filter(date => records[date].steps > 0);
  const energy = aggregateEnergy(records, energyDates, profile, today);
  const meals = aggregateEnergy(records, mealDates, profile, today);
  const workoutCount = energyDates.reduce((sum, date) => sum + records[date].workouts.length, 0);
  return {
    consumed: meals.days ? Math.round(meals.consumed / meals.days) : null,
    expenditure: energy.days ? Math.round(energy.expenditure / energy.days) : null,
    balance: meals.averageBalance,
    mealDays: meals.days,
    energyDays: energy.days,
    stepDays: stepDates.length,
    steps: stepDates.length
      ? Math.round(stepDates.reduce((sum, date) => sum + records[date].steps, 0) / stepDates.length) : null,
    workoutCalories: workoutCount
      ? Math.round(energyDates.reduce((sum, date) => sum + getWorkoutCalories(records[date]), 0)) : null,
    workoutCount,
  };
}

export function buildChartStats(profile: UserProfile, period: ChartPeriod, today = formatDateStr(new Date())) {
  const reference = new Date(`${today}T00:00:00Z`);
  const { start, end } = periodRange(period, reference);
  const dates = rangeDates(start, end);
  const summary = summarize(profile.records, dates, profile, today);
  const buckets: ChartBucket[] = [];
  const addBucket = (label: string, title: string, bucketStart: Date, bucketEnd: Date) => {
    buckets.push({ label, title, start: dateStr(bucketStart), end: dateStr(bucketEnd),
      summary: summarize(profile.records, rangeDates(bucketStart, bucketEnd), profile, today) });
  };

  if (period === 'Semana') {
    for (let day = 0; day < 7; day++) {
      const date = moveDays(start, day);
      addBucket(weekdays[day], weekdayNames[day], date, date);
    }
  } else if (period === 'Mes') {
    for (let day = 1, week = 1; day <= end.getUTCDate(); day += 7, week++) {
      const bucketStart = moveDays(start, day - 1);
      const bucketEnd = moveDays(start, Math.min(day + 6, end.getUTCDate()) - 1);
      addBucket(`Sem ${week}`, `Semana ${week} · ${day}–${bucketEnd.getUTCDate()}`, bucketStart, bucketEnd);
    }
  } else {
    for (let month = 0; month < 12; month++) {
      addBucket(months[month], monthNames[month], new Date(Date.UTC(start.getUTCFullYear(), month, 1)),
        new Date(Date.UTC(start.getUTCFullYear(), month + 1, 0)));
    }
  }

  const previousRange = periodRange(period, moveDays(start, -1));
  const previous = summarize(profile.records, rangeDates(previousRange.start, previousRange.end), profile, today);
  const comparison = summary.mealDays >= 2 && previous.mealDays >= 2
    ? { consumed: summary.consumed! - previous.consumed!,
      expenditure: summary.expenditure! - previous.expenditure!, balance: summary.balance! - previous.balance! }
    : null;
  const periodRecords = Object.fromEntries(dates.filter(date => date <= today && profile.records[date])
    .map(date => [date, profile.records[date]]));
  return { start: dateStr(start), end: dateStr(end), buckets, summary, comparison,
    currentStreak: calculateMealStats(periodRecords, today).currentStreak };
}
