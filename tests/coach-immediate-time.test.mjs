import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import handler from '../api/ai/chat.ts';

const today = '2026-10-08';
const user = (text, localTime = '10:15') => ({ role: 'user', text, localTime });
const bot = text => ({ role: 'bot', text });
const meal = (overrides = {}) => ({ type: 'add_meal', estimated: true,
  payload: { dateStr: today, name: 'Café negro solo', type: 'Snack', calories: 3, details: '', ...overrides } });
const proposal = action => ({ reply: 'Te propongo este registro.', actions: [action], presentation: 'today_summary' });

function mockModel(t, results) {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.GEMINI_API_KEY;
  const calls = [];
  process.env.GEMINI_API_KEY = 'mock';
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    const result = results[Math.min(calls.length - 1, results.length - 1)];
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] });
  };
  t.after(() => {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey;
  });
  return { calls, async request(messages) {
    const response = await handler.fetch(new Request('http://localhost/api/ai/chat', {
      method: 'POST', body: JSON.stringify({ today, messages }),
    }));
    return { status: response.status, body: await response.json() };
  } };
}

test('accented and unaccented immediate markers attach message time and fill a missing/invalid time', async t => {
  const model = mockModel(t, [proposal(meal({ time: '25:99' }))]);
  for (const text of ['Recién me tomé un café', 'recien me tome un cafe', 'Ahora me tomé un café',
    'justo ahora me tome un cafe', 'acabo de tomar un café', 'me acabo de tomar un café']) {
    const before = model.calls.length;
    const { status, body } = await model.request([user(text)]);
    assert.equal(status, 200);
    assert.equal(body.actions[0].payload.time, '10:15');
    assert.equal(body.presentation, 'none');
    assert.equal(model.calls.length - before, 1);
    const sent = model.calls.at(-1).contents[0].parts[0].text;
    assert.match(sent, /Hora local de envío: 10:15/);
    assert.match(sent, /Inmediatez explícita: sí/);
    assert.match(sent, /time="10:15"/);
    assert.ok(sent.endsWith(text));
  }
});

test('coffee clarification preserves the original immediate time across turns and repeated recién', async t => {
  const model = mockModel(t, [proposal(meal())]);
  for (const clarification of ['negro solo', 'recien y necesito que calcules vos el cafe era un cafe negro solo', 'recién']) {
    const { body } = await model.request([
      user('recién me tomé un café'), bot('¿Era solo, con leche o azúcar?'), user(clarification, '10:16'),
    ]);
    assert.equal(body.actions[0].payload.time, '10:15');
    assert.equal(body.actions[0].estimated, true);
  }
  assert.equal(model.calls.length, 3);
});

test('a later immediate answer can resolve the time of a pending today request', async t => {
  const model = mockModel(t, [proposal(meal())]);
  const { body } = await model.request([user('Hoy tomé un café'), bot('¿A qué hora lo tomaste?'), user('recién', '10:20')]);
  assert.equal(body.actions[0].payload.time, '10:20');
});

test('gym duration clarification fills only the original immediate time', async t => {
  const action = { type: 'add_workout', estimated: true,
    payload: { dateStr: today, activity: 'Gimnasio', duration: 50, calories: 250, details: '' } };
  const model = mockModel(t, [proposal(action)]);
  const { body } = await model.request([
    user('acabo de entrenar gimnasio', '18:42'), bot('¿Cuánto tiempo entrenaste?'), user('50 minutos', '18:43'),
  ]);
  assert.equal(body.actions[0].payload.time, '18:42');
  assert.equal(body.actions[0].payload.duration, 50);
  assert.equal(body.presentation, 'none');
  assert.equal(model.calls.length, 1);
});

test('today alone, non-immediate words, invalid timestamps and other dates never borrow the current time', async t => {
  const model = mockModel(t, [proposal(meal())]);
  for (const messages of [
    [user('Hoy tomé un café')],
    [user('Recientemente me tomé un café')],
    [user('Ahorita me tomé un café')],
    [user('recién me tomé un café', '25:00')],
    [{ role: 'user', text: 'recién me tomé un café' }, user('negro solo', '10:16')],
    [user('Ayer recién tomé un café')],
    [user('Anteayer recién tomé un café'), bot('¿A qué hora?'), user('recién', '10:20')],
    [user('El lunes recién tomé un café')],
    [user('El 2026-10-07 recién tomé un café')],
    [user('El 7/10 recién tomé un café')],
    [user('Mañana voy a tomar un café ahora')],
  ]) {
    const before = model.calls.length;
    const { body } = await model.request(messages);
    assert.deepEqual(body.actions, []);
    assert.match(body.reply, /hora/);
    assert.equal(model.calls.length - before, 1);
  }
  const { body } = await model.request([user(`El ${today} recién tomé un café`)]);
  assert.equal(body.actions[0].payload.time, '10:15');
});

test('fallback never changes a past/future action or a valid explicit time', async t => {
  const model = mockModel(t, [proposal(meal({ dateStr: '2026-10-07' })),
    proposal(meal({ dateStr: '2026-10-09' })), proposal(meal({ time: '09:30' }))]);
  const past = await model.request([user('recién tomé un café')]);
  assert.deepEqual(past.body.actions, []);
  assert.match(past.body.reply, /2026-10-07/);
  const future = await model.request([user('recién tomé un café')]);
  assert.deepEqual(future.body.actions, []);
  assert.match(future.body.reply, /no futuras/);
  const explicit = await model.request([user('recién tomé un café')]);
  assert.equal(explicit.body.actions[0].payload.time, '09:30');
});

test('resolved requests, new requests and conversational topics cannot reuse an old immediate time', async t => {
  const model = mockModel(t, [proposal(meal())]);
  for (const messages of [
    [user('recién tomé un café'), bot('Registrado hoy: café.'), user('negro solo', '10:16')],
    [user('recién tomé un café'), bot('Te propongo este registro.'), user('negro solo', '10:16')],
    [user('recién tomé un café'), bot('Cancelado.'), user('negro solo', '10:16')],
    [user('recién tomé un café'), bot('¿Era solo?'), user('Hoy comí una pizza', '10:16')],
    [user('recién tomé un café'), bot('¿Era solo?'), user('Ahora armame una rutina', '10:16')],
  ]) {
    const { body } = await model.request(messages);
    assert.deepEqual(body.actions, []);
    assert.match(body.reply, /hora/);
  }
});

test('video regression retries only a redundant time question and returns the proposal with original time', async t => {
  const model = mockModel(t, [{ reply: '¿A qué hora te tomaste el café?', actions: [] }, proposal(meal())]);
  const { status, body } = await model.request([user('recien me tome un cafe')]);
  assert.equal(status, 200);
  assert.equal(model.calls.length, 2);
  assert.equal(body.reply, 'Te propongo este registro.');
  assert.equal(body.actions[0].payload.time, '10:15');
  assert.equal(body.presentation, 'none');
  assert.match(model.calls[0].contents[0].parts[0].text, /Inmediatez explícita: sí/);
  const correction = model.calls[1].systemInstruction.parts[0].text;
  assert.match(correction, /la hora ya está resuelta por inmediatez: 10:15/);
  assert.match(correction, /No preguntes la hora/);
  assert.match(correction, /datos NO temporales/);
  assert.match(correction, /Nunca le pidas al usuario que estime calorías\./);
  assert.match(correction, /tampoco digas “registraré”/);
});

test('one corrective retry maximum: a second time question is never shown to the user', async t => {
  const model = mockModel(t, [{ reply: '¿Me indicás la hora?', actions: [] }]);
  const { body } = await model.request([user('recien me tome un cafe')]);
  assert.equal(model.calls.length, 2);
  assert.deepEqual(body.actions, []);
  assert.equal(body.presentation, 'none');
  assert.ok(!body.reply.includes('¿'));
  assert.match(body.reply, /10:15/);
});

test('observable clarification, duration-only questions and non-immediate time questions do not retry', async t => {
  const model = mockModel(t, [
    { reply: '¿Era café solo o llevaba leche/azúcar?', actions: [] },
    { reply: '¿Cuántas horas entrenaste?', actions: [] },
    { reply: '¿A qué hora te tomaste el café?', actions: [] },
    { reply: '¿A qué hora te tomaste el café?', actions: [] },
  ]);
  await model.request([user('recién tomé un café')]);
  await model.request([user('acabo de entrenar gimnasio')]);
  await model.request([user('Hoy tomé un café')]);
  await model.request([user('Ayer recién tomé un café')]);
  assert.equal(model.calls.length, 4);
});

test('API temporal detection remains self-contained with no frontend/Coach imports', async () => {
  const source = await readFile(new URL('../api/ai/chat.ts', import.meta.url), 'utf8');
  assert.ok(!/\b(?:import|require)\s*(?:\(|.*from)/.test(source));
  assert.ok(!source.includes('date-fns'));
});
