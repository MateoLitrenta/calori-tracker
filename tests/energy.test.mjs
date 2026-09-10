import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateBMR, calculateTDEE, calculateDailyCalorieTarget, getActivityMultiplier,
  getRemainingCalories, getRemainingLabel, getEstimatedEnergyBalance, aggregateEnergy } from '../src/utils/helpers.ts';

const profile = { id: 'test', name: 'Test', age: 30, sex: 'Masculino', weight: 70,
  height: 170, goal: 'Mantenimiento', activity: 'Sedentario', records: {} };
const record = (dateStr, calories = 0) => ({ dateStr, date: new Date(dateStr),
  meals: calories ? [{ id: 'meal', name: 'Meal', type: 'Almuerzo', calories }] : [],
  workouts: [], steps: 0, water: 0 });

for (const [activity, goal, multiplier, tdee, target] of [
  ['Sedentario', 'Mantenimiento', 1.20, 1942, 1942],
  ['Moderado', 'Déficit', 1.375, 2225, 1825],
  ['Activo', 'Superávit', 1.55, 2508, 2808],
]) test(`${activity}: TMB, TDEE and target`, () => {
  const p = { ...profile, activity, goal };
  assert.equal(calculateBMR(p), 1618);
  assert.equal(getActivityMultiplier(p), multiplier);
  assert.equal(calculateTDEE(p), tdee);
  assert.equal(calculateDailyCalorieTarget(p), target);
});

test('missing and invalid activity safely default', () => {
  for (const activity of [undefined, null, 'invalid', 'toString']) {
    assert.equal(getActivityMultiplier({ ...profile, activity }), 1.20);
    assert.equal(calculateTDEE({ ...profile, activity }), 1942);
  }
});

test('remaining: empty intake, exact target and excess', () => {
  assert.equal(getRemainingCalories(undefined, 1942), 1942);
  assert.equal(getRemainingLabel(1942), 'Restantes');
  assert.equal(getRemainingCalories(record('2026-09-01', 1942), 1942), 0);
  assert.equal(getRemainingLabel(0), 'Meta alcanzada');
  assert.equal(getRemainingCalories(record('2026-09-01', 2200), 1942), -258);
  assert.equal(getRemainingLabel(-258), 'Exceso');
});

test('steps and workouts never increase expenditure or target', () => {
  const r = record('2026-09-01', 1200);
  const active = { ...r, steps: 7000, workouts: [{ calories: 450 }] };
  assert.equal(getEstimatedEnergyBalance(r, 2225), -1025);
  assert.equal(getEstimatedEnergyBalance(active, 2225), -1025);
  assert.equal(getRemainingCalories(active, 1825), 625);
});

test('no energy data stays null, including water/weight-only records', () => {
  assert.equal(getEstimatedEnergyBalance(undefined, 2225), null);
  assert.equal(getEstimatedEnergyBalance({ ...record('2026-09-01'), water: 500, weight: 70 }, 2225), null);
});

for (const length of [7, 30, 365]) test(`${length}-day aggregation counts unique recorded calendar days only`, () => {
  const dates = Array.from({ length }, (_, i) => new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10));
  const records = { [dates[0]]: record(dates[0], 1200), [dates[1]]: record(dates[1], 2000),
    [dates[2]]: record(dates[2]), [dates[3]]: { ...record(dates[3]), steps: 7000 },
    '2027-01-01': record('2027-01-01', 2000) };
  const result = aggregateEnergy(records, [...dates, dates[0], '2027-01-01'], 2225, '2026-12-31');
  assert.equal(result.days, 3);
  assert.equal(result.consumed, 3200);
  assert.equal(result.expenditure, 6675);
  assert.equal(result.balance, -3475);
  assert.equal(result.averageBalance, -1158);
  assert.equal(aggregateEnergy({}, dates, 2225).balance, null);
});
