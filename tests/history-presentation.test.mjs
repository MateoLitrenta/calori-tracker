import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
import { aggregateEnergy, calculateDailyExpenditure, getBalanceCategory, getBalanceLabel,
  getNetBalance } from '../src/utils/helpers.ts';
import { getHeatmapActivities } from '../src/utils/heatmapActivity.ts';

// Only the presentation adapter is transpiled. Its arithmetic/classifier imports
// resolve to the real existing modules, not duplicate test implementations.
const source = await readFile(new URL('../src/utils/historyPresentation.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023,
} }).outputText.replace(/from ['"]\.\/(helpers|heatmapActivity)['"]/g,
  (_, name) => 'from ' + JSON.stringify(new URL('../src/utils/' + name + '.ts', import.meta.url).href));
const { getHistoryDay, getHistoryPeriod, getHistorySports, hasHistoryActivity } =
  await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

const today = '2026-11-12';
const profile = { id: 'synthetic', name: 'Synthetic', age: 30, sex: 'Masculino', height: 170,
  weight: 70, goal: 'Mantenimiento', activity: 'Moderado', records: {} };
const day = (dateStr, patch = {}) => ({ dateStr, date: new Date(dateStr + 'T12:00:00'),
  meals: [], workouts: [], steps: 0, water: 0, ...patch });
const workout = (activity, patch = {}) => ({ id: activity, activity, duration: 30,
  calories: 150, muscles: [], ...patch });
const withBalance = (date, balance, patch = {}) => {
  const base = day(date, patch);
  return { ...base, meals: [{ id: 'meal-' + date, name: 'Comida sintética', type: 'Almuerzo',
    calories: calculateDailyExpenditure(profile, base) + balance }] };
};

for (const balance of [-600, -500, -250, -1, 0, 1, 250, 251, 500, 501]) {
  test('food-backed daily balance preserves the canonical category at ' + balance + ' kcal', () => {
    const record = withBalance(today, balance, { steps: 2500, workouts: [workout('Caminata')] });
    const before = structuredClone(record);
    const result = getHistoryDay(record, today, profile, today);
    assert.equal(result.balance, getNetBalance(record, profile));
    assert.equal(result.balance, balance);
    assert.equal(result.category, getBalanceCategory(balance));
    assert.equal(result.label, getBalanceLabel(balance));
    assert.equal(result.state, 'with-meals');
    assert.equal(result.withMeals, true);
    assert.equal(result.canColorBalance, true);
    assert.deepEqual(record, before, 'Presentation cannot mutate a stored record');
  });
}

for (const patch of [{ steps: 8500 }, { workouts: [workout('Fútbol')] },
  { steps: 8500, workouts: [workout('Gimnasio')] }]) {
  test('activity without meals never becomes a confirmed deficit: ' + JSON.stringify(Object.keys(patch)), () => {
    const record = day(today, patch);
    const result = getHistoryDay(record, today, profile, today);
    assert.ok(getNetBalance(record, profile) < 0, 'Fixture intentionally has an existing negative canonical estimate');
    assert.equal(result.balance, getNetBalance(record, profile), 'Do not erase or replace the official arithmetic');
    assert.equal(result.state, 'partial');
    assert.equal(result.canColorBalance, false);
    assert.equal(result.category, 'empty');
    assert.match(result.label, /parcial.*sin comidas/i);
    assert.doesNotMatch(result.label, /déficit/i);
  });
}

test('water and weight remain visible partial activity without manufacturing an energy balance', () => {
  const record = day(today, { water: 2250, weight: 71.2345 });
  const result = getHistoryDay(record, today, profile, today);
  assert.equal(hasHistoryActivity(record), true);
  assert.equal(result.state, 'partial');
  assert.equal(result.balance, null);
  assert.equal(result.canColorBalance, false);
  assert.equal(result.category, 'empty');
});

test('missing and empty days remain unknown rather than zero intake or a calculated deficit', () => {
  for (const record of [undefined, day(today)]) {
    const result = getHistoryDay(record, today, profile, today);
    assert.equal(result.state, 'empty');
    assert.equal(result.activity, false);
    assert.equal(result.balance, null);
    assert.equal(result.category, 'empty');
    assert.equal(result.label, 'Sin registros');
  }
});

test('future records cannot leak balance, activity or sports into historical presentation', () => {
  const future = '2026-11-13';
  const result = getHistoryDay(withBalance(future, -100, { workouts: [workout('Fútbol')] }), future, profile, today);
  assert.equal(result.state, 'future');
  assert.equal(result.balance, null);
  assert.equal(result.activity, false);
  assert.equal(result.withMeals, false);
  assert.equal(result.canColorBalance, false);
  assert.equal(result.category, 'empty');
  assert.deepEqual(result.sports, { total: 0, football: 0, gym: 0, other: 0 });
});

test('sports reuse the existing classifier, preserve mixed sessions and keep other activities generic', () => {
  const records = [workout('Fútbol'), workout('GYM'), workout('Correr'), workout('Gimnasio y fútbol')];
  const before = structuredClone(records);
  const result = getHistorySports(records);
  assert.deepEqual(result, { total: 4, football: 2, gym: 2, other: 1 });
  assert.deepEqual(getHeatmapActivities([records[3]]), { football: true, gym: true });
  assert.deepEqual(records, before);
});

test('sport descriptions, substrings and American football do not invent football or gym categories', () => {
  const records = [workout('American football'), workout('gymnastics'),
    workout('Natación', { details: 'Fútbol y gimnasio' })];
  assert.deepEqual(getHistorySports(records), { total: 3, football: 0, gym: 0, other: 3 });
  assert.deepEqual(getHistorySports(), { total: 0, football: 0, gym: 0, other: 0 });
});

test('a mixed period preserves the official denominator and reports its food/energy coverage separately', () => {
  const foodDate = '2026-11-09', partialDate = '2026-11-10', waterDate = '2026-11-11', missing = '2026-11-08';
  const records = { [foodDate]: withBalance(foodDate, 300), [partialDate]: day(partialDate, { steps: 1000 }),
    [waterDate]: day(waterDate, { water: 2000, weight: 71 }) };
  const dates = [missing, foodDate, partialDate, waterDate, today];
  const before = structuredClone(records);
  const result = getHistoryPeriod(records, dates, profile, today);
  assert.deepEqual(result.summary, aggregateEnergy(records, dates, profile, today));
  assert.equal(result.summary.days, 2, 'The activity-only energy day remains in the existing denominator');
  assert.equal(result.elapsedDays, 5);
  assert.equal(result.foodDays, 1);
  assert.equal(result.activityDays, 3);
  assert.equal(result.partialDays, 2);
  assert.equal(result.energyWithoutMeals, 1);
  assert.equal(result.provisional, true);
  assert.equal(result.canColorBalance, false);
  assert.equal(result.category, 'empty');
  assert.equal(result.label, 'Promedio provisional');
  assert.notEqual(result.summary.averageBalance,
    aggregateEnergy(records, [foodDate], profile, today).averageBalance,
    'Do not substitute an independently calculated food-only mean');
  assert.deepEqual(records, before);
});

test('coverage deduplicates dates and excludes future data from counts and sport totals', () => {
  const past = '2026-11-11', future = '2026-11-13';
  const records = { [past]: withBalance(past, -92, { workouts: [workout('Fútbol'), workout('Gimnasio')] }),
    [future]: withBalance(future, 2000, { workouts: [workout('Fútbol')] }) };
  const dates = [past, past, today, future];
  const result = getHistoryPeriod(records, dates, profile, today);
  assert.deepEqual(result.summary, aggregateEnergy(records, dates, profile, today));
  assert.equal(result.elapsedDays, 2);
  assert.equal(result.foodDays, 1);
  assert.equal(result.activityDays, 1);
  assert.equal(result.summary.days, 1);
  assert.deepEqual(result.sports, { total: 2, football: 1, gym: 1, other: 0 });
  assert.equal(result.canColorBalance, true);
  assert.equal(result.category, getBalanceCategory(-92));
});

test('the available canonical average is visible without inventing a minimum number of meal days', () => {
  const records = { [today]: withBalance(today, 0) };
  const result = getHistoryPeriod(records, ['2026-11-10', '2026-11-11', today], profile, today);
  assert.equal(result.foodDays, 1);
  assert.equal(result.elapsedDays, 3);
  assert.equal(result.summary.days, 1);
  assert.equal(result.summary.averageBalance, 0);
  assert.equal(result.canColorBalance, true);
  assert.equal(result.category, 'neutral');
});

test('empty, water-only and entirely activity-only periods remain neutral without changing canonical totals', () => {
  for (const records of [{}, { [today]: day(today, { water: 2500 }) },
    { [today]: day(today, { workouts: [workout('Fútbol')] }) }]) {
    const result = getHistoryPeriod(records, [today], profile, today);
    assert.deepEqual(result.summary, aggregateEnergy(records, [today], profile, today));
    assert.equal(result.foodDays, 0);
    assert.equal(result.canColorBalance, false);
    assert.equal(result.category, 'empty');
  }
});
