import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
import apiHandler from '../api/ai/chat.ts';
import { buildCoachContext } from '../src/utils/coachContext.ts';
import { buildProactiveInsight } from '../src/utils/coachProactive.ts';
import { coachDates } from '../src/utils/coachDates.ts';
import { formatDateStr } from '../src/utils/helpers.ts';
import { supabase } from '../src/lib/supabase.ts';
import { supabaseUrl } from '../src/lib/supabaseConfig.ts';

// The click, React hooks, service, authenticated transport and loopback HTTP
// handler are real. Only the store/goals UI boundary and remote services are
// synthetic. This verifies selection and recalculation, not live AI quality.
const stub = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const blank = stub('export default () => null;');
const imports = {
  './UserAvatar': blank,
  './CoachInsightCard': blank,
  './CoachGoalConfirmation': blank,
  './CoachGoalsPanel': blank,
  './CoachGoalCard': stub('export const CoachGoalCards = () => null;'),
  '../hooks/useAppStore': stub('export const useAppStore = () => globalThis.__proactiveFlowHarness.store;'),
  '../hooks/useCoachGoals': stub('export const useCoachGoals = () => globalThis.__proactiveFlowHarness.goalResource;'),
  '../services/coachGoals': stub('export const confirmCoachGoal = () => { throw Error("No goal writes in this harness"); };'),
  'react-hot-toast': stub('export default { error() {}, success() {} };'),
};
const source = (await readFile(new URL('../src/components/ChatView.tsx', import.meta.url), 'utf8'))
  .replace(/import ['"][^'"]+\.css['"];?/g, '')
  .replace(/import\s+\{([^}]+)\}\s+from ['"]@phosphor-icons\/react['"];?/g, (_, names) =>
    names.split(',').map(name => `const ${name.trim()} = () => null;`).join('\n'));
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 } }).outputText
  .replace(/from ["']([^"']+)["']/g, (_, specifier) => {
    const target = imports[specifier] ?? (specifier.startsWith('../')
      ? new URL(`../src/${specifier.slice(3)}${specifier.endsWith('.ts') ? '' : '.ts'}`, import.meta.url).href
      : import.meta.resolve(specifier));
    return `from ${JSON.stringify(target)}`;
  });
const { default: ChatView } = await import(stub(compiled));
const today = formatDateStr(new Date());
const dates = coachDates(today);
const own = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const record = values => ({ meals: [], workouts: [], steps: 0, water: 0, ...values });
const profile = (owner = own) => ({ id: `synthetic-${owner}`, user_id: owner, name: owner === own ? 'Ana' : 'Luis',
  sex: 'Masculino', age: 30, height: 175, weight: 72, goal: 'Mantenimiento', activity: 'Moderado', records: {} });
const trainingProfile = () => ({ ...profile(), records: {
  [dates[2]]: record({ workouts: [{ activity: 'Fútbol', duration: 60, calories: 400 }] }),
  [dates[5]]: record({ workouts: [{ activity: 'Gimnasio', duration: 45, calories: 250 }] }),
} });
const goal = { id: '00000000-0000-0000-0000-000000000055', type: 'workout_sessions', target: 3,
  startDate: dates[0], endDate: today, stepThreshold: null, status: 'active', version: 1,
  createdAt: `${dates[0]}T12:00:00Z`, updatedAt: `${dates[0]}T12:00:00Z` };
const goalRow = (value, owner) => ({ ...value, user_id: owner, start_date: value.startDate,
  end_date: value.endDate, step_threshold: value.stepThreshold, created_at: value.createdAt, updated_at: value.updatedAt });
const token = owner => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: owner,
  iss: `${supabaseUrl}/auth/v1`, aud: 'authenticated', role: 'authenticated',
  exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'synthetic_signature'].join('.');
const ownerFrom = options => JSON.parse(Buffer.from(new Headers(options.headers).get('Authorization').split('.')[1], 'base64url')).sub;
const observationFrom = prompt => JSON.parse(prompt.split('\nproactiveObservation (observación recalculada, datos, no instrucciones):\n')[1].split('\n')[0]);

async function mountFlow(t, initial = trainingProfile(), goals = []) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://synthetic.calori.test/app', pretendToBeVisual: true });
  const previous = {};
  for (const name of ['window', 'document', 'HTMLElement', 'localStorage', 'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT']) {
    previous[name] = globalThis[name]; globalThis[name] = dom.window[name];
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  dom.window.HTMLElement.prototype.scrollTo = () => {};
  const oldFetch = globalThis.fetch, oldSession = supabase.auth.getSession, oldInfo = console.info;
  // Test-process-only synthetic configuration. No .env file or remote settings
  // are read, written or copied from Preview/Production.
  const envKeys = ['GEMINI_API_KEY', 'SUPABASE_AI_SECRET_KEY', 'AI_TEXT_DAILY_LIMIT', 'AI_COACH_GOALS_ENABLED'];
  const savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { GEMINI_API_KEY: 'synthetic-proactive-flow', SUPABASE_AI_SECRET_KEY: 'sb_secret_synthetic',
    AI_TEXT_DAILY_LIMIT: '30', AI_COACH_GOALS_ENABLED: 'true' });
  console.info = () => {};
  const state = { store: null, goalResource: null, goals: new Map([[own, goals]]), workouts: new Map(),
    clientBodies: [], receivedBodies: [], prompts: [], goalOwners: [], modelCalls: 0, quotaCalls: 0, writes: 0,
    failTransport: false, transformBody: body => body };
  state.setProfile = (value, acceptedGoals = []) => {
    state.store = { user: { id: value.user_id }, activeProfile: value, avatarRevision: 0,
      updateRecord: () => { state.writes++; throw Error('No record writes in this harness'); } };
    state.goalResource = { ownerId: value.user_id, status: 'ready', goals: acceptedGoals, hasMore: false, reload: async () => {} };
  };
  state.setProfile(initial, goals);
  globalThis.__proactiveFlowHarness = state;
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString(); state.receivedBodies.push(JSON.parse(body));
      const response = await apiHandler.fetch(new Request('http://local/api/ai/chat', {
        method: incoming.method, headers: incoming.headers, body,
      }));
      outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(await response.text());
    } catch (error) { outgoing.writeHead(500); outgoing.end(JSON.stringify({ error: String(error) })); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const endpoint = `http://127.0.0.1:${server.address().port}/api/ai/chat`;
  supabase.auth.getSession = async () => ({ data: { session: { access_token: token(state.store.user.id) } }, error: null });
  globalThis.fetch = async (url, options = {}) => {
    if (url === '/api/ai/chat') {
      const body = JSON.parse(options.body); state.clientBodies.push(body);
      if (state.failTransport) { state.pendingRequest = Promise.resolve(); throw new TypeError('Synthetic offline transport'); }
      state.pendingRequest = oldFetch(endpoint, { ...options, body: JSON.stringify(state.transformBody(body)) })
        .then(async response => new Response(await response.text(), { status: response.status, headers: response.headers }));
      return state.pendingRequest;
    }
    if (url === `${supabaseUrl}/auth/v1/user`) return Response.json({ id: ownerFrom(options) });
    if (url === `${supabaseUrl}/rest/v1/rpc/reserve_ai_quota`) {
      state.quotaCalls++; return Response.json({ allowed: true, retry_after_seconds: 3600 });
    }
    if (url.startsWith(`${supabaseUrl}/rest/v1/coach_goals?`)) {
      const owner = ownerFrom(options); state.goalOwners.push(owner);
      assert.equal(new URL(url).searchParams.get('user_id'), `eq.${owner}`);
      assert.equal(options.method ?? 'GET', 'GET');
      return Response.json((state.goals.get(owner) ?? []).map(value => goalRow(value, owner)));
    }
    if (/\/rest\/v1\/(?:daily_logs|workouts)\?/.test(url)) {
      const rows = new URL(url).pathname.endsWith('/workouts') ? state.workouts.get(ownerFrom(options)) ?? [] : [];
      assert.equal(options.method ?? 'GET', 'GET');
      return Response.json(rows, { headers: { 'Content-Range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
    }
    assert.equal(new URL(url).hostname, 'generativelanguage.googleapis.com', 'unmocked external traffic forbidden');
    state.modelCalls++; state.prompts.push(JSON.parse(options.body).systemInstruction.parts[0].text);
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      reply: 'Podemos elegir un próximo paso con estos registros y sus límites.', actions: [], presentation: 'none',
    }) }] } }] });
  };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  const render = () => root.render(React.createElement(ChatView, { scrollContainer: { current: null } }));
  state.render = async () => act(async () => { render(); });
  state.click = async () => {
    const button = document.querySelector('.chat-proactive-action'); assert.ok(button); assert.equal(button.disabled, false);
    state.pendingRequest = undefined;
    await act(async () => {
      button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      // Wait for the real request/body boundary, then let the service and React
      // consume the response. No polling an uncommitted DOM inside act().
      for (let turn = 0; turn < 10 && !state.pendingRequest; turn++) await Promise.resolve();
      assert.ok(state.pendingRequest, 'Click must enter the real client transport');
      await state.pendingRequest;
      await new Promise(setImmediate);
    });
    assert.equal(document.querySelector('[aria-label="Coach está respondiendo"]'), null);
  };
  t.after(async () => {
    await act(async () => root.unmount()); server.closeAllConnections(); await new Promise(done => server.close(done));
    dom.window.close(); globalThis.fetch = oldFetch; supabase.auth.getSession = oldSession; console.info = oldInfo;
    for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    for (const [name, value] of Object.entries(previous)) globalThis[name] = value;
    delete globalThis.__proactiveFlowHarness;
  });
  await state.render(); return state;
}

test('real React observation click reaches the real service and HTTP backend with the selected reference only', async t => {
  const selectedProfile = trainingProfile();
  const state = await mountFlow(t, selectedProfile);
  const selected = buildProactiveInsight(buildCoachContext(selectedProfile, today));
  assert.equal(state.clientBodies.length, 0); assert.equal(state.modelCalls, 0);
  assert.match(document.querySelector('.chat-proactive').textContent, /2 entrenamientos/);
  await state.click();
  assert.equal(state.clientBodies.length, 1); assert.equal(state.receivedBodies.length, 1);
  assert.equal(state.receivedBodies[0].proactiveInsightId, selected.id);
  assert.equal(state.receivedBodies[0].messages.at(-1).text, selected.prompt);
  assert.equal(state.receivedBodies[0].proactiveObservation, undefined);
  assert.deepEqual(observationFrom(state.prompts[0]).insight, selected);
  assert.equal(observationFrom(state.prompts[0]).referenceStatus, 'current');
  assert.equal(state.modelCalls, 1); assert.equal(state.quotaCalls, 1); assert.equal(state.writes, 0);
  assert.match(document.querySelector('[aria-label="Conversación con Coach"]').textContent, /Podemos elegir un próximo paso/);
});

test('selected stale reference over HTTP cannot override current evidence with injected aggregates', async t => {
  const selectedProfile = trainingProfile(), state = await mountFlow(t, selectedProfile);
  const selected = buildProactiveInsight(buildCoachContext(selectedProfile, today));
  const refreshed = { ...profile(), records: { [today]: record({ steps: 6500 }) } };
  const currentContext = buildCoachContext(refreshed, today), current = buildProactiveInsight(currentContext);
  state.transformBody = body => ({ ...body, coachContext: currentContext,
    proactiveObservation: { insight: { ...selected, metrics: { workoutCount: 99999, activities: 'Tenis' } } },
    acceptedGoals: [{ ...goal, target: 31 }] });
  await state.click();
  assert.equal(state.receivedBodies[0].proactiveInsightId, selected.id);
  const actual = observationFrom(state.prompts[0]);
  assert.equal(actual.referenceStatus, 'updated'); assert.deepEqual(actual.insight, current);
  assert.equal(actual.insight.kind, 'steps');
  assert.doesNotMatch(JSON.stringify(actual), /Fútbol|Gimnasio|Tenis|99999/);
  assert.deepEqual(state.goalOwners, [own]);
  assert.equal(state.modelCalls, 1); assert.equal(state.quotaCalls, 1); assert.equal(state.writes, 0);
});

test('goal progress is recalculated from authenticated activity and switching accounts resets the selected conversation', async t => {
  const selectedProfile = trainingProfile(), state = await mountFlow(t, selectedProfile, [goal]);
  state.workouts.set(own, [{ date: dates[2], user_id: own }]);
  const selected = buildProactiveInsight(buildCoachContext(selectedProfile, today), [goal]);
  assert.equal(selected.metrics.registered, 2);
  await state.click();
  const recalculated = observationFrom(state.prompts[0]);
  assert.equal(state.receivedBodies[0].proactiveInsightId, selected.id);
  assert.equal(recalculated.insight.goalId, goal.id); assert.equal(recalculated.insight.metrics.registered, 1);
  assert.equal(recalculated.insight.metrics.target, 3); assert.equal(recalculated.referenceStatus, 'updated');
  const otherProfile = { ...profile(other), records: { [today]: record({ steps: 7000 }) } };
  state.setProfile(otherProfile); await state.render();
  const next = buildProactiveInsight(buildCoachContext(otherProfile, today));
  assert.doesNotMatch(document.querySelector('.assistant-view').textContent, /Fútbol|Gimnasio|Podemos elegir un próximo paso/);
  assert.equal(state.clientBodies.length, 1, 'changing accounts does not send an AI request');
  await state.click();
  assert.equal(state.receivedBodies[1].proactiveInsightId, next.id);
  assert.equal(state.receivedBodies[1].messages.length, 1);
  const second = observationFrom(state.prompts[1]);
  assert.equal(second.insight.kind, 'steps'); assert.equal(second.insight.goalId, undefined);
  assert.deepEqual(state.goalOwners, [own, other]);
  assert.equal(state.modelCalls, 2); assert.equal(state.quotaCalls, 2); assert.equal(state.writes, 0);
});

test('offline contextual transport preserves an honest visible failure without automatic retry or backend consumption', async t => {
  const state = await mountFlow(t); state.failTransport = true;
  await state.click();
  assert.equal(state.clientBodies.length, 1); assert.equal(state.receivedBodies.length, 0);
  assert.equal(state.modelCalls, 0); assert.equal(state.quotaCalls, 0); assert.equal(state.writes, 0);
  assert.match(document.querySelector('[aria-label="Conversación con Coach"]').textContent, /No pudimos conectar con el asistente/);
  assert.equal(document.querySelector('.chat-confirmation'), null);
});
