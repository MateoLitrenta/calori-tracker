import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChartStats } from '../src/utils/chartStats.ts';
import { calculateBMR, calculateDailyExpenditure, getBalanceCategory, getBalanceLabel } from '../src/utils/helpers.ts';

const meal = calories => ({ id: String(calories), name: 'Comida', type: 'Almuerzo', calories });
const workout = calories => ({ id: String(calories), activity: 'Caminar', duration: 30, calories, muscles: [] });
const record = (dateStr, overrides = {}) => ({ dateStr, date: new Date(`${dateStr}T12:00:00`),
  meals: [], workouts: [], steps: 0, water: 0, ...overrides });
const profile = records => ({ id: 'test', name: 'Mateo', age: 30, sex: 'Masculino',
  height: 180, weight: 80, goal: 'Mantenimiento', activity: 'Activo', records });

test('week averages use their actual samples and every energetic day counts as registered', () => {
  const user = profile({
    '2026-09-28': record('2026-09-28', { meals: [meal(2000)], steps: 5000 }),
    '2026-09-29': record('2026-09-29', { meals: [meal(2200)], workouts: [workout(300)] }),
    '2026-09-30': record('2026-09-30', { workouts: [workout(400)] }),
    '2026-10-01': record('2026-10-01', { meals: [meal(9999)] }),
    '2026-09-21': record('2026-09-21', { meals: [meal(800)] }),
  });
  const stats = buildChartStats(user, 'Semana', '2026-09-30');
  assert.equal(stats.start, '2026-09-28');
  assert.equal(stats.end, '2026-10-04');
  assert.equal(stats.buckets.length, 7);
  assert.deepEqual(stats.buckets.map(bucket => bucket.label), ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']);
  assert.equal(stats.summary.consumed, 2100);
  const expenditures = ['2026-09-28', '2026-09-29', '2026-09-30']
    .map(date => calculateDailyExpenditure(user, user.records[date]));
  assert.equal(stats.summary.expenditure, Math.round(expenditures.reduce((sum, value) => sum + value, 0) / 3));
  assert.equal(stats.summary.balance, Math.round(((2000 - expenditures[0]) + (2200 - expenditures[1])) / 2));
  assert.equal(stats.summary.mealDays, 2);
  assert.equal(stats.summary.energyDays, 3);
  assert.equal(stats.buckets[2].summary.consumed, null);
  assert.equal(stats.buckets[2].summary.balance, null);
  assert.equal(stats.buckets[2].summary.expenditure, expenditures[2]);
  assert.equal(stats.buckets[3].summary.energyDays, 0, 'future records are ignored');
});

test('calendar month clips weekly buckets and excludes previous months', () => {
  const user = profile({
    '2026-08-31': record('2026-08-31', { meals: [meal(9000)] }),
    '2026-09-01': record('2026-09-01', { meals: [meal(1800)] }),
    '2026-09-07': record('2026-09-07', { meals: [meal(2200)] }),
    '2026-09-08': record('2026-09-08', { meals: [meal(2400)] }),
    '2026-09-30': record('2026-09-30', { meals: [meal(2000)] }),
  });
  const stats = buildChartStats(user, 'Mes', '2026-09-30');
  assert.equal(stats.start, '2026-09-01');
  assert.equal(stats.end, '2026-09-30');
  assert.equal(stats.summary.consumed, 2100);
  assert.equal(stats.summary.mealDays, 4);
  assert.deepEqual(stats.buckets.map(bucket => [bucket.start, bucket.end]), [
    ['2026-09-01', '2026-09-07'], ['2026-09-08', '2026-09-14'],
    ['2026-09-15', '2026-09-21'], ['2026-09-22', '2026-09-28'], ['2026-09-29', '2026-09-30'],
  ]);
  assert.equal(stats.buckets[0].summary.consumed, 2000);
  assert.equal(stats.buckets[1].summary.consumed, 2400);
  assert.equal(stats.buckets[2].summary.consumed, null);
});

test('calendar boundaries handle leap day, month length and weeks crossing years', () => {
  const user = profile({ '2024-02-29': record('2024-02-29', { meals: [meal(1700)] }) });
  const leap = buildChartStats(user, 'Mes', '2024-02-29');
  assert.equal(leap.end, '2024-02-29');
  assert.equal(leap.buckets.length, 5);
  assert.equal(leap.buckets[4].start, '2024-02-29');
  assert.equal(leap.buckets[4].end, '2024-02-29');
  assert.equal(leap.buckets[4].summary.consumed, 1700);
  const normal = buildChartStats(profile({}), 'Mes', '2025-02-28');
  assert.equal(normal.buckets.length, 4);
  assert.equal(normal.end, '2025-02-28');
  const yearWeek = buildChartStats(profile({}), 'Semana', '2026-01-01');
  assert.equal(yearWeek.start, '2025-12-29');
  assert.equal(yearWeek.end, '2026-01-04');
});

test('year has twelve calendar months and monthly daily means rather than totals', () => {
  const user = profile({
    '2025-12-31': record('2025-12-31', { meals: [meal(9000)] }),
    '2026-01-01': record('2026-01-01', { meals: [meal(2000)] }),
    '2026-01-10': record('2026-01-10', { meals: [meal(2400)] }),
    '2026-02-02': record('2026-02-02', { meals: [meal(1800)] }),
    '2026-10-01': record('2026-10-01', { meals: [meal(8000)] }),
  });
  const stats = buildChartStats(user, 'Año', '2026-09-30');
  assert.equal(stats.start, '2026-01-01');
  assert.equal(stats.end, '2026-12-31');
  assert.equal(stats.buckets.length, 12);
  assert.equal(stats.buckets[0].summary.consumed, 2200);
  assert.equal(stats.buckets[1].summary.consumed, 1800);
  assert.equal(stats.buckets[1].end, '2026-02-28');
  assert.equal(stats.buckets[9].summary.consumed, null);
  assert.equal(stats.summary.consumed, 2067);
});

test('workout-only expenditure exists without invented consumption or balance', () => {
  const user = profile({ '2026-09-30': record('2026-09-30', { workouts: [workout(350)] }) });
  const { summary } = buildChartStats(user, 'Semana', '2026-09-30');
  assert.equal(summary.expenditure, calculateBMR(user) + 350);
  assert.equal(summary.consumed, null);
  assert.equal(summary.balance, null);
  assert.equal(summary.energyDays, 1);
  assert.equal(summary.mealDays, 0);
  assert.equal(getBalanceCategory(summary.balance), 'empty');
  assert.equal(getBalanceLabel(summary.balance), 'Sin datos');
});

test('empty, water-only and weight-only dates never dilute means', () => {
  const user = profile({
    '2026-09-28': record('2026-09-28', { water: 2000 }),
    '2026-09-29': record('2026-09-29', { weight: 79 }),
    '2026-09-30': record('2026-09-30'),
  });
  const stats = buildChartStats(user, 'Semana', '2026-09-30');
  assert.deepEqual(stats.summary, { consumed: null, expenditure: null, balance: null,
    mealDays: 0, energyDays: 0, stepDays: 0, steps: null, workoutCalories: null, workoutCount: 0 });
  user.records['2026-09-30'].meals = [meal(2000)];
  const updated = buildChartStats(user, 'Semana', '2026-09-30').summary;
  assert.equal(updated.consumed, 2000);
  assert.equal(updated.expenditure, calculateBMR(user));
  assert.equal(updated.energyDays, 1);
});

test('balance output uses existing product thresholds and registered activity arithmetic', () => {
  const user = profile({ '2026-09-30': record('2026-09-30', { meals: [meal(1500)], steps: 5000 }) });
  const { summary } = buildChartStats(user, 'Semana', '2026-09-30');
  const expected = 1500 - calculateDailyExpenditure(user, user.records['2026-09-30']);
  assert.equal(summary.balance, expected);
  assert.equal(getBalanceCategory(summary.balance), getBalanceCategory(expected));
  assert.equal(getBalanceLabel(summary.balance), getBalanceLabel(expected));
  const initial = { ...summary };
  user.activity = 'Sedentario';
  assert.deepEqual(buildChartStats(user, 'Semana', '2026-09-30').summary, initial);
});

test('activity averages positive step entries and totals recorded workout calories and count', () => {
  const user = profile({
    '2026-09-28': record('2026-09-28', { steps: 7000 }),
    '2026-09-29': record('2026-09-29', { steps: 9000, workouts: [workout(200), workout(300)] }),
    '2026-09-30': record('2026-09-30', { meals: [meal(2000)], workouts: [workout(400)] }),
    '2026-09-21': record('2026-09-21', { steps: 25000, workouts: [workout(2000)] }),
  });
  const { summary } = buildChartStats(user, 'Semana', '2026-09-30');
  assert.equal(summary.steps, 8000);
  assert.equal(summary.stepDays, 2);
  assert.equal(summary.workoutCalories, 900);
  assert.equal(summary.workoutCount, 3);
});

test('comparison requires at least two meal dates in each current and previous period', () => {
  const user = profile({
    '2026-09-21': record('2026-09-21', { meals: [meal(2000)], steps: 5000 }),
    '2026-09-22': record('2026-09-22', { meals: [meal(1800)] }),
    '2026-09-28': record('2026-09-28', { meals: [meal(2100)], steps: 10000 }),
    '2026-09-29': record('2026-09-29', { meals: [meal(1900)] }),
  });
  const comparison = buildChartStats(user, 'Semana', '2026-09-30').comparison;
  assert.deepEqual(comparison, { consumed: 100, expenditure: 100, balance: 0 });
  user.records['2026-09-29'].meals = [];
  user.records['2026-09-29'].workouts = [workout(200)];
  assert.equal(buildChartStats(user, 'Semana', '2026-09-30').comparison, null);
  user.records['2026-09-29'].meals = [meal(1900)];
  user.records['2026-09-22'].meals = [];
  assert.equal(buildChartStats(user, 'Semana', '2026-09-30').comparison, null);
});

test('month and year comparison use the preceding calendar period, including year transitions', () => {
  const user = profile({
    '2025-12-10': record('2025-12-10', { meals: [meal(1800)] }),
    '2025-12-20': record('2025-12-20', { meals: [meal(2200)] }),
    '2026-01-02': record('2026-01-02', { meals: [meal(2100)] }),
    '2026-01-03': record('2026-01-03', { meals: [meal(2300)] }),
  });
  assert.equal(buildChartStats(user, 'Mes', '2026-01-03').comparison.consumed, 200);
  assert.equal(buildChartStats(user, 'Año', '2026-01-03').comparison.consumed, 200);
});

test('secondary streak only includes meal dates from the selected period', () => {
  const user = profile(Object.fromEntries(['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30']
    .map(date => [date, record(date, { meals: [meal(2000)] })])));
  assert.equal(buildChartStats(user, 'Semana', '2026-09-30').currentStreak, 3);
  assert.equal(buildChartStats(user, 'Mes', '2026-09-30').currentStreak, 4);
});
