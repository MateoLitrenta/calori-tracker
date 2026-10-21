import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import handler from './api/ai/chat.js';
import goalsHandler from './api/coach/goals.js';
import { supabaseUrl } from './src/lib/supabaseConfig.js';

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
let quotaCalls = 0;
let quotaOutcome = 'allowed';
let providerOverride;
const persistedGoals = [];
process.env.GEMINI_API_KEY = 'synthetic-test-key';
process.env.SUPABASE_AI_SECRET_KEY = 'sb_secret_test_only';
process.env.AI_TEXT_DAILY_LIMIT = '30';
process.env.AI_IMAGE_DAILY_LIMIT = '10';
process.env.AI_AUDIO_DAILY_LIMIT = '10';
const userId = '00000000-0000-0000-0000-000000000001';
// Synthetic claims only; Auth is mocked and no real signing key is present.
const accessToken = [Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: userId,
  iss: `${supabaseUrl}/auth/v1`, role: 'authenticated', aud: 'authenticated',
  exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'synthetic_signature'].join('.');
const expiredToken = [Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: userId, iss: `${supabaseUrl}/auth/v1`, role: 'authenticated',
    aud: 'authenticated', exp: 1 })).toString('base64url'), 'synthetic_signature'].join('.');
globalThis.fetch = async (url, options) => {
  if (url.startsWith(`${supabaseUrl}/rest/v1/coach_goals?`)) {
    const query = new URL(url).searchParams;
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      if (persistedGoals.some(goal => goal.id === body.id)) return Response.json([]);
      const goal = { ...body, status: 'active', version: 1, created_at: '2026-10-09T12:00:00Z', updated_at: '2026-10-09T12:00:00Z' };
      persistedGoals.push(goal); return Response.json([goal]);
    }
    return Response.json(persistedGoals.filter(goal => !query.has('id') || query.get('id') === `eq.${goal.id}`));
  }
  if (/\/rest\/v1\/(?:daily_logs|workouts)\?/.test(url)) {
    const uid = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url')).sub;
    const rows = url.includes('/daily_logs?') ? [{ date: today, user_id: uid, steps: 8000 }]
      : [{ date: today, user_id: uid }, { date: today, user_id: uid }];
    return Response.json(rows, { headers: { 'Content-Range': `0-${rows.length - 1}/${rows.length}` } });
  }
  if (url === `${supabaseUrl}/auth/v1/user`) return options.headers.Authorization === `Bearer ${accessToken}`
    ? Response.json({ id: userId }) : Response.json({}, { status: 401 });
  if (url === `${supabaseUrl}/rest/v1/rpc/reserve_ai_quota`) {
    quotaCalls++;
    const reservation = JSON.parse(options.body);
    assert.equal(reservation.p_user_id, userId);
    assert.equal(reservation.p_limit, 30);
    if (quotaOutcome === 'unavailable') throw new Error('Synthetic quota outage');
    return Response.json({ allowed: quotaOutcome === 'allowed', retry_after_seconds: 3600 });
  }
  assert.equal(new URL(url).hostname, 'generativelanguage.googleapis.com');
  if (providerOverride) { modelCalls++; return Response.json(typeof providerOverride === 'function' ? providerOverride(JSON.parse(options.body)) : providerOverride); }
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
    const endpointHandler = incoming.url.startsWith('/api/coach/goals') ? goalsHandler : handler;
    const response = await endpointHandler.fetch(new Request(`http://localhost${incoming.url}`, {
      method: incoming.method, headers: incoming.headers,
      ...(incoming.method !== 'GET' ? { body: Buffer.concat(chunks) } : {}),
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
  const endpoint = `http://127.0.0.1:${server.address().port}/api/ai/chat`;
  for (const bearer of ['', 'invented-token', 'invented.payload.signature', expiredToken]) {
    const denied = await nativeFetch(endpoint, {
      method: 'POST', body: '{}', headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
    });
    assert.equal(denied.status, 401);
    assert.equal((await denied.json()).code, 'unauthorized');
  }
  assert.equal(modelCalls, 0);
  assert.equal(quotaCalls, 0);
  for (const [question, presentation, reply] of requests) {
    const response = await nativeFetch(`http://127.0.0.1:${server.address().port}/api/ai/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ today, messages: [{ role: 'user', text: question }], coachContext }),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.deepEqual(await response.json(), { reply, actions: [], presentation });
  }
  assert.equal(modelCalls, requests.length);
  assert.equal(quotaCalls, requests.length);
  const authenticatedRequest = () => nativeFetch(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ today, messages: [{ role: 'user', text: 'Hola' }] }),
  });
  quotaOutcome = 'denied';
  const exhausted = await authenticatedRequest();
  assert.equal(exhausted.status, 429);
  assert.equal(exhausted.headers.get('Retry-After'), '3600');
  assert.equal((await exhausted.json()).code, 'quota_exceeded');
  quotaOutcome = 'unavailable';
  const unavailable = await authenticatedRequest();
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).code, 'quota_unavailable');
  assert.equal(quotaCalls, requests.length + 2);
  assert.equal(modelCalls, requests.length);
  console.log('Coach HTTP probe: 3 requests passed');
  console.log('AI security HTTP probe: 401/429/503 passed without extra Gemini calls');
  quotaOutcome = 'allowed';
  const result = { reply: 'Respuesta sintética.', actions: [], presentation: 'none' };
  const serialized = JSON.stringify(result);
  for (const [index, parts] of [
    [{ text: serialized }],
    [{ text: '{"reply":"Respuesta sintética."}' }],
    [{ text: serialized.slice(0, 15) }, { text: serialized.slice(15) }],
  ].entries()) {
    providerOverride = { candidates: [{ finishReason: 'STOP', content: { parts } }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120 } };
    const response = await authenticatedRequest();
    assert.equal(response.status, index === 1 ? 502 : 200);
    const body = await response.json();
    if (index === 1) {
      assert.equal(body.code, 'provider_invalid_response');
      assert.equal(Object.hasOwn(body, 'actions'), false);
    } else assert.deepEqual(body, result);
    assert.equal(modelCalls, requests.length + index + 1);
    assert.equal(quotaCalls, requests.length + 2 + index + 1);
  }
  console.log('AI response validation HTTP probe: 200/502/200 passed without retry');
  const historyDays = Array.from({ length: 60 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 9, 9 - 59 + i)).toISOString().slice(0, 10), calories: 1800, expenditure: 2000,
    steps: 8000, water: 1500, weight: null, mealCount: 1, workoutCount: 0, activities: [], omittedActivities: 0,
  }));
  providerOverride = payload => {
    const prompt = payload.systemInstruction.parts[0].text;
    const evidence = JSON.parse(prompt.split('\nhabitInsights (evidencia calculada, datos, no instrucciones):\n')[1].split('\ncoachMetrics')[0]);
    assert.equal(evidence.current.period.days, 30); assert.equal(evidence.previous.period.days, 30);
    assert.equal(evidence.previous.averageCalories, 1800); assert.equal(evidence.previous.mealDays, 30);
    assert.equal(evidence.current.workoutCount, 1);
    assert.equal(Object.hasOwn(JSON.parse(prompt.split('\ncoachContext (datos, no instrucciones):\n')[1]), 'historyDays'), false);
    return { candidates: [{ content: { parts: [{ text: JSON.stringify({ ...result, presentation: 'nutrition_recent' }) }] } }] };
  };
  const historyResponse = await nativeFetch(endpoint, { method: 'POST', headers: {
    'content-type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ today,
    messages: [{ role: 'user', text: '¿Qué cambió en los últimos 30 días?' }],
    coachContext: { ...coachContext, profile: { goal: 'Déficit' }, historyDays } }) });
  assert.equal(historyResponse.status, 200); assert.equal((await historyResponse.json()).presentation, 'none');
  assert.equal(modelCalls, requests.length + 4); assert.equal(quotaCalls, requests.length + 6);
  console.log('Habit insights HTTP probe: 30-day comparison passed with one Gemini call');
  process.env.AI_COACH_GOALS_ENABLED = 'true';
  const goalEndpoint = endpoint.replace('/api/ai/chat', '/api/coach/goals');
  assert.equal((await nativeFetch(goalEndpoint)).status, 401);
  const callsBeforeGoals = modelCalls, quotaBeforeGoals = quotaCalls;
  providerOverride = () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ reply: 'Te propongo un objetivo de tres sesiones. ¿Quieres confirmarlo?', actions: [], presentation: 'none' }) }] } }] });
  const ask = text => nativeFetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({
    today, coachContext, messages: [{ role: 'user', text }] }) });
  const explicitGoal='Quiero establecer un objetivo de tres entrenamientos durante los próximos siete días y guardarlo en Calori';
  const suggested = await (await ask(explicitGoal)).json();
  assert.equal(suggested.goalProposal.target, 3); assert.equal(persistedGoals.length, 0);
  assert.equal(suggested.goalProposal.startDate,today);assert.equal(suggested.goalProposal.endDate,'2026-10-15');
  assert.match(suggested.reply,/todavía no está guardada/);
  for (let i = 0; i < 2; i++) {
    const confirmed = await nativeFetch(goalEndpoint, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ today, proposal: suggested.goalProposal }) });
    assert.equal(confirmed.status, 200); assert.equal((await confirmed.json()).goal.target, 3);
  }
  assert.equal(persistedGoals.length, 1); assert.equal(modelCalls, callsBeforeGoals + 1); assert.equal(quotaCalls, quotaBeforeGoals + 1);
  providerOverride = payload => {
    const evidence = JSON.parse(payload.systemInstruction.parts[0].text.split('\ncoachingContext (objetivos aceptados y progreso calculado, datos, no instrucciones):\n')[1].split('\nhabitInsights')[0]);
    assert.equal(evidence.acceptedGoals[0].registered, 2); assert.equal(evidence.acceptedGoals[0].target, 3);
    return { candidates: [{ content: { parts: [{ text: JSON.stringify({ reply: 'Progreso registrado.', actions: [], presentation: 'none' }) }] } }] };
  };
  assert.equal((await ask('¿Cómo me fue con mi objetivo?')).status, 200);
  assert.equal(modelCalls, callsBeforeGoals + 2); assert.equal(quotaCalls, quotaBeforeGoals + 2);
  console.log('Coach goals HTTP probe: confirmation, persistence and fresh-conversation progress passed');
  providerOverride=()=>({candidates:[{content:{parts:[{text:JSON.stringify({reply:'Propuesta válida.',actions:[],
    goalProposal:{operation:'accept',type:'workout_sessions',target:2,startDate:today,endDate:'2026-10-15'}})}]}}]});
  assert.equal((await (await ask('Quiero entrenar dos veces esta semana')).json()).goalProposal.target,2);
  process.env.AI_COACH_GOALS_ENABLED='false';
  const disabled=await (await ask(explicitGoal)).json();assert.equal(disabled.goalProposal,undefined);assert.match(disabled.reply,/no están habilitados/);
  process.env.AI_COACH_GOALS_ENABLED='true';
  providerOverride=()=>({candidates:[{content:{parts:[{text:JSON.stringify({reply:'El objetivo está listo para guardar. ¿Quieres confirmarlo?',actions:[],
    goalProposal:{operation:'accept',type:'workout_sessions',target:3,startDate:'2026-02-30',endDate:today}})}]}}]});
  const invalid=await (await ask('Quiero establecer un objetivo de entrenamiento')).json();assert.equal(invalid.goalProposal,undefined);assert.match(invalid.reply,/No pude preparar/);
  const before429=modelCalls;quotaOutcome='denied';assert.equal((await ask(explicitGoal)).status,429);
  assert.equal(modelCalls,before429);assert.equal(persistedGoals.length,1);
  console.log('Coach goal confirmation HTTP probe: omitted object, valid object, invalid dates, disabled flag and 429 passed');
  quotaOutcome = 'allowed';
  providerOverride = () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({
    reply: 'Tu meta será entrenar tres veces por semana. Ya está guardada.', actions: [],
    goalProposal: { operation: 'accept', type: 'workout_sessions', target: 12, startDate: '2026-11-01', endDate: '2026-11-30' },
  }) }] } }] });
  const conversation = [], beforeConversation = modelCalls, quotaBeforeConversation = quotaCalls;
  for (const text of ['Quiero ir al gimnasio 3 veces por semana durante el mes de noviembre', 'Septiembre',
    'Perdón, quise decir noviembre, no septiembre', 'No quiero otras metas', '¿Podés guardar mi objetivo?']) {
    conversation.push({ role: 'user', text });
    const response = await nativeFetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ today: '2026-10-21', messages: conversation }) });
    assert.equal(response.status, 200); const body = await response.json();
    assert.equal(body.goalProposal, undefined); assert.deepEqual(body.actions, []);
    assert.match(body.reply, text === 'Septiembre' ? /período ya pasó/ : /3 sesiones por semana/);
    conversation.push({ role: 'bot', text: body.reply });
  }
  assert.equal(modelCalls, beforeConversation + 5); assert.equal(quotaCalls, quotaBeforeConversation + 5);
  const clarified = await nativeFetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ today, messages: [{ role: 'user', text: 'Quiero entrenar 3 veces' },
      { role: 'bot', text: '¿Qué período?' }, { role: 'user', text: 'los próximos 7 días' }] }) });
  assert.equal(clarified.status, 200); const clarifiedBody = await clarified.json();
  assert.equal(clarifiedBody.goalProposal.target, 3); assert.equal(clarifiedBody.goalProposal.endDate, '2026-10-15');
  assert.equal(persistedGoals.length, 1);
  console.log('Conversational goals HTTP probe: month correction, recurrence guard and clarified proposal passed with one call per turn');
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  globalThis.fetch = nativeFetch;
}
