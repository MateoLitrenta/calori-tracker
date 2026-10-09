import assert from 'node:assert/strict';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import handler from '../api/ai/chat.ts';
import { supabaseUrl } from '../src/lib/supabaseConfig.ts';

const own = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const sign = claims => {
  const head = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url');
  const body = Buffer.from(JSON.stringify({ sub: own, exp: Math.floor(Date.now() / 1000) + 3600,
    role: 'authenticated', aud: 'authenticated', iss: `${supabaseUrl}/auth/v1`, ...claims })).toString('base64url');
  const signature = createHmac('sha256', 'synthetic-signing-secret').update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${signature}`;
};
const token = sign({});
const db = new PGlite();
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    insert into auth.users values ('${own}'), ('${other}');`);
  await db.exec(await readFile(new URL('../supabase/migrations/202610090001_ai_usage_quotas.sql', import.meta.url), 'utf8'));
});
after(() => db.close());
beforeEach(async () => { await db.exec('reset role; truncate ai_private.daily_usage; set role service_role;'); });

function infrastructure(t) {
  const envNames = ['GEMINI_API_KEY', 'SUPABASE_AI_SECRET_KEY', 'AI_TEXT_DAILY_LIMIT', 'AI_IMAGE_DAILY_LIMIT', 'AI_AUDIO_DAILY_LIMIT', 'AI_GEMINI_TIMEOUT_MS'];
  const oldEnv = Object.fromEntries(envNames.map(key => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  const oldInfo = console.info;
  const logs = [];
  const reservations = [];
  let calls = 0;
  const control = { logs, reservations, authFailure: undefined, quotaFailure: false,
    provider: async () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ reply: 'Respuesta de prueba.', actions: [], presentation: 'none' }) }] } }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120 } }),
    get calls() { return calls; } };
  process.env.GEMINI_API_KEY = 'gemini_do_not_log';
  process.env.SUPABASE_AI_SECRET_KEY = 'sb_secret_do_not_log';
  process.env.AI_TEXT_DAILY_LIMIT = '30'; process.env.AI_IMAGE_DAILY_LIMIT = '10'; process.env.AI_AUDIO_DAILY_LIMIT = '10';
  delete process.env.AI_GEMINI_TIMEOUT_MS;
  console.info = message => logs.push(message);
  globalThis.fetch = async (url, options) => {
    if (url === `${supabaseUrl}/auth/v1/user`) {
      if (control.authFailure) return new Response('private auth error', { status: control.authFailure });
      const bearer = options.headers.Authorization.slice(7);
      const parts = bearer.split('.');
      const actual = Buffer.from(parts[2], 'base64url');
      const expected = createHmac('sha256', 'synthetic-signing-secret').update(parts.slice(0, 2).join('.')).digest();
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({}, { status: 401 });
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      if (claims.exp <= Date.now() / 1000) return Response.json({}, { status: 401 });
      return Response.json({ id: claims.sub });
    }
    if (url === `${supabaseUrl}/rest/v1/rpc/reserve_ai_quota`) {
      assert.equal(options.headers.apikey, process.env.SUPABASE_AI_SECRET_KEY);
      assert.equal(options.headers.Authorization, undefined);
      const args = JSON.parse(options.body); reservations.push(args);
      if (control.quotaFailure) throw new Error('private quota error sb_secret_do_not_log');
      const result = await db.query('select public.reserve_ai_quota($1::uuid, $2, $3::integer) as quota', [args.p_user_id, args.p_category, args.p_limit]);
      return Response.json(result.rows[0].quota);
    }
    assert.equal(new URL(url).hostname, 'generativelanguage.googleapis.com');
    calls++;
    return control.provider(url, options);
  };
  t.after(() => {
    globalThis.fetch = oldFetch; console.info = oldInfo;
    for (const key of envNames) { if (oldEnv[key] === undefined) delete process.env[key]; else process.env[key] = oldEnv[key]; }
  });
  control.request = (body = {}, accessToken = token) => handler.fetch(new Request('http://localhost/api/ai/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify({ today: '2026-10-09', messages: [{ role: 'user', text: 'Hola' }], ...body }),
  }));
  return control;
}

test('missing, invalid signature, malformed and expired tokens are 401 without quota or Gemini', async t => {
  const mock = infrastructure(t);
  const invalidSignature = token.split('.');
  // Change meaningful bits; the last base64url character can contain padding
  // bits and a different spelling may still decode to the same signature.
  invalidSignature[2] = (invalidSignature[2][0] === 'A' ? 'B' : 'A') + invalidSignature[2].slice(1);
  for (const accessToken of ['', 'not-a-token', invalidSignature.join('.'), sign({ exp: 1 })]) {
    const response = await mock.request({}, accessToken);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, 'unauthorized');
  }
  assert.equal(mock.calls, 0); assert.equal(mock.reservations.length, 0);
  const logged = mock.logs.join('\n');
  for (const value of [token, own, 'gemini_do_not_log', 'sb_secret_do_not_log']) assert.ok(!logged.includes(value));
});

test('verified tokens also enforce issuer, audience, role and not-before', async t => {
  const mock = infrastructure(t);
  for (const claims of [{ iss: 'https://other-project.supabase.co/auth/v1' }, { aud: 'another-service' },
    { role: 'service_role' }, { nbf: Math.floor(Date.now() / 1000) + 100 }]) {
    assert.equal((await mock.request({}, sign(claims))).status, 401);
  }
  assert.equal(mock.calls, 0);
  assert.equal((await mock.request({}, sign({ aud: ['authenticated', 'additional'] }))).status, 200);
});

test('chat, image estimates and transcription all authenticate and reserve the validated modality', async t => {
  const mock = infrastructure(t);
  const image = { kind: 'image', mimeType: 'image/jpeg', data: 'YWJj' };
  const audio = { kind: 'audio', mimeType: 'audio/webm', data: 'YWJj' };
  const requests = [
    [{}, 'text', { reply: 'Hola', actions: [] }],
    [{ mode: 'estimate', estimateType: 'meal', attachment: image }, 'image',
      { estimated: true, calories: 100, description: 'Comida', assumptions: [] }],
    [{ attachment: image }, 'image', { reply: 'Revisá la propuesta.', presentation: 'none',
      actions: [{ type: 'add_meal', estimated: true,
        payload: { dateStr: '2026-10-09', name: 'Comida', type: 'Almuerzo', calories: 100, time: '12:30' } }] }],
    [{ mode: 'transcribe', attachment: audio, messages: undefined }, 'audio', { transcript: 'Audio de prueba' }],
  ];
  for (const [body, category, result] of requests) {
    assert.equal((await mock.request(body, '')).status, 401);
    mock.provider = async () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] });
    assert.equal((await mock.request(body)).status, 200);
    const reservation = mock.reservations.at(-1);
    assert.equal(reservation.p_category, category);
    assert.equal(reservation.p_limit, category === 'text' ? 30 : 10);
    const event = JSON.parse(mock.logs.at(-1));
    assert.equal(event.tokenCoverage, 'unavailable');
    assert.equal(event.tokens.total, null);
  }
  await db.exec('reset role');
  const counters = await db.query('select category, used from ai_private.daily_usage order by category');
  assert.deepEqual(counters.rows, [{ category: 'audio', used: 1 }, { category: 'image', used: 2 }, { category: 'text', used: 1 }]);
  await db.exec('set role service_role');
  const calls = mock.calls;
  // Exhaust only synthetic media buckets, leaving the text bucket available.
  process.env.AI_IMAGE_DAILY_LIMIT = '1'; process.env.AI_AUDIO_DAILY_LIMIT = '1';
  assert.equal((await mock.request({ mode: 'estimate', estimateType: 'meal', attachment: image })).status, 429);
  assert.equal((await mock.request({ mode: 'transcribe', attachment: audio, messages: undefined })).status, 429);
  assert.equal(mock.calls, calls);
  mock.provider = async () => Response.json({ candidates: [{ content: { parts: [{ text: '{"reply":"Hola","actions":[]}' }] } }] });
  assert.equal((await mock.request()).status, 200);
});

test('valid session reaches Gemini; client identifiers cannot choose another user quota', async t => {
  const mock = infrastructure(t);
  assert.equal((await mock.request({ userId: other, user_id: other, email: 'other@example.invalid' })).status, 200);
  assert.equal(mock.reservations[0].p_user_id, own);
  assert.equal(mock.calls, 1);
  const event = JSON.parse(mock.logs[0]);
  assert.equal(event.modality, 'text'); assert.equal(event.providerCalls, 1);
  assert.deepEqual(event.tokens, { prompt: 100, output: 20, total: 120 });
});

test('concurrent authenticated calls cannot exceed the persistent quota; users and modes are independent', async t => {
  const mock = infrastructure(t);
  process.env.AI_TEXT_DAILY_LIMIT = '5';
  const responses = await Promise.all(Array.from({ length: 25 }, () => mock.request()));
  assert.equal(responses.filter(r => r.status === 200).length, 5);
  assert.equal(responses.filter(r => r.status === 429).length, 20);
  assert.equal(mock.calls, 5);
  const denied = responses.find(r => r.status === 429);
  const body = await denied.json();
  assert.equal(body.code, 'quota_exceeded');
  assert.equal(Number(denied.headers.get('Retry-After')), body.retryAfterSeconds);
  assert.ok(body.retryAfterSeconds >= 1 && body.retryAfterSeconds <= 86400);
  assert.equal((await mock.request({}, sign({ sub: other }))).status, 200);
  const image = { kind: 'image', mimeType: 'image/jpeg', data: 'YWJj' };
  assert.equal((await mock.request({ attachment: image })).status, 200);
  const rows = await db.query('select public.reserve_ai_quota($1::uuid, $2, $3::integer) as quota', [own, 'audio', 10]);
  assert.equal(rows.rows[0].quota.allowed, true);
});

test('database denies browser RPC/table access and validates reservations; previous days do not block today', async () => {
  await db.exec('reset role');
  for (const role of ['anon', 'authenticated']) {
    const privileges = await db.query(`select has_schema_privilege($1, 'ai_private', 'USAGE') as schema_access,
      has_table_privilege($1, 'ai_private.daily_usage', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as table_access`, [role]);
    assert.deepEqual(privileges.rows[0], { schema_access: false, table_access: false });
  }
  const rls = await db.query(`select relrowsecurity from pg_class where oid = 'ai_private.daily_usage'::regclass`);
  assert.equal(rls.rows[0].relrowsecurity, true);
  assert.equal((await db.query(`select count(*)::integer as count from pg_policies
    where schemaname = 'ai_private' and tablename = 'daily_usage'`)).rows[0].count, 0);
  await db.exec('reset role; set role authenticated');
  await assert.rejects(db.query('select public.reserve_ai_quota($1::uuid, $2, 999999)', [other, 'text']), /permission denied/);
  await assert.rejects(db.query('select * from ai_private.daily_usage'), /permission denied/);
  await db.exec('reset role; set role anon');
  await assert.rejects(db.query('select public.reserve_ai_quota($1::uuid, $2, 999999)', [own, 'text']), /permission denied/);
  await assert.rejects(db.query('select * from ai_private.daily_usage'), /permission denied/);
  await db.exec(`reset role; insert into ai_private.daily_usage(user_id, quota_day, category, used, daily_limit, last_allowed)
    values ('${own}', current_date - 1, 'text', 999, 999, false); set role service_role;`);
  assert.equal((await db.query('select public.reserve_ai_quota($1::uuid, $2, 1) as quota', [own, 'text'])).rows[0].quota.allowed, true);
  assert.equal((await db.query('select public.reserve_ai_quota($1::uuid, $2, 0) as quota', [own, 'image'])).rows[0].quota.allowed, false);
  await assert.rejects(db.query('select public.reserve_ai_quota($1::uuid, $2, 1)', [own, 'unsupported']), /Invalid quota/);
  assert.equal((await db.query('select public.reserve_ai_quota($1::uuid, $2, 999) as quota', [own, 'text'])).rows[0].quota.allowed, false);
  assert.equal((await db.query('select public.reserve_ai_quota($1::uuid, $2, 999) as quota', [own, 'image'])).rows[0].quota.allowed, false);
});

test('the unchanged quota migration resets at UTC midnight with a different database timezone', async t => {
  const isolated = new PGlite();
  t.after(() => isolated.close());
  await isolated.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    insert into auth.users values ('${own}');
    -- Replace only the clock dependency in this disposable database, never in
    -- a real project or in the migration, to cross midnight deterministically.
    create or replace function pg_catalog.statement_timestamp()
      returns timestamptz language sql volatile as $$ select current_setting('test.quota_time')::timestamptz $$;
    set timezone = 'America/Argentina/Buenos_Aires';
    set test.quota_time = '2026-10-09 23:59:59+00';`);
  await isolated.exec(await readFile(new URL('../supabase/migrations/202610090001_ai_usage_quotas.sql', import.meta.url), 'utf8'));
  await isolated.exec('set role service_role');
  const reserve = async () => (await isolated.query('select public.reserve_ai_quota($1::uuid, $2, 1) as quota', [own, 'text'])).rows[0].quota;
  assert.deepEqual(await reserve(), { allowed: true, retry_after_seconds: 1 });
  assert.deepEqual(await reserve(), { allowed: false, retry_after_seconds: 1 });
  await isolated.exec(`set test.quota_time = '2026-10-10 00:00:00+00'`);
  assert.deepEqual(await reserve(), { allowed: true, retry_after_seconds: 86400 });
  assert.deepEqual(await reserve(), { allowed: false, retry_after_seconds: 86400 });
  await isolated.exec('reset role');
  const buckets = await isolated.query(`select quota_day::text, used, daily_limit from ai_private.daily_usage order by quota_day`);
  assert.deepEqual(buckets.rows, [
    { quota_day: '2026-10-09', used: 1, daily_limit: 1 },
    { quota_day: '2026-10-10', used: 1, daily_limit: 1 },
  ]);
});

test('missing/invalid config, quota outage and Auth outage block Gemini and remain retryable', async t => {
  const mock = infrastructure(t);
  for (const limit of [undefined, 'NaN', '-1', '1.5']) {
    if (limit === undefined) delete process.env.AI_TEXT_DAILY_LIMIT; else process.env.AI_TEXT_DAILY_LIMIT = limit;
    assert.equal((await mock.request()).status, 503);
  }
  process.env.AI_TEXT_DAILY_LIMIT = '30';
  delete process.env.SUPABASE_AI_SECRET_KEY;
  assert.equal((await mock.request()).status, 503);
  process.env.SUPABASE_AI_SECRET_KEY = 'sb_secret_do_not_log';
  mock.quotaFailure = true;
  assert.equal((await mock.request()).status, 503);
  mock.quotaFailure = false; mock.authFailure = 500;
  assert.equal((await mock.request()).status, 503);
  assert.equal(mock.calls, 0);
  mock.authFailure = undefined;
  assert.equal((await mock.request()).status, 200);
});

test('provider 429/5xx, malformed JSON/schema, network failures and timeouts return controlled errors without secrets', async t => {
  const mock = infrastructure(t);
  const secret = 'private_nutrition gemini_do_not_log sb_secret_do_not_log';
  for (const [provider, status, code] of [
    [async () => new Response(secret, { status: 500 }), 503, 'provider_unavailable'],
    [async () => new Response(secret, { status: 429, headers: { 'Retry-After': '12' } }), 503, 'provider_rate_limited'],
    [async () => { throw new Error(secret); }, 503, 'provider_unavailable'],
    [async () => new Response(secret, { headers: { 'content-type': 'application/json' } }), 502, 'provider_invalid_response'],
    [async () => Response.json({ candidates: [{ content: { parts: [{ text: '{broken' }] } }] }), 502, 'provider_invalid_response'],
    [async () => Response.json({ candidates: [{ content: { parts: [{ text: '{"reply":3,"actions":[]}' }] } }] }), 502, 'provider_invalid_response'],
  ]) {
    mock.provider = provider;
    const response = await mock.request(); const body = await response.json();
    assert.equal(response.status, status); assert.equal(body.code, code);
    assert.ok(!JSON.stringify(body).includes(secret));
  }
  process.env.AI_GEMINI_TIMEOUT_MS = '10';
  mock.provider = (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error(secret))));
  const response = await mock.request();
  assert.equal(response.status, 503); assert.equal((await response.json()).code, 'provider_timeout');
  const logged = mock.logs.join('\n');
  for (const value of ['private_nutrition', 'gemini_do_not_log', 'sb_secret_do_not_log', token, own]) assert.ok(!logged.includes(value));
});

test('invalid requests do not reserve quota; unexpected internal failures produce safe JSON 500', async t => {
  const mock = infrastructure(t);
  for (const body of [{ today: 'invalid' }, { mode: 'invalid' }, { messages: [] }, { attachment: { kind: 'image', data: 'bad' } }]) {
    assert.equal((await mock.request(body)).status, 400);
  }
  assert.equal(mock.reservations.length, 0);
  const oversized = await handler.fetch(new Request('http://localhost/api/ai/chat', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Length': '1' }, body: new Uint8Array(4400001),
  }));
  assert.equal(oversized.status, 400); assert.match((await oversized.json()).error, /tamaño permitido/);
  assert.equal(mock.reservations.length, 0);
  const response = await handler.fetch({ method: 'POST', get headers() { throw new Error('private_internal'); } });
  assert.equal(response.status, 500); assert.equal((await response.json()).code, 'internal_error');
  assert.ok(!mock.logs.join('').includes('private_internal'));
});

test('each corrective Gemini attempt reserves quota; exhausted second attempt cannot return actions', async t => {
  const mock = infrastructure(t); process.env.AI_TEXT_DAILY_LIMIT = '1';
  mock.provider = async () => Response.json({ candidates: [{ content: { parts: [{ text: '{"reply":"¿Me indicás la hora?","actions":[]}' }] } }] });
  const response = await mock.request({ messages: [{ role: 'user', text: 'recién tomé un café', localTime: '10:15' }] });
  assert.equal(response.status, 429); assert.equal(mock.calls, 1);
  assert.equal(mock.reservations.length, 2);
  assert.equal(Object.hasOwn(await response.json(), 'actions'), false);
});
