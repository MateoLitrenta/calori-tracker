import assert from 'node:assert/strict';
import { test } from 'node:test';
import { latestWeightMeasurement } from '../src/utils/profileWeight.ts';
import { createWeightResolver, formatDateStr, resolveWeight } from '../src/utils/helpers.ts';

const today = '2026-11-27';
const record = (dateStr, weight) => ({ dateStr, weight });

test('the latest weight is selected by the stored local calendar date across the entire history', () => {
  const records = {
    '2026-11-26': record('2026-11-26', 80),
    '2026-11-21': { ...record('2026-11-21', 85), date: new Date('2026-11-27T12:00:00Z') },
    '2022-11-18': record('2022-11-18', 74),
  };
  assert.deepEqual(latestWeightMeasurement(records, today), record('2026-11-26', 80));
  assert.deepEqual(latestWeightMeasurement({ old: records['2022-11-18'] }, today), record('2022-11-18', 74));
});

test('future dates, impossible dates and non-positive or non-finite weights do not replace an actual measurement', () => {
  const records = {
    future: record('2026-11-28', 100),
    impossible: record('2026-02-30', 90),
    malformed: record('2026-11-1', 85),
    invalidType: record(new Date('2026-11-26T12:00:00'), 91),
    missing: null,
    empty: record('2026-11-26', 0),
    negative: record('2026-11-25', -1),
    infinite: record('2026-11-24', Infinity),
    string: record('2026-11-23', '75'),
    actual: record('2026-11-20', 78.4),
  };
  assert.deepEqual(latestWeightMeasurement(records, today), records.actual);
  delete records.actual;
  assert.equal(latestWeightMeasurement(records, today), undefined);
});

test('a measurement on the current day can win and can be edited or removed', () => {
  const earlier = record('2026-11-26', 80);
  const current = record(today, 81);
  assert.deepEqual(latestWeightMeasurement({ earlier, current }, today), current);
  current.weight = 79;
  assert.deepEqual(latestWeightMeasurement({ earlier, current }, today), current);
  assert.deepEqual(latestWeightMeasurement({ earlier }, today), earlier);
  assert.equal(latestWeightMeasurement({}, today), undefined);
});

test('effective weight falls back to the account baseline and follows confirmed measurement snapshots', () => {
  const olderDate = '2026-11-19', measuredDate = '2026-11-24';
  const before = { weight: 77, records: { [olderDate]: record(olderDate, 79) } };
  const withMeasurement = (date, weight) => ({
    ...before, records: { ...before.records, [date]: record(date, weight) },
  });
  const saved = withMeasurement(measuredDate, 80);
  const edited = withMeasurement(measuredDate, 81);
  const removed = withMeasurement(measuredDate, null);
  const weightAt = createWeightResolver(saved);

  assert.equal(weightAt('2026-11-18'), 77);
  assert.equal(weightAt(olderDate), 79);
  assert.equal(weightAt('2026-11-23'), 79);
  assert.equal(weightAt(measuredDate), 80);
  assert.equal(weightAt(today), 80);
  assert.equal(resolveWeight(edited, '2026-11-23'), 79);
  assert.equal(resolveWeight(edited, today), 81);
  assert.equal(resolveWeight(removed, today), 79);
  assert.equal(resolveWeight({ ...before, records: {} }, today), 77);
  assert.equal(createWeightResolver(before, saved.records)(today), 80);
  assert.equal(resolveWeight(structuredClone(edited), today), 81);
  assert.equal(resolveWeight({ weight: 66, records: {} }, today), 66);

  const rebased = createWeightResolver({ ...saved, weight: 75 });
  assert.equal(rebased('2026-11-18'), 75);
  assert.equal(rebased(olderDate), 79);
  assert.equal(rebased(today), 80);
});

test('without a requested date, effective weight uses the local day and ignores a future measurement', () => {
  const localToday = formatDateStr(new Date());
  const future = '9999-12-31';
  const profile = { weight: 77, records: {
    [localToday]: record(localToday, 80),
    [future]: record(future, 88),
  } };
  assert.equal(resolveWeight(profile), 80);
});
