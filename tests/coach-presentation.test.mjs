import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCoachContext } from '../src/utils/coachContext.ts';
import { buildCoachCard, parseCoachCard } from '../src/utils/coachPresentation.ts';

const today = '2026-10-08';
const profile = { name: 'Ana', sex: 'Femenino', age: 32, weight: 63, height: 167,
  activity: 'Moderado', goal: 'Mantenimiento', records: {} };
const record = (overrides = {}) => ({ meals: [], workouts: [], steps: 0, water: 0, ...overrides });
const meal = { name: 'Comida', type: 'Almuerzo', calories: 100 };
const workout = name => ({ activity: name, duration: 30, calories: 200 });
const context = records => buildCoachContext({ ...profile, records }, today);

test('today snapshot uses recorded consumption, expenditure and full omission counts', () => {
  const input = context({ [today]: record({ meals: Array(8).fill(meal), workouts: Array(5).fill(workout('Gimnasio')), steps: 8500 }) });
  const card = buildCoachCard('today_summary', input);
  assert.equal(card.consumed, 800);
  assert.equal(card.expenditure, input.today.expenditure);
  assert.equal(card.balance, 800 - input.today.expenditure);
  assert.equal(card.mealCount, 8);
  assert.equal(card.workoutCount, 5);
  assert.equal(card.steps, 8500);
  assert.deepEqual(parseCoachCard(card), card);
});

test('missing meals never become zero consumption or maintenance, and zero steps mean no record', () => {
  for (const data of [{}, { [today]: record({ workouts: [workout('Fútbol')] }) }]) {
    const input = context(data);
    const card = buildCoachCard('today_summary', input);
    assert.equal(input.today.consumed, 0);
    assert.equal(card.consumed, null);
    assert.equal(card.balance, null);
    assert.equal(card.steps, null);
    assert.equal(card.expenditure, input.today.expenditure);
  }
  assert.equal(buildCoachCard('none', context({})), undefined);
  assert.equal(buildCoachCard('today_summary', null), undefined);
});

test('recent nutrition averages only days with meals and counts omitted meals', () => {
  const card = buildCoachCard('nutrition_recent', context({
    '2026-10-02': record({ meals: Array(9).fill(meal) }),
    [today]: record({ meals: [{ ...meal, calories: 1500 }] }),
    '2026-10-07': record({ steps: 9000 }),
  }));
  assert.equal(card.startDate, '2026-10-02');
  assert.equal(card.endDate, today);
  assert.equal(card.mealDays, 2);
  assert.equal(card.averageCalories, 1200);
  assert.equal(card.mealCount, 10);
  assert.deepEqual(parseCoachCard(card), card);
});

test('empty nutrition window keeps its average null', () => {
  const card = buildCoachCard('nutrition_recent', context({}));
  assert.equal(card.mealDays, 0);
  assert.equal(card.mealCount, 0);
  assert.equal(card.averageCalories, null);
});

test('recent training includes omitted workouts, averages registered step days and bounds unique activity names', () => {
  const card = buildCoachCard('training_recent', context({
    '2026-10-03': record({ workouts: Array(5).fill(workout('Gimnasio')), steps: 8000 }),
    '2026-10-05': record({ workouts: [workout('Correr'), workout('Natación')] }),
    [today]: record({ workouts: [workout('Fútbol'), workout('fútbol'), workout('Gimnasio')], steps: 10000 }),
  }));
  assert.equal(card.workoutDays, 3);
  assert.equal(card.workoutCount, 10);
  assert.equal(card.stepDays, 2);
  assert.equal(card.averageSteps, 9000);
  assert.deepEqual(card.recentActivities, ['Fútbol', 'Gimnasio', 'Correr']);
  assert.equal(Object.hasOwn(card, 'totalDuration'), false);
  assert.deepEqual(parseCoachCard(card), card);
});

test('omitted-only workouts still count as a training day and empty training keeps steps null', () => {
  const input = context({});
  input.recentDays[0].omittedWorkouts = 2;
  const card = buildCoachCard('training_recent', input);
  assert.equal(card.workoutDays, 1);
  assert.equal(card.workoutCount, 2);
  assert.deepEqual(card.recentActivities, []);
  assert.equal(card.stepDays, 0);
  assert.equal(card.averageSteps, null);
  const empty = buildCoachCard('training_recent', context({}));
  assert.equal(empty.workoutCount, 0);
  assert.deepEqual(empty.recentActivities, []);
});

test('snapshots stay independent of later profile or context changes', () => {
  const input = context({ [today]: record({ meals: [meal], workouts: [workout('Fútbol')] }) });
  const card = buildCoachCard('training_recent', input);
  const original = JSON.stringify(card);
  input.recentDays[6].workouts[0].name = 'Otro';
  input.today.consumed = 99999;
  assert.equal(JSON.stringify(card), original);
});

test('snapshot parser rejects malformed data and whitelists valid snapshots', () => {
  const card = buildCoachCard('today_summary', context({ [today]: record({ meals: [meal] }) }));
  for (const bad of [null, [], {}, { ...card, type: 'recipe' }, { ...card, date: '2026-02-30' },
    { ...card, consumed: -1 }, { ...card, expenditure: Infinity }, { ...card, balance: NaN },
    { ...card, mealCount: 0.5 }, { ...card, steps: -1 }, { ...card, consumed: null }]) {
    assert.equal(parseCoachCard(bad), undefined);
  }
  assert.deepEqual(parseCoachCard({ ...card, email: 'discarded', extra: {} }), card);
  const nutrition = buildCoachCard('nutrition_recent', context({}));
  assert.equal(parseCoachCard({ ...nutrition, mealDays: 8 }), undefined);
  assert.equal(parseCoachCard({ ...nutrition, averageCalories: 0 }), undefined);
  const training = buildCoachCard('training_recent', context({}));
  for (const bad of [{ ...training, startDate: 'yesterday' }, { ...training, stepDays: 9 },
    { ...training, recentActivities: ['a', 'b', 'c', 'd'] }, { ...training, recentActivities: ['x'.repeat(101)] }]) {
    assert.equal(parseCoachCard(bad), undefined);
  }
});
