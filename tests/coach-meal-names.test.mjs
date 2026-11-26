import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareCoachMealAction } from '../src/lib/coachMealNames.ts';
import apiHandler from '../api/ai/chat.ts';
import { authorizedAIHandler } from './fixtures/ai-auth-mock.mjs';

const today = '2026-11-26';
const meal = (name, details, overrides = {}) => ({ type: 'add_meal', estimated: true,
  payload: { dateStr: today, name, type: 'Almuerzo', calories: 850, time: '13:30', details, ...overrides } });

test('generic meal names recover a recognizable description from their own action without mutation', () => {
  const description = 'Milanesa con papas y cerveza\nDos porciones, preparada al horno.';
  for (const name of ['Comida', ' ALMUERZO ', 'Cena', 'Merienda registrada', 'Comida del Coach', 'Estimación de comida']) {
    const action = meal(name, description);
    const snapshot = structuredClone(action);
    const prepared = prepareCoachMealAction(action);
    assert.equal(prepared.payload.name, 'Milanesa con papas y cerveza Dos porciones, preparada al horno.');
    assert.equal(prepared.payload.details, description);
    assert.deepEqual(prepared, { ...snapshot, payload: { ...snapshot.payload, name: prepared.payload.name } });
    assert.deepEqual(action, snapshot);
    assert.notEqual(prepared, action);
    assert.notEqual(prepared.payload, action.payload);
  }
});

test('separate meal actions keep their own names and descriptions, including a missing descriptor', () => {
  const actions = [meal('Desayuno', 'Comida: Café con dos tostadas', { type: 'Desayuno', time: '08:00' }),
    meal('Almuerzo', 'Milanesa con papas y cerveza'), meal('Cena', 'Sin azúcar', { type: 'Cena', time: '21:00' })];
  const prepared = actions.map(prepareCoachMealAction);
  assert.deepEqual(prepared.map(action => action.payload.name), ['Café con dos tostadas', 'Milanesa con papas y cerveza', '']);
  assert.deepEqual(prepared.map(action => action.payload.details), actions.map(action => action.payload.details));
  assert.deepEqual(prepared.map(action => action.payload.time), ['08:00', '13:30', '21:00']);
  assert.equal(prepared.length, 3);
  for (const description of ['150 g de pollo al horno', '250 ml de cerveza', 'Una porción de pizza', '2 tostadas con queso']) {
    assert.equal(prepareCoachMealAction(meal('Comida', description)).payload.name, description);
  }
});

test('ambiguous notes and metadata leave an unnamed draft instead of guessing a food', () => {
  for (const details of [undefined, '', '  ', 'Porción mediana', 'Una porción mediana', '2 porciones',
    'Sin azúcar', 'Con leche', 'Estimación de 500 kcal', 'Aproximadamente 500 kcal',
    '500 kcal', '200 g', '13:30', 'A las 13:30', '2026-11-26', '26/11/2026', 'Hoy',
    'Comida registrada', 'Descripción: Sin azúcar', 'Supuesto: una porción normal']) {
    const action = meal('Comida', details);
    const prepared = prepareCoachMealAction(action);
    assert.equal(prepared.payload.name, '', String(details));
    assert.equal(prepared.payload.details, details);
    assert.equal(prepared.payload.calories, action.payload.calories);
  }
});

test('preparation and assumption notes do not become dish names while named dishes retain their preparation', () => {
  for (const details of ['Al horno, sin aceite', 'Hecho en casa', 'Se asumió una porción mediana',
    'Preparada a la plancha', 'A la parrilla', 'Al vapor, sin sal', 'Se estimó un plato mediano',
    'Descripción: Hecho en casa']) {
    const prepared = prepareCoachMealAction(meal('Comida', details));
    assert.equal(prepared.payload.name, '', details);
    assert.equal(prepared.payload.details, details);
  }
  for (const details of ['Milanesa al horno', 'Pollo a la plancha', '150 g de pollo al horno',
    'Una porción de pizza hecha en casa', '2 tostadas preparadas con queso']) {
    const prepared = prepareCoachMealAction(meal('Comida', details));
    assert.equal(prepared.payload.name, details);
    assert.equal(prepared.payload.details, details);
  }
});

test('concrete names, including manual wording and long names, remain exactly as provided', () => {
  for (const name of ['Milanesa con papas y cerveza', 'Cena de cumpleaños con sushi',
    'Comida mexicana', 'Mi sándwich especial', '  Tostadas con queso  ', 'Pizza '.repeat(30)]) {
    const action = meal(name, 'Una descripción diferente que no debe reemplazar mi nombre');
    assert.equal(prepareCoachMealAction(action), action);
    assert.equal(action.payload.name, name);
  }
  const workout = { type: 'add_workout', estimated: true,
    payload: { activity: 'Gimnasio', name: 'Comida', details: 'Correr', dateStr: today } };
  assert.equal(prepareCoachMealAction(workout), workout);
});

test('long fallback descriptions shorten at a word boundary while retaining the full details', () => {
  const details = 'Milanesa napolitana con papas al horno, ensalada de tomate, una cerveza y una porción de ensalada de frutas de postre. Cantidades descriptas por la persona.';
  const prepared = prepareCoachMealAction(meal('Comida', details));
  assert.ok(prepared.payload.name.length <= 96);
  assert.ok(prepared.payload.name.endsWith('…'));
  const prefix = prepared.payload.name.slice(0, -1);
  assert.ok(details.startsWith(prefix + ' '));
  assert.equal(prepared.payload.details, details);
  assert.equal(prepareCoachMealAction(meal('Comida', 'x'.repeat(150))).payload.name, '');
});

test('the real API sends the naming contract and preserves separate model actions with one request', async t => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  const calls = [];
  const actions = [meal('Milanesa con papas y cerveza', 'Una milanesa al horno, papas y una cerveza.'),
    meal('Café con tostadas', 'Café sin azúcar y dos tostadas con queso.', { type: 'Merienda', time: '17:00' })];
  process.env.GEMINI_API_KEY = 'mock';
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      reply: 'Preparé estas comidas para que las revises.', actions, presentation: 'none',
    }) }] } }] });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });
  const handler = authorizedAIHandler(apiHandler);
  const response = await handler.fetch(new Request('http://localhost/api/ai/chat', { method: 'POST', body: JSON.stringify({
    today, messages: [{ role: 'user', text: 'A las 13:30 comí una milanesa al horno con papas y una cerveza; a las 17 tomé café sin azúcar y comí dos tostadas con queso.' }],
  }) }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.actions, actions);
  assert.equal(calls.length, 1);
  const prompt = calls[0].systemInstruction.parts[0].text;
  assert.match(prompt, /name identifica los alimentos y bebidas concretos de ESA comida/);
  assert.match(prompt, /La categoría va en type y la hora en time/);
  assert.match(prompt, /Conservá en details la descripción completa, cantidades, preparación y notas explícitas/);
  assert.match(prompt, /No inventes ingredientes, marcas ni cantidades/);
  assert.match(prompt, /No dividas los ingredientes de una misma comida en acciones separadas/);
  assert.match(prompt, /cada acción conserva su propio nombre y descripción/);
});
