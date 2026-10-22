import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildHistoryPeriods } from '../src/utils/historyPeriods.ts';
import { aggregateEnergy } from '../src/utils/helpers.ts';

const profile = { age: 30, sex: 'Masculino', weight: 70, height: 170, goal: 'Mantenimiento' };
const record = calories => ({ meals: [{ calories }], workouts: [], water: 0, steps: 0 });

test('calendar keeps the existing Sunday-aligned year, 53 weeks, twelve months and two calendar years', () => {
  for (const stamp of ['2026-01-01', '2026-10-22', '2024-02-29', '2028-12-31']) {
    const today = new Date(stamp + 'T12:00:00');
    const calendar = buildHistoryPeriods(today);
    assert.equal(calendar.week.length, 53);
    assert.equal(calendar.columns.length, calendar.week.length);
    assert.equal(calendar.month.length, 12);
    assert.equal(calendar.year.length, 2);
    assert.equal(calendar.year[0].label, String(today.getFullYear() - 1));
    assert.equal(calendar.year[1].label, String(today.getFullYear()));
    assert.ok(calendar.week.every(week => week.dates.length === 7));
    assert.ok(calendar.columns.every(week => week.length === 7));
    const days = calendar.columns.flat().filter(Boolean);
    assert.equal(new Set(days).size, days.length);
    assert.equal(days.at(-1), stamp);
    assert.ok(days.every(date => date <= stamp));
    assert.equal(new Date(days[0] + 'T12:00:00').getDay(), 0);
    assert.equal(calendar.week[0].dates[0], days[0]);
    for (const label of calendar.monthLabels) {
      assert.ok(calendar.columns[label.colIndex].some(date => date?.endsWith('-01')));
    }
  }
});

test('ranges preserve leap days, cross-year weeks and partial current months/years without extrapolation', () => {
  const calendar = buildHistoryPeriods(new Date('2024-02-29T12:00:00'));
  assert.equal(calendar.month.at(-1).dates.length, 29);
  assert.equal(calendar.year.at(-1).dates.length, 366);
  assert.ok(calendar.week.some(week => week.dates[0] < '2024-01-01' && week.dates.at(-1) >= '2024-01-01'));
  const today = '2026-10-22';
  const current = buildHistoryPeriods(new Date(today + 'T12:00:00'));
  const records = { '2026-10-20': record(1618), '2026-10-22': record(1800), '2026-10-23': record(999999),
    '2026-10-21': { meals: [], workouts: [], steps: 0, water: 2500 } };
  const frozen = structuredClone(records);
  for (const interval of [current.week.at(-1), current.month.at(-1), current.year.at(-1)]) {
    const summary = aggregateEnergy(records, interval.dates, profile, today);
    assert.equal(summary.days, 2, 'Only past/present days with existing energy data count');
    assert.equal(summary.consumed, 3418);
    assert.equal(summary.balance, 182);
    assert.equal(summary.averageBalance, 91);
    assert.ok(interval.dates.some(date => date > today));
  }
  assert.deepEqual(records, frozen);
});

test('empty history stays unknown, neutral balance stays zero, and future-only records never count', () => {
  const today = '2026-10-22';
  const { month, year } = buildHistoryPeriods(new Date(today + 'T12:00:00'));
  for (const group of [...month, ...year]) {
    assert.deepEqual(aggregateEnergy({}, group.dates, profile, today),
      { consumed: 0, expenditure: 0, target: 0, days: 0, balance: null, averageBalance: null });
  }
  assert.equal(aggregateEnergy({ [today]: record(1618) }, [today], profile, today).averageBalance, 0);
  assert.equal(aggregateEnergy({ '2026-10-23': record(9999) }, ['2026-10-23'], profile, today).averageBalance, null);
});
