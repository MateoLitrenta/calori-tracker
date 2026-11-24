import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { homeWeek, moveHomeWeek } from '../src/utils/homeDateNavigation.ts';
import { buildHistoryPeriods } from '../src/utils/historyPeriods.ts';
import { buildChartStats } from '../src/utils/chartStats.ts';
import { aggregateEnergy, calculateBMR } from '../src/utils/helpers.ts';
import { coachDates } from '../src/utils/coachDates.ts';

const profile = { age: 30, sex: 'Masculino', weight: 70, height: 170,
  goal: 'Mantenimiento', records: {} };
const record = (calories, steps = 0) => ({ meals: calories === null ? [] : [{ calories }],
  workouts: [], water: 0, steps });
const bounds = dates => [dates[0], dates.at(-1)];

test('all calendar weeks coincide at month, year and leap boundaries', () => {
  const examples = [
    ['2026-11-17', ['2026-11-16', '2026-11-22']],
    ['2026-11-01', ['2026-10-26', '2026-11-01']],
    ['2027-01-01', ['2026-12-28', '2027-01-03']],
    ['2024-02-29', ['2024-02-26', '2024-03-03']],
  ];
  for (const [day, monday] of examples) {
    const journal = homeWeek(day);
    const history = buildHistoryPeriods(new Date(day + 'T12:00:00')).week.at(-1).dates;
    const charts = buildChartStats(profile, 'Semana', day);
    assert.deepEqual(bounds(journal), monday);
    assert.deepEqual(history, journal);
    assert.deepEqual([charts.start, charts.end], monday);
    assert.equal(charts.buckets.length, 7);
    assert.equal(new Set(journal).size, 7);
  }
  assert.equal(moveHomeWeek('2026-12-30', 1, '2027-01-10'), '2027-01-06');
});

test('Sunday and Monday participate in separate weeks in all three views', () => {
  const bmr = calculateBMR(profile);
  const records = { '2026-11-22': record(bmr - 686), '2026-11-23': record(bmr + 734) };
  for (const [day, balance] of [['2026-11-22', -686], ['2026-11-23', 734]]) {
    const journal = homeWeek(day);
    const history = buildHistoryPeriods(new Date(day + 'T12:00:00')).week.at(-1).dates;
    const charts = buildChartStats({ ...profile, records }, 'Semana', day);
    assert.deepEqual(history, journal);
    assert.deepEqual(charts.buckets.map(bucket => bucket.start), journal);
    assert.equal(aggregateEnergy(records, history, profile, day).averageBalance, balance);
    assert.equal(charts.summary.balance, balance);
    assert.equal(charts.summary.mealDays, 1);
  }
});

test('monthly chart groups and rolling observation windows retain their distinct boundaries', () => {
  const month = buildChartStats(profile, 'Mes', '2026-11-17');
  assert.deepEqual(month.buckets.map(bucket => [bucket.start, bucket.end]), [
    ['2026-11-01', '2026-11-07'], ['2026-11-08', '2026-11-14'],
    ['2026-11-15', '2026-11-21'], ['2026-11-22', '2026-11-28'], ['2026-11-29', '2026-11-30'],
  ]);
  assert.deepEqual(bounds(coachDates('2026-11-17')), ['2026-11-11', '2026-11-17']);
  assert.deepEqual(bounds(coachDates('2026-11-17', 7, 7)), ['2026-11-04', '2026-11-10']);
  assert.deepEqual(bounds(coachDates('2027-01-03')), ['2026-12-28', '2027-01-03']);
});

test('the existing previous-month comparison uses the whole prior calendar month and separate samples', () => {
  const records = {
    '2026-10-01': record(1600), '2026-10-02': record(null, 5000),
    '2026-10-31': record(2400), '2026-11-01': record(1700),
    '2026-11-16': record(2100), '2026-11-17': record(null, 1000),
    '2026-11-29': record(99999),
  };
  const current = buildChartStats({ ...profile, records }, 'Mes', '2026-11-17');
  const previous = buildChartStats({ ...profile, records }, 'Mes', '2026-10-31');
  assert.deepEqual([current.summary.mealDays, current.summary.energyDays], [2, 3]);
  assert.deepEqual([previous.summary.mealDays, previous.summary.energyDays], [2, 3]);
  assert.deepEqual([current.summary.consumed, current.summary.expenditure, current.summary.balance], [1900, 1631, 282]);
  assert.deepEqual([previous.summary.consumed, previous.summary.expenditure, previous.summary.balance], [2000, 1685, 382]);
  assert.deepEqual(current.comparison, { consumed: -100, expenditure: -54, balance: -100 });
  assert.notEqual(current.summary.balance, current.summary.consumed - current.summary.expenditure);
  const sparse = { ...records, '2026-10-31': record(null) };
  assert.equal(buildChartStats({ ...profile, records: sparse }, 'Mes', '2026-11-17').comparison, null);
});

test('local calendar dates and DST-safe labels are preserved across distinct device time zones', () => {
  const modules = Object.fromEntries(['homeDateNavigation', 'chartStats', 'helpers'].map(name =>
    [name, new URL('../src/utils/' + name + '.ts', import.meta.url).href]));
  const code = `
    import { homeWeek } from ${JSON.stringify(modules.homeDateNavigation)};
    import { buildChartStats } from ${JSON.stringify(modules.chartStats)};
    import { formatDateStr } from ${JSON.stringify(modules.helpers)};
    const day = formatDateStr(new Date('2026-11-16T01:00:00Z'));
    const charts = buildChartStats(${JSON.stringify(profile)}, 'Semana', day);
    console.log(JSON.stringify({day, chart: [charts.start, charts.end],
      dates: ['2026-03-08', '2026-11-01'].map(homeWeek)}));
  `;
  for (const [zone, day, chart] of [
    ['America/Argentina/Buenos_Aires', '2026-11-15', ['2026-11-09', '2026-11-15']],
    ['America/Los_Angeles', '2026-11-15', ['2026-11-09', '2026-11-15']],
    ['Europe/Madrid', '2026-11-16', ['2026-11-16', '2026-11-22']],
    ['Pacific/Kiritimati', '2026-11-16', ['2026-11-16', '2026-11-22']],
  ]) {
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', code], {
      env: { ...process.env, TZ: zone }, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(child.status, 0, zone + '\n' + child.stderr);
    const actual = JSON.parse(child.stdout);
    assert.equal(actual.day, day, zone);
    assert.deepEqual(actual.chart, chart, zone);
    assert.deepEqual(actual.dates.map(bounds), [['2026-03-02', '2026-03-08'], ['2026-10-26', '2026-11-01']]);
    assert.ok(actual.dates.every(dates => new Set(dates).size === 7));
  }
});
