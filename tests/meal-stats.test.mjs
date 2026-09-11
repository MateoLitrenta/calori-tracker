import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateMealStats } from '../src/utils/mealStats.ts';

const meal = calories => ({ meals: [{ calories }], steps: 0, workouts: [] });
test('empty and activity-only days do not imply food intake or a registered day', () => {
  for (const records of [{}, { '2026-09-11': { meals: [], steps: 9000, workouts: [{ calories: 300 }] } }]) {
    assert.deepEqual(calculateMealStats(records, '2026-09-11'),
      { registeredDays: 0, avgCalories: null, currentStreak: 0 });
  }
});
test('meal stats use only registered meals and exclude future dates', () => {
  assert.deepEqual(calculateMealStats({
    '2026-09-09': meal(1000), '2026-09-10': { meals: [], steps: 1000 },
    '2026-09-11': meal(2000), '2026-09-12': meal(9000),
  }, '2026-09-11'), { registeredDays: 2, avgCalories: 1500, currentStreak: 1 });
});
test('streak follows consecutive calendar days, including month boundaries', () => {
  const records = { '2026-08-30': meal(0), '2026-08-31': meal(1500), '2026-09-01': meal(1600) };
  assert.equal(calculateMealStats(records, '2026-09-01').currentStreak, 3);
  assert.equal(calculateMealStats(records, '2026-09-02').currentStreak, 3);
  assert.equal(calculateMealStats(records, '2026-09-03').currentStreak, 0);
  delete records['2026-08-31'];
  assert.equal(calculateMealStats(records, '2026-09-01').currentStreak, 1);
});
