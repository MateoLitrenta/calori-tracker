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

test('the existing week policies remain explicit at month, year and leap boundaries', () => {
  const examples = [
    ['2026-11-17', ['2026-11-15', '2026-11-21'], ['2026-11-16', '2026-11-22']],
    ['2026-11-01', ['2026-11-01', '2026-11-07'], ['2026-10-26', '2026-11-01']],
    ['2027-01-01', ['2026-12-27', '2027-01-02'], ['2026-12-28', '2027-01-03']],
    ['2024-02-29', ['2024-02-25', '2024-03-02'], ['2024-02-26', '2024-03-03']],
  ];
  for (const [day, sunday, monday] of examples) {
    const journal = homeWeek(day);
    const history = buildHistoryPeriods(new Date(day + 'T12:00:00')).week.at(-1).dates;
    const charts = buildChartStats(profile, 'Semana', day);
    assert.deepEqual(bounds(journal), sunday);
    assert.deepEqual(history, journal);
    assert.deepEqual([charts.start, charts.end], monday);
    assert.equal(charts.buckets.length, 7);
    assert.equal(new Set(journal).size, 7);
  }
  assert.equal(moveHomeWeek('2026-12-30', 1, '2027-01-10'), '2027-01-06');
});

test('the unapproved Monday proposal changes the history sample even with the same energy formula', () => {
  const records = {
    '2026-11-15': record(2500),
    '2026-11-16': record(2000),
    '2026-11-17': record(null, 1000),
    '2026-11-22': record(2800),
  };
  const frozen = structuredClone(records);
  const sunday = homeWeek('2026-11-17');
  // Counterfactual inputs only. This does not switch a product policy.
  const monday = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19',
    '2026-11-20', '2026-11-21', '2026-11-22'];
  assert.equal(calculateBMR(profile), 1618);
  const original = aggregateEnergy(records, sunday, profile, '2026-11-17');
  const proposed = aggregateEnergy(records, monday, profile, '2026-11-17');
  assert.deepEqual([original.days, original.consumed, original.expenditure, original.averageBalance],
    [3, 4500, 4894, -131]);
  assert.deepEqual([proposed.days, proposed.consumed, proposed.expenditure, proposed.averageBalance],
    [2, 2000, 3276, -638]);
  assert.equal(aggregateEnergy(records, sunday, profile, '2026-11-22').averageBalance, -131);
  assert.equal(aggregateEnergy(records, monday, profile, '2026-11-22').averageBalance, -31);
  assert.deepEqual(records, frozen);
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
    assert.deepEqual(actual.dates.map(bounds), [['2026-03-08', '2026-03-14'], ['2026-11-01', '2026-11-07']]);
    assert.ok(actual.dates.every(dates => new Set(dates).size === 7));
  }
});
