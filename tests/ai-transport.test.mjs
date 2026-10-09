import assert from 'node:assert/strict';
import { test } from 'node:test';
import { supabase } from '../src/lib/supabase.ts';
import { generateAIResponse, transcribeAudio, estimateMeal, estimateWorkout } from '../src/services/aiService.ts';
import { AIRequestError } from '../src/services/aiTransport.ts';

function client(t, response) {
  const oldFetch = globalThis.fetch;
  const oldSession = supabase.auth.getSession;
  let requests = [];
  supabase.auth.getSession = async () => ({ data: { session: { access_token: 'test-access-token' } }, error: null });
  globalThis.fetch = async (url, options) => { requests.push({ url, ...options }); return response(); };
  t.after(() => { globalThis.fetch = oldFetch; supabase.auth.getSession = oldSession; });
  return { get requests() { return requests; } };
}

test('all AI modes send the current session bearer and never a client user ID', async t => {
  const mock = client(t, () => Response.json({ reply: 'Hola', actions: [], transcript: 'Audio',
    estimated: true, calories: 100, description: 'Comida', activity: 'Actividad', assumptions: [] }));
  await generateAIResponse([{ role: 'user', text: 'Hola' }], 'contexto', '2026-10-09');
  await transcribeAudio({ kind: 'audio', mimeType: 'audio/webm', data: 'YWJj' });
  await estimateMeal({ name: 'Comida', details: '', type: 'Snack' });
  await estimateWorkout({ activity: 'Actividad', duration: 10, details: '', profile: { sex: 'Masculino', age: 30, weight: 80, height: 180 } });
  assert.equal(mock.requests.length, 4);
  for (const request of mock.requests) {
    assert.equal(request.headers.Authorization, 'Bearer test-access-token');
    assert.equal(JSON.parse(request.body).userId, undefined);
  }
});

test('missing session does not call endpoint or sign out; renewed session is reused', async t => {
  const mock = client(t, () => Response.json({ reply: 'Hola', actions: [] }));
  supabase.auth.getSession = async () => ({ data: { session: null }, error: null });
  await assert.rejects(generateAIResponse([], '', '2026-10-09'), error => error.status === 401 && /sesión expiró/.test(error.message));
  assert.equal(mock.requests.length, 0);
  supabase.auth.getSession = async () => ({ data: { session: { access_token: 'renewed-token' } }, error: null });
  await generateAIResponse([], '', '2026-10-09');
  assert.equal(mock.requests[0].headers.Authorization, 'Bearer renewed-token');
  supabase.auth.getSession = async () => { throw new Error('private auth network detail'); };
  await assert.rejects(generateAIResponse([], '', '2026-10-09'), error => error.status === 503 && !error.message.includes('sesión expiró'));
  assert.equal(mock.requests.length, 1);
});

test('HTTP status takes precedence over malformed/HTML error bodies and messages contain no external secrets', async t => {
  let status = 401;
  client(t, () => new Response('private secret <html>', { status, headers: { 'Retry-After': '60' } }));
  for (const [value, message] of [[400, /Revisá los datos/], [401, /sesión expiró/], [429, /límite/],
    [500, /Intentá nuevamente/], [502, /Intentá nuevamente/], [503, /Intentá nuevamente/]]) {
    status = value;
    await assert.rejects(generateAIResponse([], '', '2026-10-09'), error => {
      assert.ok(error instanceof AIRequestError); assert.equal(error.status, status);
      assert.equal(error.retryAfterSeconds, 60); assert.match(error.message, message);
      assert.ok(!error.message.includes('secret')); return true;
    });
  }
});

test('network and malformed success responses are actionable and do not retry requests automatically', async t => {
  const mock = client(t, () => { throw new Error('private network detail'); });
  const messages = [{ role: 'bot', text: 'Historial previo' }, { role: 'user', text: 'Hola' }];
  await assert.rejects(generateAIResponse(messages, '', '2026-10-09'), /No pudimos conectar/);
  assert.equal(mock.requests.length, 1);
  assert.equal(messages.length, 2);
  globalThis.fetch = async () => new Response('malformed', { status: 200 });
  await assert.rejects(generateAIResponse(messages, '', '2026-10-09'), /Intentá nuevamente/);
  assert.equal(messages[0].text, 'Historial previo');
});
