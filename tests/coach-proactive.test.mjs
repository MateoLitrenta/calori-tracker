import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildProactiveInsight } from '../src/utils/coachProactive.ts';
import { buildCoachContext, coachSuggestions, sanitizeCoachContext } from '../src/utils/coachContext.ts';
import { buildHabitInsights } from '../src/utils/habitInsights.ts';
import { coachDates } from '../src/utils/coachDates.ts';

const today = '2026-11-13';
const dates = coachDates(today);
const profile = { id: 'synthetic-profile', user_id: 'synthetic-account-a', name: 'Ana', sex: 'Femenino', age: 30,
  weight: 70, height: 170, goal: 'Mantenimiento', activity: 'Moderado', records: {} };
const record = (date, overrides = {}) => ({ dateStr: date, date: new Date(`${date}T12:00:00`), meals: [], workouts: [], steps: 0, water: 0, ...overrides });
const meal = (calories = 500) => ({ id: 'synthetic-meal', name: 'Comida sintética', type: 'Almuerzo', calories, time: '13:00' });
const workout = activity => ({ id: 'synthetic-session', activity, duration: 45, calories: 250 });
const context = (records = {}, overrides = {}) => buildCoachContext({ ...profile, ...overrides, records }, today);
const goal = (overrides = {}) => ({ id: '00000000-0000-0000-0000-000000000001', type: 'workout_sessions', target: 3,
  startDate: dates[0], endDate: today, stepThreshold: null, status: 'active', version: 1,
  createdAt: '2026-11-07T10:00:00Z', updatedAt: '2026-11-07T10:00:00Z', ...overrides });

test('opening actions identify the task for each context, including goal progress and reached goals', () => {
  const training = context({ [today]: record(today, { workouts: [workout('Fútbol'), workout('Gimnasio')] }) });
  const regularFood = context(Object.fromEntries(dates.map(date => [date, record(date, { meals: [meal()] })])));
  const changedCoverage = context(Object.fromEntries([...coachDates(today, 7, 7), today].map(date => [date, record(date, { meals: [meal()] })])));
  const steps = context({ [today]: record(today, { steps: 8500 }) });
  const cases = [
    [buildProactiveInsight(context()), 'Elegir mi próximo registro'],
    [buildProactiveInsight(context({ [today]: record(today, { water: 800 }) })), 'Elegir qué registrar ahora'],
    [buildProactiveInsight(context({ [today]: record(today, { meals: [meal(-1)] }) })), 'Revisar datos incompletos'],
    [buildProactiveInsight(context({ [today]: record(today, { meals: [meal()] }) })), 'Completar mi registro'],
    [buildProactiveInsight(regularFood), 'Revisar mi alimentación'],
    [buildProactiveInsight(changedCoverage), 'Entender mi regularidad'],
    [buildProactiveInsight(training), 'Organizar mis entrenamientos'],
    [buildProactiveInsight(context({ [today]: record(today, { workouts: [workout('Gimnasio')] }) })), 'Elegir mi próximo entrenamiento'],
    [buildProactiveInsight(steps), 'Explorar mis pasos'],
    [buildProactiveInsight(training, [goal()]), 'Ver avance de entrenamientos'],
    [buildProactiveInsight(steps, [goal({ type: 'step_days', stepThreshold: 8000 })]), 'Ver avance de pasos'],
    [buildProactiveInsight(training, [goal({ target: 2 })]), 'Sostener mi objetivo'],
  ];
  for (const [insight, action] of cases) {
    assert.equal(insight.actionLabel, action);
    assert.ok(insight.actionLabel.length <= 32);
    assert.doesNotMatch(insight.actionLabel, /Revisar juntos/);
    assert.ok(insight.prompt.endsWith('?'), 'The action opens a question, not an automatic write');
  }
});

test('loading and a new account have distinct useful states without fabricated tendencies', () => {
  assert.equal(buildProactiveInsight(null), null);
  assert.deepEqual(coachSuggestions(null), []);
  const value = buildProactiveInsight(context());
  assert.equal(value.kind, 'getting_started');
  assert.match(value.observation, /Todavía no hay.*últimos 7 días/);
  assert.match(value.limitation, /no puedo identificar tendencias/);
  assert.equal(value.suggestions.length, 3);
  assert.ok(!value.suggestions.some(text => /rutina de 30 minutos|cenar hoy/.test(text)));
  assert.deepEqual(value.metrics, { mealDays: 0, workoutCount: 0, stepDays: 0, otherRecords: null });
});

test('water or weight alone is acknowledged without inventing meals, workouts or progress', () => {
  const value = buildProactiveInsight(context({ [today]: record(today, { water: 800, weight: 70 }) }));
  assert.equal(value.kind, 'incomplete');
  assert.match(value.observation, /registros de agua o peso/);
  assert.equal(value.metrics.mealDays, 0);
  assert.equal(value.metrics.workoutCount, 0);
  assert.match(value.prompt, /registrar ahora/);
});

test('sparse food is registered coverage, not an intake trend or a complete-day assertion', () => {
  const records = Object.fromEntries(dates.slice(-2).map(date => [date, record(date, { meals: [meal()] })]));
  const value = buildProactiveInsight(context(records));
  assert.equal(value.kind, 'nutrition_logging');
  assert.match(value.observation, /2 de los últimos 7 días.*poco para hablar de una tendencia/);
  assert.equal(value.metrics.mealDays, 2);
  assert.equal(value.metrics.averageCalories, null);
  assert.match(value.limitation, /puede estar incompleto/);
  assert.match(value.suggestions[0], /2 de 7 días/);
});

test('sufficient and variable food logging retain official metrics and both denominators', () => {
  const previousDates = coachDates(today, 7, 7);
  const records = Object.fromEntries([...previousDates.slice(0, 4), ...dates].map((date, index) => [date,
    record(date, { meals: [meal(400 + index * 10)] })]));
  const source = context(records);
  const value = buildProactiveInsight(source);
  const official = buildHabitInsights(source.historyDays, today);
  assert.equal(value.metrics.averageCalories, official.current.averageCalories);
  assert.equal(value.metrics.mealDays, 7);
  assert.equal(value.metrics.previousMealDays, 4);
  assert.match(value.observation, /7 de los últimos 7 días, frente a 4 de 7/);
  assert.match(value.limitation, /Registrar menos no significa comer menos/);
  assert.ok(!/comiste mejor|comiste menos|exceso|déficit|bajaste de peso/.test(value.observation));
  const lowerCoverage = Object.fromEntries(previousDates.map(date => [date, record(date, { meals: [meal()] })]));
  lowerCoverage[today] = record(today, { meals: [meal()] });
  assert.match(buildProactiveInsight(context(lowerCoverage)).observation, /1 de los últimos 7 días, frente a 7 de 7/);
});

test('football and gym stay literal recorded activities, never inferred recurrence or recovery', () => {
  const value = buildProactiveInsight(context({
    [dates[2]]: record(dates[2], { workouts: [workout('Fútbol')] }),
    [today]: record(today, { workouts: [workout('Gimnasio')] }),
  }));
  assert.equal(value.kind, 'training');
  assert.equal(value.metrics.workoutCount, 2);
  assert.equal(value.metrics.workoutDays, 2);
  assert.match(value.evidence.join(' '), /Fútbol · Gimnasio/);
  assert.match(value.prompt, /Fútbol y Gimnasio/);
  assert.match(value.limitation, /ni permiten evaluar tu recuperación/);
  assert.ok(!/siempre|cada semana|lunes|fatiga|descansá|sobrecarga|running/i.test(JSON.stringify(value)));
});

test('conflicting historical activity labels cannot replace the recent recorded workout names', () => {
  const source = context({ [today]: record(today, { workouts: [workout('Fútbol')] }) });
  const inconsistentLabels = sanitizeCoachContext({ ...source,
    historyDays: source.historyDays.map(day => day.date === today ? { ...day, activities: ['Natación'] } : day) }, today);
  const value = buildProactiveInsight(inconsistentLabels);
  assert.match(value.evidence.join(' '), /Fútbol/);
  assert.ok(!JSON.stringify(value).includes('Natación'));
});

test('steps use observed-day denominator and do not become training or unknown zero movement', () => {
  const makeSteps = count => context(Object.fromEntries(dates.slice(-count).map(date => [date, record(date, { steps: 7000 })])));
  const sparse = buildProactiveInsight(makeSteps(3));
  const sufficient = buildProactiveInsight(makeSteps(4));
  assert.equal(sparse.kind, 'steps');
  assert.equal(sparse.metrics.averageSteps, null);
  assert.equal(sufficient.metrics.averageSteps, 7000);
  assert.match(sufficient.evidence.join(' '), /7000 pasos en los días con registros/);
  assert.match(sufficient.limitation, /no que no te moviste/);
  assert.match(sufficient.limitation, /no equivalen a entrenamientos/);
  assert.notEqual(sparse.id, sufficient.id);
});

test('only valid confirmed active goals in the current period drive progress', () => {
  const source = context({ [today]: record(today, { workouts: [workout('Fútbol')] }) });
  const value = buildProactiveInsight(source, [goal()]);
  assert.equal(value.kind, 'goal');
  assert.equal(value.goalId, goal().id);
  assert.equal(value.metrics.registered, 1);
  assert.equal(value.metrics.target, 3);
  assert.equal(value.metrics.remainingToRegister, 2);
  assert.match(value.limitation, /no demuestran incumplimiento/);
  for (const invalid of [goal({ status: 'cancelled' }), goal({ startDate: '2026-11-14', endDate: '2026-11-20' }),
    goal({ endDate: '2026-11-12' }), goal({ target: 100 }), { type: 'workout_sessions', target: 3 }]) {
    assert.notEqual(buildProactiveInsight(source, [invalid]).kind, 'goal');
  }
  assert.notEqual(value.id, buildProactiveInsight(source, [goal({ target: 4, version: 2 })]).id);
  const steps = buildProactiveInsight(context({ [today]: record(today, { steps: 8000 }) }),
    [goal({ type: 'step_days', target: 3, stepThreshold: 8000 })]);
  assert.equal(steps.metrics.registered, 1);
  assert.match(steps.evidence.join(' '), /8000 pasos por día/);
});

test('official goal history can override caller records and missing goal history cannot assert progress', () => {
  const source = context({ [today]: record(today, { workouts: [workout('Fútbol')] }) });
  const authoritative = source.historyDays.map(day => ({ ...day, workoutCount: 0, activities: [] }));
  const verified = buildProactiveInsight(source, [goal()], authoritative);
  assert.equal(verified.metrics.registered, 0);
  assert.notEqual(verified.id, buildProactiveInsight(source, [goal()]).id);
  assert.notEqual(buildProactiveInsight(source, [goal()], []).kind, 'goal');
});

test('inconsistent food and steps never yield misleading averages, activities or trends', () => {
  for (const source of [
    context({ [today]: record(today, { meals: [meal(Number.NaN)] }) }),
    context({ [today]: record(today, { meals: [meal(-10), meal(100)] }) }),
    context({ [today]: record(today, { steps: 1.5 }) }),
    sanitizeCoachContext({ recentDays: [{ date: today, calories: 800, meals: [] }] }, today),
    sanitizeCoachContext({ recentDays: [{ date: today, calories: 800, meals: [meal(100)] }] }, today),
  ]) {
    const value = buildProactiveInsight(source);
    assert.equal(value.kind, 'data_quality');
    assert.deepEqual(value.metrics, { dataQuality: 'inconsistent' });
    assert.ok(!/promedio|kcal|800|1\.5/.test(value.observation));
  }
});

test('observations are stable after server sanitization, refresh with relevant data, and do not leak between accounts', () => {
  const first = context({ [today]: record(today, { workouts: [workout('Fútbol')] }) });
  const second = context(Object.fromEntries(dates.map(date => [date, record(date, { meals: [meal()] })])),
    { user_id: 'synthetic-account-b', name: 'Bruno', goal: 'Superávit' });
  const a = buildProactiveInsight(first);
  const b = buildProactiveInsight(second);
  assert.deepEqual(buildProactiveInsight(sanitizeCoachContext(first, today)), a);
  assert.equal(a.id, buildProactiveInsight(first).id);
  assert.notEqual(a.id, b.id);
  assert.ok(!JSON.stringify(b).includes('Fútbol'));
  assert.ok(!JSON.stringify(a).includes('superávit'));
  assert.ok(JSON.stringify(b.suggestions).includes('superávit'));
  assert.notDeepEqual(a.suggestions, b.suggestions);
  assert.equal(a.kind, 'training');
  assert.equal(b.kind, 'nutrition_logging');
  const changed = context({ [today]: record(today, { workouts: [workout('Fútbol'), workout('Gimnasio')] }) });
  assert.notEqual(a.id, buildProactiveInsight(changed).id);
  assert.notDeepEqual(coachSuggestions(first), coachSuggestions(changed));
});
