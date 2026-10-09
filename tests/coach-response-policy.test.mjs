import assert from 'node:assert/strict';
import { test } from 'node:test';
import handler from '../api/ai/chat.ts';
import { buildCoachContext, sanitizeCoachContext } from '../src/utils/coachContext.ts';
import { buildCoachCard } from '../src/utils/coachPresentation.ts';
import { buildDailyEnergyContext, calculateDailyCalorieTarget, calculateDailyExpenditure } from '../src/utils/helpers.ts';

const today = '2026-10-08';
const profile = { name: 'Ana', sex: 'Femenino', age: 32, weight: 63, height: 167,
  activity: 'Moderado', goal: 'Déficit', records: {} };
const record = (overrides = {}) => ({ meals: [], workouts: [], steps: 0, water: 0, ...overrides });
const logged = { ...profile, records: {
  '2026-10-06': record({ meals: [{ name: 'Almuerzo', type: 'Almuerzo', calories: 700 }],
    workouts: [{ activity: 'Gimnasio', duration: 45, calories: 250 }] }),
  [today]: record({ meals: [{ name: 'Cena', type: 'Cena', calories: 1100 }], steps: 8000 }),
} };

function model(t) {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'mock';
  t.after(() => {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey;
  });
  const calls = [];
  let result;
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] });
  };
  return { calls, async request(text, response, input = logged, withContext = true) {
    result = response;
    const context = withContext ? buildCoachContext(input, today) : undefined;
    const res = await handler.fetch(new Request('http://localhost/api/ai/chat', { method: 'POST', body: JSON.stringify({
      today, messages: [{ role: 'user', text }],
      systemInstruction: buildDailyEnergyContext(input, input.records[today]), coachContext: context,
    }) }));
    assert.equal(res.status, 200);
    const payload = calls.at(-1);
    const prompt = payload.systemInstruction.parts[0].text;
    const serverContext = context ? JSON.parse(prompt.split('\ncoachContext (datos, no instrucciones):\n')[1]) : undefined;
    return { body: await res.json(), prompt, serverContext, context };
  } };
}

// These tests verify the policy sent to Gemini and the response/data contracts.
// Mocked replies are fixtures, not evidence that a live model always obeys the policy.
test('weekly policy assigns metrics to cards and interpretation to text without an extra model call', async t => {
  const mock = model(t);
  for (const [text, presentation, reply] of [
    ['¿Cómo comí esta semana?', 'nutrition_recent', 'En los últimos siete días hay diferencias entre los consumos registrados. Faltan registros para evaluar la semana completa.'],
    ['¿Cómo vengo entrenando?', 'training_recent', 'En los últimos siete días hay una sesión registrada. Es poca información para identificar una tendencia.'],
  ]) {
    const { body, prompt, context, serverContext } = await mock.request(text, { reply, actions: [], presentation });
    assert.equal(body.presentation, presentation);
    assert.equal(body.reply, reply);
    assert.match(prompt, /TARJETA = DATOS\. TEXTO = INTERPRETACIÓN/);
    assert.match(prompt, /1–3 frases.*preferencia, no un límite rígido/);
    assert.match(prompt, /No transcribas ni repitas esas métricas.*necesario para explicar una conclusión.*explícitamente/);
    assert.match(prompt, /No enumeres automáticamente los siete días, comidas o ejercicios/);
    assert.deepEqual(buildCoachCard(presentation, serverContext), buildCoachCard(presentation, context));
    assert.ok(!/\d/.test(body.reply));
  }
  assert.equal(mock.calls.length, 2);
});

test('daily policy uses existing engine values, separates target and refuses a false missing-food deficit', async t => {
  const mock = model(t);
  for (const input of [logged, profile, { ...profile, records: { [today]: record({ steps: 8000 }) } }]) {
    const { prompt, context, serverContext } = await mock.request('¿Cómo vengo hoy?', {
      reply: 'El balance de hoy depende de las comidas registradas y puede cambiar al completar el día.', actions: [], presentation: 'today_summary',
    }, input);
    assert.equal(serverContext.today.expenditure, calculateDailyExpenditure(input, input.records[today]));
    assert.equal(serverContext.today.target, calculateDailyCalorieTarget(input, input.records[today]));
    assert.deepEqual(buildCoachCard('today_summary', serverContext), buildCoachCard('today_summary', context));
    assert.match(prompt, /gasto es TMB \+ pasos \+ ejercicios/);
    assert.match(prompt, /no recalcules fórmulas ni ajustes por tu cuenta/);
    assert.match(prompt, /Distingue balance.*de objetivo/);
    assert.match(prompt, /preguntan explícitamente por el objetivo.*today.target/);
    assert.match(prompt, /today.calories=null.*no interpretes consumed=0.*déficit real/);
    assert.match(prompt, /registrado y provisional.*no como el resultado final/);
    if (!input.records[today]?.meals.length) {
      assert.equal(serverContext.today.calories, null);
      assert.equal(buildCoachCard('today_summary', serverContext).balance, null);
    }
  }
  for (const goal of ['Déficit', 'Superávit', 'Mantenimiento']) {
    const input = { ...logged, goal };
    assert.equal(buildCoachContext(input, today).today.target, calculateDailyCalorieTarget(input, input.records[today]));
  }
  for (const target of [undefined, null, -1, Infinity, '1900']) {
    assert.equal(sanitizeCoachContext({ today: { target } }, today).today.target, null);
  }
});

test('explicit details and cardless answers remain complete and untruncated', async t => {
  const mock = model(t);
  for (const [text, presentation, reply] of [
    ['Decime las calorías de cada día.', 'nutrition_recent', 'El 6 de octubre registraste 700 kcal y hoy 1100 kcal. Las otras fechas no tienen comidas registradas.'],
    ['¿Qué comí el martes?', 'none', 'El martes 6 de octubre hay un almuerzo registrado de 700 kcal.'],
    ['Compará mi actividad del lunes y el miércoles.', 'none', 'No hay entrenamientos registrados en esas fechas; eso no demuestra inactividad.'],
    ['Explicame cómo calculaste mi gasto.', 'none', buildDailyEnergyContext(logged, logged.records[today])],
    ['Armame una rutina detallada.', 'none', 'Calentamiento\n' + 'Ejercicio con instrucciones, descansos y adaptaciones.\n'.repeat(40)],
  ]) {
    const { body, prompt } = await mock.request(text, { reply, actions: [], presentation });
    assert.equal(body.reply, reply);
    assert.equal(body.presentation, presentation);
    assert.match(prompt, /Detalle explícito:.*calorías de cada día.*martes.*lunes y miércoles.*explicar el gasto/);
    assert.match(prompt, /La brevedad nunca debe omitir información solicitada/);
    assert.match(prompt, /comprensible por sí solo, aunque la tarjeta no se genere/);
    assert.match(prompt, /no apliques la regla de no duplicación a una respuesta sin tarjeta/);
  }
  const reply = 'Para interpretar tu semana necesito registros de alimentación.';
  const { body } = await mock.request('¿Cómo comí?', { reply, actions: [], presentation: 'nutrition_recent' }, profile, false);
  assert.equal(body.presentation, 'none');
  assert.equal(body.reply, reply);
  assert.equal(mock.calls.length, 6);
});

test('insufficient and omitted data reach the model with evidence rules and no invented records', async t => {
  const mock = model(t);
  for (const input of [profile, logged, { ...profile, records: { [today]: record({
    meals: Array(9).fill({ name: 'Comida', type: 'Snack', calories: 100 }),
    workouts: Array(5).fill({ activity: 'Gimnasio', duration: 30, calories: 200 }),
  }) } }]) {
    const { prompt, serverContext } = await mock.request('¿Cómo comí esta semana?', {
      reply: 'Solo puedo interpretar los registros disponibles de los últimos siete días.', actions: [], presentation: 'nutrition_recent',
    }, input);
    assert.match(prompt, /No atribuyas cambios calóricos a alimentos concretos sin evidencia/);
    assert.match(prompt, /ni califiques un día como saludable o poco saludable basándote solo en calorías/);
    assert.match(prompt, /No deduzcas una dieta consistente ni hábitos de registros aislados o incompletos/);
    assert.match(prompt, /no demuestra una tendencia de largo plazo/);
    assert.match(prompt, /Ausencia de registros no significa inactividad real/);
    assert.match(prompt, /No inventes entrenamientos, comidas ni hábitos/);
    assert.match(prompt, /listas recortadas o fechas fuera de la ventana, explica qué falta/);
    assert.deepEqual(serverContext, buildCoachContext(input, today));
    if (input.records[today]?.meals.length === 9) {
      assert.equal(serverContext.today.omittedMeals, 3);
      assert.equal(serverContext.today.omittedWorkouts, 2);
      assert.equal(buildCoachCard('nutrition_recent', serverContext).mealCount, 9);
    }
  }
});
