import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregateEnergy, getBalanceCategory, getBalanceLabel, getBalancePillColor,
  getHeatmapColor } from '../src/utils/helpers.ts';

for (const [balance, category, label, color] of [
  [null, 'empty', 'Sin datos', 'bg-slate-200 dark:bg-[#2d333b]'],
  [-600, 'deficit-high', 'Déficit Alto', 'bg-heatmap-deficit-high'],
  [-500, 'deficit-medium', 'Déficit Moderado', 'bg-heatmap-deficit-medium'],
  [-250, 'deficit-low', 'Déficit Leve', 'bg-heatmap-deficit-low'],
  [-100, 'neutral', 'Mantenimiento', 'bg-heatmap-neutral'],
  [-50, 'neutral', 'Mantenimiento', 'bg-heatmap-neutral'],
  [0, 'neutral', 'Mantenimiento', 'bg-heatmap-neutral'],
  [50, 'neutral', 'Mantenimiento', 'bg-heatmap-neutral'],
  [100, 'neutral', 'Mantenimiento', 'bg-heatmap-neutral'],
  [101, 'surplus-low', 'Superávit Leve', 'bg-heatmap-surplus-low'],
  [300, 'surplus-medium', 'Superávit Moderado', 'bg-heatmap-surplus-medium'],
  [600, 'surplus-high', 'Superávit Alto', 'bg-heatmap-surplus-high'],
]) test(`${balance} kcal uses one category for color, pill and label`, () => {
  assert.equal(getBalanceCategory(balance), category);
  assert.equal(getBalanceLabel(balance), label);
  assert.equal(getHeatmapColor(balance), color);
  assert.ok(getBalancePillColor(balance).includes(color));
});

test('group color and label use average daily balance, not accumulated balance', () => {
  const profile = { name: 'Test', age: 30, sex: 'Masculino', weight: 70, height: 170,
    goal: 'Mantenimiento', activity: 'Sedentario', records: {} };
  const dates = Array.from({ length: 20 }, (_, index) => `2026-09-${String(index + 1).padStart(2, '0')}`);
  const records = Object.fromEntries(dates.map(dateStr => [dateStr, {
    dateStr, date: new Date(`${dateStr}T12:00:00`), steps: 0, water: 0, workouts: [],
    meals: [{ id: dateStr, name: 'Comida', type: 'Almuerzo', calories: 1558 }],
  }]));
  const summary = aggregateEnergy(records, dates, profile, '2026-09-20');
  assert.equal(summary.balance, -1200);
  assert.equal(summary.averageBalance, -60);
  assert.equal(getHeatmapColor(summary.averageBalance), 'bg-heatmap-neutral');
  assert.equal(getBalanceLabel(summary.averageBalance), 'Mantenimiento');
  assert.notEqual(getBalanceLabel(summary.averageBalance), getBalanceLabel(summary.balance));
});
