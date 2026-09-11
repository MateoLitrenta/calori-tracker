import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateBMR, calculateTDEE, calculateDailyCalorieTarget, getActivityMultiplier,
  calculateDailyExpenditure, getStepCalories, getWorkoutCalories, getCaloriesIngested,
  getRemainingCalories, getRemainingLabel, getEstimatedEnergyBalance, aggregateEnergy,
  buildDailyEnergyContext } from '../src/utils/helpers.ts';

const profile = { id: 'test', name: 'Test', age: 30, sex: 'Masculino', weight: 70,
  height: 170, goal: 'Mantenimiento', activity: 'Sedentario', records: {} };
const record = (dateStr, calories = 0) => ({ dateStr, date: new Date(dateStr),
  meals: calories ? [{ id: 'meal', name: 'Meal', type: 'Almuerzo', calories }] : [],
  workouts: [], steps: 0, water: 0 });
const active = { ...record('2026-09-01', 1200), steps: 7000, workouts: [{ calories: 450 }] };

for (const [activity, multiplier, tdee] of [
  ['Sedentario', 1.20, 1942], ['Moderado', 1.375, 2225], ['Activo', 1.55, 2508],
]) test(`${activity}: changes habitual TDEE, never recorded expenditure or target`, () => {
  const p = { ...profile, activity };
  assert.equal(calculateBMR(p), 1618);
  assert.equal(getActivityMultiplier(p), multiplier);
  assert.equal(calculateTDEE(p), tdee);
  assert.equal(calculateDailyExpenditure(p, active), 2348);
  assert.equal(calculateDailyCalorieTarget(p, active), 2348);
});

test('missing/invalid activity defaults safely without changing daily expenditure', () => {
  for (const activity of [undefined, null, 'invalid', 'toString']) {
    assert.equal(getActivityMultiplier({ ...profile, activity }), 1.20);
    assert.equal(calculateDailyExpenditure({ ...profile, activity }, active), 2348);
  }
});

test('TMB plus steps; foods-only expenditure is TMB', () => {
  assert.equal(calculateDailyExpenditure(profile, record('2026-09-01', 1200)), 1618);
  assert.equal(getStepCalories(active), 280);
  assert.equal(calculateDailyExpenditure(profile, { ...active, workouts: [] }), 1898);
});

test('TMB plus steps plus exact recorded workout calories, including fractional values', () => {
  assert.equal(calculateDailyExpenditure(profile, active), 2348);
  const r = { ...active, steps: 1, workouts: [{ calories: 100.25 }, { calories: 200.5 }] };
  assert.equal(getWorkoutCalories(r), 300.75);
  assert.equal(calculateDailyExpenditure(profile, r), 1918.79);
  assert.equal(getCaloriesIngested(r), 1200);
});

for (const [goal, target] of [['Déficit', 1948], ['Mantenimiento', 2348], ['Superávit', 2648]])
  test(`${goal}: dynamic target adjustment`, () => {
    assert.equal(calculateDailyCalorieTarget({ ...profile, goal }, active), target);
  });

test('step changes and workout add/edit/delete immediately change the target', () => {
  const r = record('2026-09-01', 1200);
  assert.equal(calculateDailyCalorieTarget(profile, r), 1618);
  r.steps = 7000;
  assert.equal(calculateDailyCalorieTarget(profile, r), 1898);
  r.workouts = [{ calories: 450 }];
  assert.equal(calculateDailyCalorieTarget(profile, r), 2348);
  r.workouts[0].calories = 600;
  assert.equal(calculateDailyCalorieTarget(profile, r), 2498);
  r.workouts = [];
  assert.equal(calculateDailyCalorieTarget(profile, r), 1898);
});

test('remaining: zero intake, exact target and excess; balance uses expenditure', () => {
  assert.equal(getRemainingCalories(undefined, calculateDailyCalorieTarget(profile)), 1618);
  assert.equal(getRemainingLabel(1618), 'Restantes');
  assert.equal(getRemainingCalories(record('2026-09-01', 1618), 1618), 0);
  assert.equal(getRemainingLabel(0), 'Meta alcanzada');
  assert.equal(getRemainingCalories(record('2026-09-01', 2200), 1618), -582);
  assert.equal(getRemainingLabel(-582), 'Exceso');
  assert.equal(getEstimatedEnergyBalance(active, profile), -1148);
});

test('empty and water/weight-only historical days stay Sin datos', () => {
  assert.equal(getEstimatedEnergyBalance(undefined, profile), null);
  assert.equal(getEstimatedEnergyBalance({ ...record('2026-09-01'), water: 500, weight: 70 }, profile), null);
});

for (const length of [7, 30, 365]) test(`${length}-day aggregation sums actual unique day records`, () => {
  const dates = Array.from({ length }, (_, i) => new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10));
  const records = { [dates[0]]: record(dates[0], 1200),
    [dates[1]]: { ...record(dates[1], 2000), workouts: [{ calories: 450 }] },
    [dates[2]]: record(dates[2]), [dates[3]]: { ...record(dates[3]), steps: 7000 },
    '2027-01-01': record('2027-01-01', 2000) };
  const result = aggregateEnergy(records, [...dates, dates[0], '2027-01-01'], { ...profile, goal: 'Déficit' }, '2026-12-31');
  assert.equal(result.days, 3);
  assert.equal(result.consumed, 3200);
  assert.equal(result.expenditure, 5584); // 1618 + 2068 + 1898
  assert.equal(result.target, 4384); // each included day minus 400
  assert.equal(result.balance, -2384);
  assert.equal(result.averageBalance, -795);
  assert.equal(aggregateEnergy({}, dates, profile).balance, null);
});

test('Gemini context distinguishes habitual TDEE from dynamic expenditure and target', () => {
  const context = buildDailyEnergyContext({ ...profile, activity: 'Activo', goal: 'Déficit' }, active);
  for (const text of ['TDEE de referencia habitual (no es el gasto de hoy): 2508 kcal',
    'Gasto estimado hoy: 2348 kcal', 'Meta de hoy: 1948 kcal',
    'Consumidas hoy (solo comida/bebida): 1200 kcal', 'Restantes para la meta: 748 kcal',
    'Calorías por pasos: 280 kcal', 'Calorías por ejercicio registrado: 450 kcal',
    'Nunca uses TDEE + pasos + ejercicio', 'sin correcciones arbitrarias']) assert.ok(context.includes(text), text);
});
