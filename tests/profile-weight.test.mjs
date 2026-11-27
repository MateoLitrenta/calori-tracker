import assert from 'node:assert/strict';
import { test } from 'node:test';
import { latestWeightMeasurement } from '../src/utils/profileWeight.ts';

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
