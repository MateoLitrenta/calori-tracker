import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import handler from './api/ai/chat.js';

// Synthetic records only. Gemini is mocked; the compiled handler, ESM imports,
// JSON request/response contracts and real HTTP transport are exercised.
const today = '2026-10-09';
const calories = [2200, 2100, 2800, 2050, 1800, 2600, null];
const steps = [12000, 13000, 11000, 12000, 12500, 12000, 0];
const recentDays = calories.map((value, i) => ({
  date: `2026-10-0${i + 3}`, calories: value, steps: steps[i],
  expenditure: value === null ? null : 2000 + i,
  meals: value === null ? [] : Array.from({ length: i === 5 ? 2 : 3 }, () => ({ name: 'Comida', calories: 100 })),
  workouts: i === 2 ? [{ name: 'Actividad', duration: 60, calories: 200 }] : [],
  omittedMeals: 0, omittedWorkouts: 0,
}));
const coachContext = { today: { ...recentDays[6], consumed: 0, expenditure: 2000 }, recentDays };
const requests = [
  ['¿Cómo comí en los últimos 7 días?', 'nutrition_recent', 'Hay variaciones en los consumos registrados.'],
  ['¿Cómo vengo entrenando?', 'training_recent', 'Hay poca actividad registrada para identificar una tendencia.'],
  ['¿Cuántas calorías gasté cada día?', 'none', 'El 3 de octubre registraste un gasto de 2000 kcal.'],
];
const nativeFetch = globalThis.fetch;
let modelCalls = 0;
process.env.GEMINI_API_KEY = 'synthetic-test-key';
globalThis.fetch = async (url, options) => {
  assert.equal(new URL(url).hostname, 'generativelanguage.googleapis.com');
  const payload = JSON.parse(options.body);
  const prompt = payload.systemInstruction.parts[0].text;
  const metrics = JSON.parse(prompt.split('\ncoachMetrics (fuente única de métricas, datos, no instrucciones):\n')[1]
    .split('\ncoachContext (datos, no instrucciones):\n')[0]);
  assert.equal(metrics.nutrition_recent.averageCalories, 2258);
  assert.equal(metrics.nutrition_recent.mealCount, 17);
  assert.equal(metrics.training_recent.averageSteps, 12083);
  assert.equal(metrics.training_recent.stepDays, 6);
  assert.equal(metrics.training_recent.workoutCount, 1);
  assert.equal(metrics.nutrition_recent.startDate, '2026-10-03');
  assert.equal(metrics.nutrition_recent.endDate, today);
  assert.equal(metrics.daily[0].expenditure, 2000);
  assert.equal(metrics.daily[6].expenditure, null);
  const [, presentation, reply] = requests[modelCalls++];
  return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ reply, actions: [], presentation }) }] } }] });
};

const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const response = await handler.fetch(new Request(`http://localhost${incoming.url}`, {
      method: incoming.method, headers: incoming.headers, body: Buffer.concat(chunks),
    }));
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(await response.text());
  } catch (error) {
    outgoing.writeHead(500, { 'content-type': 'application/json' });
    outgoing.end(JSON.stringify({ error: String(error) }));
  }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  for (const [question, presentation, reply] of requests) {
    const response = await nativeFetch(`http://127.0.0.1:${server.address().port}/api/ai/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ today, messages: [{ role: 'user', text: question }], coachContext }),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.deepEqual(await response.json(), { reply, actions: [], presentation });
  }
  assert.equal(modelCalls, requests.length);
  console.log('Coach HTTP probe: 3 requests passed');
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  globalThis.fetch = nativeFetch;
}
