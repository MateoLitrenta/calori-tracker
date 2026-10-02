import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getHeatmapActivities, getHeatmapBorder } from '../src/utils/heatmapActivity.ts';
import { getNetBalance, getHeatmapColor, getBalanceCategory } from '../src/utils/helpers.ts';

const workouts = (...names) => names.map(activity => ({ activity, calories: 100 }));

for (const [names, selected, expected] of [
  [[], true, 'selected'],
  [['Gimnasio'], false, 'gym'],
  [['Fútbol'], false, 'football'],
  [['Gimnasio'], true, 'selected'],
  [['Fútbol'], true, 'selected'],
  [['Gimnasio', 'Fútbol'], false, 'football'],
  [['Gimnasio', 'Fútbol'], true, 'selected'],
  [['Caminata'], false, 'normal'],
  [[], false, 'normal'],
]) test(`border: ${names.join(' + ') || 'normal'}, selected=${selected} → ${expected}`, () => {
  assert.equal(getHeatmapBorder(getHeatmapActivities(workouts(...names)), selected), expected);
});

for (const name of ['gimnasio', 'Gym', 'pesas', 'MUSCULACIÓN', 'fuerza',
  'entrenamiento de fuerza', 'strength', 'weight training']) {
  test(`recognizes gym activity: ${name}`, () => {
    assert.deepEqual(getHeatmapActivities(workouts(name)), { gym: true, football: false });
  });
}

for (const name of ['fútbol', 'futbol', 'Football', 'soccer', 'fútbol 5', 'fútbol 8', 'fútbol 11']) {
  test(`recognizes football activity: ${name}`, () => {
    assert.deepEqual(getHeatmapActivities(workouts(name)), { gym: false, football: true });
  });
}

test('uses actual workout names, not details, substrings or other sports', () => {
  for (const activity of ['Correr', 'gymnastics', 'refuerzo', 'American football', 'fútbol americano']) {
    assert.deepEqual(getHeatmapActivities([{ activity, details: 'Gimnasio y fútbol' }]),
      { gym: false, football: false });
  }
  assert.deepEqual(getHeatmapActivities(), { gym: false, football: false });
  assert.deepEqual(getHeatmapActivities([{ activity: null }]), { gym: false, football: false });
});

test('selection overrides activity temporarily; previous activity border returns', () => {
  for (const [name, border] of [['Gym', 'gym'], ['Soccer', 'football']]) {
    const activities = getHeatmapActivities(workouts(name));
    assert.equal(getHeatmapBorder(activities, false), border);
    assert.equal(getHeatmapBorder(activities, true), 'selected');
    assert.equal(getHeatmapBorder(activities, false), border);
  }
});

test('activity and selection do not alter energy balance, category, fill or recorded data', () => {
  const profile = { age: 30, sex: 'Masculino', weight: 70, height: 170 };
  for (const [calories, expectedCategory] of [[1200, 'deficit-high'], [1718, 'neutral'], [2200, 'surplus-medium']]) {
    const baseRecord = { dateStr: '2026-10-01', steps: 0, water: 0,
      meals: [{ calories }], workouts: workouts('Caminata') };
    const expectedBalance = getNetBalance(baseRecord, profile);
    const expectedFill = getHeatmapColor(expectedBalance);
    for (const activity of ['Caminata', 'Gimnasio', 'Fútbol', 'Gimnasio y fútbol']) {
      const record = { ...baseRecord, workouts: workouts(activity) };
      const snapshot = structuredClone(record);
      const activities = getHeatmapActivities(record.workouts);
      for (const selected of [false, true]) {
        getHeatmapBorder(activities, selected);
        assert.equal(getNetBalance(record, profile), expectedBalance);
        assert.equal(getBalanceCategory(expectedBalance), expectedCategory);
        assert.equal(getHeatmapColor(getNetBalance(record, profile)), expectedFill);
        assert.deepEqual(record, snapshot);
      }
    }
  }
  assert.equal(getNetBalance(undefined, profile), null);
  assert.equal(getHeatmapColor(null), 'bg-slate-200 dark:bg-[#2d333b]');
});
