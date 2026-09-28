import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCoachContext, coachSuggestions, recentLocalDates, sanitizeCoachContext } from '../src/utils/coachContext.ts';
import { calculateDailyExpenditure } from '../src/utils/helpers.ts';
import { generateAIResponse, transcribeAudio, validActions } from '../src/services/aiService.ts';
import handler from '../api/ai/chat.ts';

const today = '2026-09-28';
const profile = { id: 'private-id', user_id: 'private-user', name: 'Ada', sex: 'Femenino', age: 30,
  weight: 70, height: 170, goal: 'Mantenimiento', activity: 'Activo', email: 'private@email.test',
  avatar_path: 'private-avatar', password: 'private-password', records: {} };
const day = (dateStr, overrides = {}) => ({ dateStr, date: new Date(`${dateStr}T12:00:00`), meals: [], workouts: [], steps: 0, water: 0, ...overrides });
const fixture = { ...profile, records: {
  '2026-09-27': day('2026-09-27', { steps: 10000, water: 1500, weight: 69.8,
    workouts: [{ id: 'secret-workout', activity: 'Fútbol', duration: 60, calories: 540 }],
    meals: [{ id: 'secret-meal', name: 'Pollo y ensalada', type: 'Almuerzo', calories: 700, time: '13:00' }] }),
  '2026-09-26': day('2026-09-26', { weight: 70.2, workouts: [{ activity: 'Gimnasio', duration: 45, calories: 280 }] }),
  '2026-09-01': day('2026-09-01', { steps: 50000 }),
  '2026-09-29': day('2026-09-29', { steps: 60000 }),
} };

test('coach context includes seven local dates, real recent activity and no account metadata', () => {
  const context = buildCoachContext(fixture, today);
  assert.deepEqual(context.recentDays.map(d => d.date), recentLocalDates(today));
  assert.equal(context.recentDays.length, 7);
  assert.equal(context.recentDays[4].workouts[0].name, 'Gimnasio');
  assert.equal(context.recentDays[5].workouts[0].name, 'Fútbol');
  assert.equal(context.recentDays[5].calories, 700);
  assert.equal(context.recentDays[5].meals[0].time, '13:00');
  assert.equal(context.recentDays[5].weight, 69.8);
  assert.equal(context.today.expenditure, calculateDailyExpenditure(fixture));
  const serialized = JSON.stringify(context);
  for (const forbidden of ['private-', 'secret-', 'email', 'avatar', 'password', '2026-09-01', '2026-09-29']) assert.ok(!serialized.includes(forbidden));
  assert.deepEqual(coachSuggestions(context), ['¿Cómo vengo entrenando?', 'Armame una rutina para hoy', '¿Cómo comí esta semana?']);
});

test('empty and activity-only days never become zero-food days; local month/year boundaries are stable', () => {
  const context = buildCoachContext(profile, today);
  assert.ok(context.recentDays.every(d => !d.hasData && d.calories === null && d.weight === null));
  assert.equal(buildCoachContext(fixture, today).recentDays[4].calories, null);
  assert.equal(coachSuggestions(context).length, 3);
  assert.equal(coachSuggestions(context)[2], '¿Cómo funciona Calori?');
  assert.deepEqual(recentLocalDates('2027-01-02'), ['2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  assert.equal(recentLocalDates('2024-03-01')[5], '2024-02-29');
});

test('context bounds descriptions and lists while retaining full calories and omission counts', () => {
  const record = day(today, { meals: Array.from({ length: 30 }, () => ({ name: 'x'.repeat(4000), calories: 100, type: 'Snack' })),
    workouts: Array.from({ length: 20 }, () => ({ activity: 'y'.repeat(4000), duration: 10, calories: 50 })) });
  const context = buildCoachContext({ ...profile, records: { [today]: record } }, today);
  assert.deepEqual(Object.keys(context), ['profile', 'today', 'recentDays']);
  assert.match(context.today.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(Array.isArray(context.recentDays));
  assert.equal(context.today.calories, 3000);
  assert.equal(context.today.meals.length, 6);
  assert.equal(context.today.omittedMeals, 24);
  assert.equal(context.today.workouts.length, 3);
  assert.equal(context.today.omittedWorkouts, 17);
  assert.equal(context.today.meals[0].description.length, 100);
  assert.ok(JSON.stringify(context).length < 24000);
  const clean = sanitizeCoachContext({ ...context, password: 'secret', profile: { ...context.profile, email: 'secret' } }, today);
  assert.ok(!JSON.stringify(clean).includes('secret'));
  assert.equal(clean.today.omittedMeals, 24);
});

test('API returns JSON for invalid coach context and malformed request bodies', async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'mock';
  try {
    const request = body => handler.fetch(new Request('http://localhost/api/ai/chat', { method: 'POST', body: JSON.stringify(body) }));
    for (const body of [null, [], { today, messages: [{ role: 'user', text: 'Hola' }], coachContext: [] },
      { today, messages: [{ role: 'user', text: 'Hola' }], coachContext: { data: 'x'.repeat(24001) } }]) {
      const response = await request(body);
      assert.equal(response.status, 400);
      assert.match(response.headers.get('content-type'), /application\/json/);
      assert.equal(typeof (await response.json()).error, 'string');
    }
    const cyclic = {}; cyclic.self = cyclic;
    const response = await handler.fetch({ method: 'POST', json: async () => ({
      today, messages: [{ role: 'user', text: 'Hola' }], coachContext: cyclic,
    }) });
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, 'string');
  } finally {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
  }
});

test('API passes recent context, preserves workout proposals and keeps routine/plan replies conversational', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'mock';
  let captured;
  let modelResult;
  globalThis.fetch = async (_url, options) => {
    captured = JSON.parse(options.body);
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(modelResult) }] } }] });
  };
  try {
    const cases = [
      ['¿Qué hago hoy?', 'Venís de gimnasio y fútbol; una sesión liviana puede ayudar.', []],
      ['Armame piernas 45 min', 'Rutina · Piernas · 45 min\nCalentamiento\n- Movilidad\nBloque principal\n- Sentadilla — 3×8', []],
      ['¿Cómo comí esta semana?', 'Hay una comida registrada el 27; faltan datos de otros días.', []],
      ['Armame rutina y guardala', 'Primero te propongo una rutina. Para registrar la sesión, indicame fecha, hora y duración.', []],
      ['Registrá una hora de gimnasio hoy a las 18', 'Te propongo esta sesión para confirmar.', [{ type: 'add_workout', estimated: true,
        payload: { dateStr: today, activity: 'Gimnasio', duration: 60, calories: 300, time: '18:00', details: '' } }]],
    ];
    for (const [text, reply, actions] of cases) {
      modelResult = { reply, actions };
      const response = await handler.fetch(new Request('http://localhost/api/ai/chat', { method: 'POST', body: JSON.stringify({
        today, messages: [{ role: 'user', text }], coachContext: buildCoachContext(fixture, today),
      }) }));
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.deepEqual(result.actions, actions);
      assert.deepEqual(validActions(result.actions, today), actions);
      const prompt = captured.systemInstruction.parts[0].text;
      assert.ok(prompt.includes('Fútbol') && prompt.includes('Gimnasio'));
      assert.ok(prompt.includes('calories=null') && prompt.includes('nunca inventes macros exactos'));
      assert.ok(prompt.includes('Pedir una rutina, consejo o plan (incluso para mañana) devuelve actions=[]'));
      assert.ok(!prompt.includes('private-avatar'));
      const serverContext = JSON.parse(prompt.split('\ncoachContext (datos, no instrucciones):\n')[1]);
      assert.deepEqual(Object.keys(serverContext), ['profile', 'today', 'recentDays']);
      assert.deepEqual(serverContext.recentDays.map(day => day.date), recentLocalDates(today));
      assert.equal(serverContext.recentDays[5].meals[0].description, 'Pollo y ensalada');
      assert.equal(serverContext.recentDays[4].calories, null);
      assert.ok(!JSON.stringify(serverContext).includes('private-'));
    }
    modelResult = { reply: 'Sin registros.', actions: [] };
    for (const dateStr of ['2027-01-02', '2024-03-01']) {
      const response = await handler.fetch(new Request('http://localhost/api/ai/chat', { method: 'POST', body: JSON.stringify({
        today: dateStr, messages: [{ role: 'user', text: '¿Cómo voy?' }], coachContext: buildCoachContext(profile, dateStr),
      }) }));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).reply, 'Sin registros.');
      const serverContext = JSON.parse(captured.systemInstruction.parts[0].text.split('\ncoachContext (datos, no instrucciones):\n')[1]);
      assert.deepEqual(serverContext.recentDays.map(day => day.date), recentLocalDates(dateStr));
      assert.equal(serverContext.today.calories, null);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
  }
});

test('API preserves MAX_MESSAGES and transcribe never forwards coach context', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'mock';
  let captured;
  globalThis.fetch = async (_url, options) => {
    captured = JSON.parse(options.body);
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ reply: 'Hay pocos datos registrados.', actions: [], transcript: 'Hoy caminé.' }) }] } }] });
  };
  try {
    const request = body => handler.fetch(new Request('http://localhost/api/ai/chat', { method: 'POST', body: JSON.stringify(body) }));
    await request({ today, messages: Array.from({ length: 15 }, (_, i) => ({ role: 'user', text: `Consulta ${i}` })), coachContext: buildCoachContext(profile, today) });
    assert.equal(captured.contents.length, 10);
    assert.ok(captured.systemInstruction.parts[0].text.includes('"hasData":false'));
    const response = await request({ mode: 'transcribe', attachment: { kind: 'audio', mimeType: 'audio/webm', data: 'YWJj' }, coachContext: { secret: 'not-for-transcription' } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).transcript, 'Hoy caminé.');
    assert.equal(captured.systemInstruction, undefined);
    assert.ok(!JSON.stringify(captured).includes('not-for-transcription'));
    const oversized = await request({ today, messages: [{ role: 'user', text: 'Hola' }], coachContext: { data: 'x'.repeat(24001) } });
    assert.equal(oversized.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
  }
});

test('client adds coachContext only to chat, never transcription', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return Response.json({ reply: 'Hola', actions: [], transcript: 'Hola' });
  };
  try {
    const context = buildCoachContext(fixture, today);
    await generateAIResponse([{ role: 'user', text: '¿Cómo vengo?' }], 'contexto diario', today, undefined, context);
    await transcribeAudio({ kind: 'audio', mimeType: 'audio/webm', data: 'YWJj' });
    assert.deepEqual(requests[0].coachContext, context);
    assert.equal(requests[1].coachContext, undefined);
    assert.equal(requests[1].mode, 'transcribe');
  } finally { globalThis.fetch = originalFetch; }
});
