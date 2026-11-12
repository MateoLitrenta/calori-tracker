import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findRecordedCoachAction, parseRecordedCoachActions } from '../src/lib/coachActionReview.ts';

const date = '2026-11-08';
const mealId = '00000000-0000-4000-8000-000000000001';
const action = { type: 'add_meal', payload: { dateStr: date, name: 'Almuerzo', type: 'Almuerzo', calories: 900, time: '13:00' } };
const meal = { id: mealId, name: 'Almuerzo', type: 'Almuerzo', calories: 900, time: '13:00' };
const receipt = { type: action.type, dateStr: date, entryId: mealId };
const records = { [date]: { dateStr: date, meals: [meal], workouts: [], steps: 0, water: 0 } };

test('repeat review requires confirmed provenance and the unchanged canonical entry ID, never just similar content', () => {
  assert.deepEqual(findRecordedCoachAction(action, records, [receipt]), receipt);
  assert.equal(findRecordedCoachAction(action, records, []), undefined);
  assert.equal(findRecordedCoachAction(action, { [date]: { ...records[date], meals: [{ ...meal, id: 'another-id' }] } }, [receipt]), undefined);
  assert.equal(findRecordedCoachAction(action, { [date]: { ...records[date], meals: [] } }, [receipt]), undefined);
  assert.equal(findRecordedCoachAction(action, records, [{ ...receipt, dateStr: '2026-11-07' }]), undefined);
});

test('similar but distinct meals, edits and photographs remain new proposals', () => {
  for (const change of [{ calories: 901 }, { name: 'Almuerzo nuevo' }, { time: '13:01' }, { details: 'Otra porción' }, { type: 'Cena' }]) {
    assert.equal(findRecordedCoachAction({ ...action, payload: { ...action.payload, ...change } }, records, [receipt]), undefined);
  }
  assert.equal(findRecordedCoachAction(action, { [date]: { ...records[date], meals: [{ ...meal, photo_path: 'own/photo.jpg' }] } }, [receipt]), undefined);
});

test('workout repeat review keeps duration, distance, pace and edited tags distinct', () => {
  const workoutId = '00000000-0000-4000-8000-000000000002';
  const proposed = { type: 'add_workout', payload: { dateStr: date, activity: 'Caminata', duration: 30, calories: 150, time: '17:00', distance: 2, pace: '15:00' } };
  const workout = { id: workoutId, ...proposed.payload, muscles: [] };
  const confirmed = { type: proposed.type, dateStr: date, entryId: workoutId };
  const days = { [date]: { ...records[date], workouts: [workout] } };
  assert.deepEqual(findRecordedCoachAction(proposed, days, [confirmed]), confirmed);
  for (const change of [{ duration: 31 }, { distance: 3 }, { pace: '10:00' }]) {
    assert.equal(findRecordedCoachAction({ ...proposed, payload: { ...proposed.payload, ...change } }, days, [confirmed]), undefined);
  }
  assert.equal(findRecordedCoachAction(proposed, { [date]: { ...days[date], workouts: [{ ...workout, muscles: ['Piernas'] }] } }, [confirmed]), undefined);
  const noOptionalMetrics = { ...proposed, payload: { ...proposed.payload, distance: undefined, pace: undefined } };
  const canonicalNulls = { [date]: { ...days[date], workouts: [{ ...workout, distance: null, pace: null, details: null }] } };
  assert.deepEqual(findRecordedCoachAction(noOptionalMetrics, canonicalNulls, [confirmed]), confirmed);
});

test('stored confirmation metadata is allowlisted and malformed receipts cannot create provenance', () => {
  assert.deepEqual(parseRecordedCoachActions([{ ...receipt, ignored: 'not retained' }, null, { ...receipt, type: 'set_steps' }, { ...receipt, entryId: 'invalid' }]), [receipt]);
  assert.equal(parseRecordedCoachActions('invalid'), undefined);
  assert.equal(parseRecordedCoachActions([]), undefined);
});
