import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
import { calculateDailyExpenditure, formatDateStr } from '../src/utils/helpers.ts';
import chatHandler from '../api/ai/chat.ts';
import goalsHandler from '../api/coach/goals.ts';
import { supabaseUrl } from '../src/lib/supabaseConfig.ts';
import { buildCoachContext } from '../src/utils/coachContext.ts';

// Real React, root entry point, store, navigation and screen event handlers.
// Only persistence/Auth/AI and unrelated visual dependencies are simulated.
const rootDir = fileURLToPath(new URL('../src/', import.meta.url));
const url = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const cache = new Map();
const blank = 'export default () => null;';
const boundaries = {
  'lib/supabase.ts': `export const supabase = { auth: {
    getSession: () => globalThis.__syncHarness.getSession(),
    onAuthStateChange: callback => globalThis.__syncHarness.subscribe(callback)
  } };`,
  'lib/db.ts': ['fetchUserData', 'ensureDailyLog', 'syncAddMeal', 'syncAddWorkout', 'fetchDailyLog',
    'syncDeleteMeal', 'syncDeleteWorkout', 'syncUpdateMeal', 'syncUpdateWorkout', 'syncProfile',
    'syncAvatarPath', 'completeOnboarding', 'deleteUserRecords', 'createRecordIntent', 'createResetIntent',
    'commitRecordIntent', 'fetchRecordSnapshot'].map(name =>
    `export const ${name} = (...args) => globalThis.__syncHarness.db.${name}(...args);`).join('\n'),
  'services/coachGoals.ts': `export class CoachGoalsError extends Error { constructor(message, code) { super(message); this.code=code; } }
    export const confirmCoachGoal = (...args) => globalThis.__syncHarness.confirmGoal(...args);
    export const fetchCoachGoals = (...args) => globalThis.__syncHarness.fetchGoals(...args);`,
  'components/ThemeProvider.tsx': 'export const ThemeProvider = ({children}) => children;',
  'components/Sidebar.tsx': blank,
  'components/ProfileView.tsx': blank,
  'components/AuthModal.tsx': blank,
  'components/LandingPage.tsx': blank,
  'components/Onboarding.tsx': blank,
  'components/ViewSkeleton.tsx': blank,
  'components/UserAvatar.tsx': blank,
  'components/Heatmap.tsx': 'export default props => { globalThis.__syncHarness.historyRecords = props.records; globalThis.__syncHarness.historyProps = props; return null; };',
  'components/MealPhoto.tsx': 'export const MealPhotoPicker = () => null; export const MealThumbnail = () => null;',
};
async function compile(file) {
  if (cache.has(file)) return cache.get(file);
  const relative = path.relative(rootDir, file).replaceAll('\\', '/');
  if (boundaries[relative]) { const result = url(boundaries[relative]); cache.set(file, result); return result; }
  let source = (await readFile(file, 'utf8')).replace(/import ['"][^'"]+\.css['"];?/g, '')
    .replace(/import\s+\{([^}]+)\}\s+from ['"]@phosphor-icons\/react['"];?/g, (_, names) =>
      names.split(',').map(name => `const ${name.trim()} = () => null;`).join('\n'));
  let code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 } }).outputText;
  const specifiers = new Set([...code.matchAll(/(?:from\s+|import\()['"]([^'"]+)['"]/g)].map(match => match[1]));
  for (const specifier of specifiers) {
    let target;
    if (specifier === 'react-hot-toast') target = url('export default { error() {}, success() {} }; export const Toaster = () => null;');
    else if (specifier === 'react-dom/client') target = url(`import {createRoot as realRoot} from ${JSON.stringify(import.meta.resolve(specifier))};
      export const createRoot = (...args) => { const root = realRoot(...args); globalThis.__syncHarness.root = root; return root; };`);
    else if (specifier.startsWith('.')) {
      let dependency = path.resolve(path.dirname(file), specifier);
      if (!path.extname(dependency)) {
        try { await readFile(dependency + '.ts'); dependency += '.ts'; } catch { dependency += '.tsx'; }
      }
      target = await compile(dependency);
      if (dependency === path.join(rootDir, 'services/aiService.ts')) target = url(`export * from ${JSON.stringify(target)};
        export const generateAIResponse = (...args) => globalThis.__syncHarness.ai(...args);`);
    } else target = import.meta.resolve(specifier);
    code = code.replaceAll(`'${specifier}'`, JSON.stringify(target)).replaceAll(`"${specifier}"`, JSON.stringify(target));
  }
  const result = url(code); cache.set(file, result); return result;
}
let instance = 0;
const today = formatDateStr(new Date());
const profile = { id: 'profile-test', user_id: 'user-test', name: 'Test', age: 30, sex: 'Masculino',
  weight: 70, height: 170, goal: 'Mantenimiento', activity: 'Moderado', onboarding_completed: true,
  recordProtocol: 'atomic', recordGeneration: '10000000-0000-4000-8000-000000000001', records: {} };
const turn = () => new Promise(setImmediate);
async function mountApp(t, actions, fail = false, setup) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://calori.test/app', pretendToBeVisual: true });
  const savedGlobals = {};
  for (const name of ['window', 'document', 'HTMLElement', 'MutationObserver', 'localStorage', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    savedGlobals[name] = globalThis[name]; globalThis[name] = dom.window[name];
  }
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  dom.window.scrollTo = () => {};
  // JSDOM models the element but does not implement the native top layer.
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  dom.window.HTMLElement.prototype.scrollTo = () => {};
  const state = { reads: 0, logWrites: 0, mealWrites: 0, workoutWrites: 0, persisted: null,
    historyRecords: {}, listeners: new Set(), aiCalls: 0, currentProfile: profile, version: 0,
    generation: profile.recordGeneration, recordAttempts: [], recordFailures: 0 };
  state.goals = [];
  state.goalOwner = profile.user_id;
  state.goalReads = 0;
  state.fetchGoals = async owner => { state.goalReads++; return { goals: structuredClone(owner === state.goalOwner ? state.goals : []), hasMore: false }; };
  let release;
  const writeGate = new Promise(resolve => { release = resolve; });
  state.release = release;
  state.getSession = async () => ({ data: { session: { user: { id: state.currentProfile.user_id } } } });
  state.subscribe = callback => { state.listeners.add(callback); return { data: { subscription: {
    unsubscribe: () => state.listeners.delete(callback) } } }; };
  state.ai = async () => { state.aiCalls++; return { reply: 'Revisá esta propuesta.', actions, presentation: 'none',
    ...(state.goalProposal ? { goalProposal: state.goalProposal } : {}) }; };
  state.db = {
    fetchUserData: async () => { state.reads++; return structuredClone({ ...state.currentProfile,
      recordGeneration: state.persistedUser === state.currentProfile.user_id ? state.generation : profile.recordGeneration,
      records: state.persisted && state.persistedUser === state.currentProfile.user_id ? { [today]: state.persisted } : {} }); },
    createRecordIntent: record => ({kind: 'save', operationId: crypto.randomUUID(), date: record.dateStr,
      generation: record.generation, expectedVersion: record.version ?? null,
      record: structuredClone(record), fingerprint: JSON.stringify(record)}),
    createResetIntent: generation => ({kind: 'reset', operationId: crypto.randomUUID(), generation, fingerprint: 'reset'}),
    commitRecordIntent: async (owner, intent) => {
      state.logWrites++;
      state.recordAttempts.push({ owner, intent: structuredClone(intent) });
      if (!state.skipWriteGate) await writeGate;
      if (fail || state.recordFailures > 0) {
        state.recordFailures = Math.max(0, state.recordFailures - 1);
        throw Object.assign(new Error('No se pudo completar el guardado'), {kind: 'invalid'});
      }
      const previous = state.persistedUser === owner ? state.persisted : null;
      const record = structuredClone(intent.record);
      state.mealWrites += record.meals.filter(entry => !previous?.meals.some(saved => saved.id === entry.id)).length;
      state.workoutWrites += record.workouts.filter(entry => !previous?.workouts.some(saved => saved.id === entry.id)).length;
      state.persistedUser = owner;
      state.generation = crypto.randomUUID();
      state.persisted = {...record, version: String(++state.version), generation: state.generation};
      return {operation_id: intent.operationId, day_id: '20000000-0000-4000-8000-000000000001',
        version: state.persisted.version, generation: state.generation};
    },
    fetchRecordSnapshot: async owner => ({protocol: 'atomic',
      generation: state.persistedUser === owner ? state.generation : profile.recordGeneration,
      records: state.persistedUser === owner ? {[state.persisted.dateStr]: structuredClone(state.persisted)} : {}}),
  };
  if(setup) setup(state);
  globalThis.__syncHarness = state;
  t.after(async () => {
    await act(async () => state.root.unmount()); dom.window.close();
    for (const [name, value] of Object.entries(savedGlobals)) globalThis[name] = value;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct;
  });
  const main = await compile(path.join(rootDir, 'main.tsx'));
  const mountId = instance;
  instance += 1;
  await act(async () => { await import(main + `#mount-${mountId}`); await turn(); });
  state.document = dom.window.document;
  state.initialReads = state.reads;
  return state;
}
async function click(state, label) {
  const button = [...state.document.querySelectorAll('button')].find(element => element.textContent.trim() === label || element.getAttribute('aria-label') === label);
  assert.ok(button, `Missing button: ${label}`);
  await act(async () => { button.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await turn(); });
}
async function sendActions(state, hasProposal = true, text = 'Registrá estos datos de prueba.') {
  await click(state, 'Coach');
  await act(async () => {
    const input = state.document.querySelector('textarea'); assert.ok(input);
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(input, text);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await act(async () => { state.document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await turn(); });
  if (hasProposal) {
    assert.ok(state.document.querySelector('.chat-confirmation'));
    assert.equal(state.logWrites, 0);
  }
}
const meal = { type: 'add_meal', estimated: true, payload: { dateStr: today, name: 'Comida de prueba', type: 'Almuerzo', calories: 500, time: '12:30' } };

function proposalField(state, index, text) {
  const proposal = state.document.querySelectorAll('.chat-proposal-item')[index];
  assert.ok(proposal, `Missing proposal ${index}`);
  const label = [...proposal.querySelectorAll('.chat-proposal-edit label')].find(element =>
    [...element.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join('').trim() === text);
  assert.ok(label, `Missing proposal field: ${text}`);
  return label.querySelector('input, select, textarea');
}
async function changeProposalField(state, index, text, value) {
  await act(async () => {
    const field = proposalField(state, index, text);
    const prototype = field.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
      : field.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
    field.dispatchEvent(new window.Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    await turn();
  });
}
function confirmationButton(state) {
  const button = [...state.document.querySelectorAll('.chat-proposal-actions button')].find(element => element.textContent === 'Confirmar');
  assert.ok(button, 'Missing proposal confirmation');
  return button;
}
const conversationMessages = state => JSON.parse(state.document.defaultView.localStorage.getItem(`calori:assistant:messages:${profile.user_id}:${today}`) || '[]');

test('generic Coach meal titles use each meal description consistently through confirmation, Home, history data and detail editing', async t => {
  const descriptions = ['Milanesa con papas y cerveza', 'Sorrentinos con salsa'];
  const actions = descriptions.map((details, index) => ({ ...meal, payload: { ...meal.payload,
    name: index ? 'Cena' : 'Almuerzo', type: index ? 'Cena' : 'Almuerzo', time: index ? '21:00' : '13:00',
    calories: index ? 650 : 900, details } }));
  const original = structuredClone(actions);
  const state = await mountApp(t, actions, false, current => { current.skipWriteGate = true; });
  await sendActions(state, true, 'Registrá mi almuerzo y mi cena.');
  assert.deepEqual([...state.document.querySelectorAll('.chat-proposal-name')].map(element => element.textContent), descriptions);
  assert.deepEqual(actions, original, 'Preparing a title must not mutate the received action or its complete description');
  assert.equal(state.aiCalls, 1); assert.equal(state.logWrites, 0);
  await click(state, 'Confirmar');
  assert.equal(state.document.querySelector('.chat-confirmation'), null);
  assert.deepEqual(state.persisted.meals.map(entry => entry.name), descriptions);
  assert.deepEqual(state.persisted.meals.map(entry => entry.details), descriptions);
  const receipt = state.document.querySelector('.chat-saved').textContent;
  for (const description of descriptions) assert.ok(receipt.includes(description));
  await click(state, 'Inicio');
  assert.deepEqual([...state.document.querySelectorAll('.daily-record-title')].map(element => element.textContent), descriptions);
  assert.deepEqual(state.historyRecords[today].meals.map(entry => entry.name), descriptions);
  const firstRow = state.document.querySelector('.daily-record-open');
  await act(async () => { firstRow.click(); await turn(); });
  assert.equal(state.document.querySelector('.record-detail-main').textContent, descriptions[0]);
  assert.equal(state.document.querySelector('.record-detail-details').textContent, descriptions[0]);
  await click(state, 'Editar');
  assert.equal(state.document.querySelector('#edit-meal-description').value, descriptions[0]);
  assert.equal(state.document.querySelector('#edit-meal-notes').value, descriptions[0]);
  assert.equal(state.mealWrites, 2); assert.equal(state.logWrites, 1); assert.equal(state.aiCalls, 1);
});

test('a manually chosen generic meal name and its category survive navigation and a failed save without being generated again', async t => {
  t.mock.method(console, 'error', () => {});
  const originalDetails = 'Milanesa con papas y cerveza';
  const state = await mountApp(t, [{ ...meal, payload: { ...meal.payload, name: 'Almuerzo', details: originalDetails } }], false,
    current => { current.skipWriteGate = true; current.recordFailures = 1; });
  await sendActions(state); await click(state, 'Editar');
  await changeProposalField(state, 0, 'Nombre de la comida', 'Cena');
  await changeProposalField(state, 0, 'Tipo', 'Merienda');
  await changeProposalField(state, 0, 'Detalles', originalDetails + '\nLa mitad de las papas.');
  await click(state, 'Perfil'); await click(state, 'Datos'); await click(state, 'Inicio'); await click(state, 'Coach');
  assert.equal(proposalField(state, 0, 'Nombre de la comida').value, 'Cena');
  assert.equal(proposalField(state, 0, 'Tipo').value, 'Merienda');
  assert.equal(proposalField(state, 0, 'Detalles').value, originalDetails + '\nLa mitad de las papas.');
  await click(state, 'Confirmar');
  assert.equal(state.persisted, null); assert.equal(state.recordAttempts.length, 1);
  const first = state.recordAttempts[0].intent.record.meals[0];
  await click(state, 'Inicio'); await click(state, 'Coach');
  assert.equal(proposalField(state, 0, 'Nombre de la comida').value, 'Cena');
  await click(state, 'Confirmar');
  const saved = state.persisted.meals[0];
  assert.equal(saved.id, first.id);
  assert.equal(saved.name, 'Cena', 'An explicit user title is authoritative, even when it also names a category');
  assert.equal(saved.type, 'Merienda');
  assert.equal(saved.details, originalDetails + '\nLa mitad de las papas.');
  assert.match(state.document.querySelector('.chat-saved').textContent, /Cena · Merienda · 500 kcal/);
  await click(state, 'Inicio');
  assert.equal(state.document.querySelector('.daily-record-title').textContent, 'Cena');
  assert.equal(state.mealWrites, 1); assert.equal(state.logWrites, 2); assert.equal(state.aiCalls, 1);
});

test('a meal without a recoverable title keeps its proposal and notes, requests a name and cannot save an empty title', async t => {
  const state = await mountApp(t, [{ ...meal, payload: { ...meal.payload, name: 'Comida', details: 'Porción mediana' } }], false,
    current => { current.skipWriteGate = true; });
  await sendActions(state);
  const field = proposalField(state, 0, 'Nombre de la comida');
  assert.equal(field.value, '');
  assert.equal(field.getAttribute('aria-invalid'), 'true');
  assert.match(state.document.querySelector('.chat-confirmation').textContent, /Completá el nombre con los alimentos o bebidas que registraste/);
  assert.equal(proposalField(state, 0, 'Detalles').value, 'Porción mediana');
  await click(state, 'Confirmar');
  assert.equal(state.logWrites, 0); assert.ok(state.document.querySelector('.chat-confirmation'));
  await click(state, 'Datos'); await click(state, 'Coach');
  assert.equal(proposalField(state, 0, 'Nombre de la comida').value, '');
  assert.equal(proposalField(state, 0, 'Detalles').value, 'Porción mediana');
  assert.equal(proposalField(state, 0, 'Calorías (kcal)').value, '500');
  await changeProposalField(state, 0, 'Nombre de la comida', 'Tostadas con queso');
  assert.notEqual(proposalField(state, 0, 'Nombre de la comida').getAttribute('aria-invalid'), 'true');
  await click(state, 'Confirmar');
  assert.equal(state.persisted.meals[0].name, 'Tostadas con queso');
  assert.equal(state.persisted.meals[0].details, 'Porción mediana');
  assert.equal(state.persisted.meals[0].calories, 500);
  assert.equal(state.mealWrites, 1); assert.equal(state.logWrites, 1); assert.equal(state.aiCalls, 1);
});

async function readOlderCoachMessages(state) {
  // Let the remount restore its position before the reader deliberately scrolls up.
  await act(async () => { await new Promise(resolve => window.requestAnimationFrame(resolve)); });
  const log = state.document.querySelector('.chat-messages'); assert.ok(log);
  // JSDOM has no layout; these dimensions model a reader well above the end.
  Object.defineProperties(log, {
    scrollHeight: { value: 2000, configurable: true },
    clientHeight: { value: 500, configurable: true },
  });
  const scrollCalls = [];
  log.scrollTo = ({ top }) => { scrollCalls.push(top); log.scrollTop = top; };
  await act(async () => {
    log.scrollTop = 150;
    log.dispatchEvent(new window.Event('scroll', { bubbles: true }));
    await turn();
  });
  return { log, scrollCalls };
}

// These tests cross the real App boundary: Coach is absent while another tab is active.
// They exercise proposal ownership and asynchronous writes independently of its mounted view.
test('an unconfirmed Coach meal survives Inicio, Perfil and Datos without replaying AI or writing records', async t => {
  const state = await mountApp(t, [meal]);
  await sendActions(state);
  const original = state.document.querySelector('.chat-confirmation').textContent;
  for (const tab of ['Inicio', 'Perfil', 'Datos']) {
    await click(state, tab);
    assert.equal(state.document.querySelector('.chat-confirmation'), null, 'Coach must leave the active DOM');
    await click(state, 'Coach');
    assert.equal(state.document.querySelector('.chat-confirmation')?.textContent, original);
    assert.equal(confirmationButton(state).disabled, false);
  }
  assert.equal(state.aiCalls, 1); assert.equal(state.logWrites, 0);
  assert.equal(state.mealWrites, 0); assert.equal(state.workoutWrites, 0);
});

test('a late AI proposal finishes in the account session while Coach is unmounted without an extra request or save', async t => {
  let resolveResponse;
  const response = new Promise(resolve => { resolveResponse = resolve; });
  const state = await mountApp(t, [meal], false, current => {
    current.ai = async () => { current.aiCalls++; return response; };
  });
  await sendActions(state, false);
  await click(state, 'Inicio'); await click(state, 'Coach');
  assert.ok(state.document.querySelector('[aria-label="Coach está respondiendo"]'));
  assert.equal(state.document.querySelector('button[aria-label="Enviar mensaje"]').disabled, true);
  await click(state, 'Datos');
  await act(async () => { resolveResponse({ reply: 'Revisá esta propuesta.', actions: [meal], presentation: 'none' }); await turn(); });
  await click(state, 'Coach');
  assert.match(state.document.querySelector('.chat-confirmation')?.textContent ?? '', /Comida de prueba/);
  assert.equal(state.document.querySelector('[aria-label="Coach está respondiendo"]'), null);
  assert.equal(state.aiCalls, 1); assert.equal(state.logWrites, 0);
});

test('a late AI response preserves older-message reading after Coach remounts', async t => {
  let resolveResponse;
  const response = new Promise(resolve => { resolveResponse = resolve; });
  const state = await mountApp(t, [], false, current => {
    current.ai = async () => { current.aiCalls++; return response; };
    localStorage.setItem(`calori:assistant:messages:${profile.user_id}:${today}`, JSON.stringify([
      { id: 'earlier-message', role: 'bot', text: 'Conversación anterior conservada.' },
    ]));
  });
  await sendActions(state, false, 'Revisá mis registros.');
  await click(state, 'Inicio'); await click(state, 'Coach');
  const { log, scrollCalls } = await readOlderCoachMessages(state);
  await act(async () => {
    resolveResponse({ reply: 'Respuesta que llegó después de volver.', actions: [], presentation: 'none' });
    await turn();
    await new Promise(resolve => window.requestAnimationFrame(resolve));
  });
  assert.equal(state.document.querySelector('.chat-messages'), log);
  assert.match(log.textContent, /Conversación anterior conservada/);
  assert.match(log.textContent, /Respuesta que llegó después de volver/);
  assert.equal(log.scrollTop, 150);
  assert.deepEqual(scrollCalls, [], 'The current reader decides whether to follow a response from an older view');
  assert.equal(state.document.querySelector('[aria-label="Coach está respondiendo"]'), null);
  assert.equal(state.aiCalls, 1); assert.equal(state.logWrites, 0);
});

test('an AI response from a previous authentication epoch cannot restore a proposal after signing in again', async t => {
  let resolveResponse;
  const response = new Promise(resolve => { resolveResponse = resolve; });
  const state = await mountApp(t, [meal], false, current => {
    current.ai = async () => { current.aiCalls++; return response; };
  });
  await sendActions(state, false);
  await act(async () => { for (const listener of state.listeners) listener('SIGNED_OUT', null); await turn(); });
  await act(async () => { for (const listener of state.listeners) listener('SIGNED_IN', { user: { id: profile.user_id } }); await turn(); });
  await click(state, 'Coach');
  await act(async () => { resolveResponse({ reply: 'Respuesta de la sesión anterior.', actions: [meal], presentation: 'none' }); await turn(); });
  assert.equal(state.document.querySelector('.chat-confirmation'), null);
  assert.doesNotMatch(state.document.querySelector('.chat-messages').textContent, /Respuesta de la sesión anterior/);
  assert.equal(state.document.querySelector('[aria-label="Coach está respondiendo"]'), null);
  assert.equal(state.aiCalls, 1); assert.equal(state.logWrites, 0);
});

test('edited meal and workout proposals retain every field and edit mode across tabs without saving', async t => {
  const workout = { type: 'add_workout', estimated: true, payload: { dateStr: today,
    activity: 'Actividad de prueba', duration: 30, calories: 200, time: '17:00', details: '' } };
  const state = await mountApp(t, [meal, workout]);
  await sendActions(state); await click(state, 'Editar');
  const fields = [[0, 'Nombre de la comida', 'Almuerzo corregido'], [0, 'Calorías (kcal)', '482'], [0, 'Hora', '13:45'],
    [0, 'Tipo', 'Snack'], [0, 'Detalles', 'Una porción\nSin aderezo'], [1, 'Actividad', 'Caminata editada'],
    [1, 'Duración (min)', '45'], [1, 'Calorías (kcal)', '175'], [1, 'Hora', '18:05'],
    [1, 'Distancia (km, opcional)', '2.35'], [1, 'Ritmo (min/km, opcional)', '19:08'],
    [1, 'Detalles', 'Primera vuelta\nSegunda vuelta']];
  for (const [index, field, value] of fields) await changeProposalField(state, index, field, value);
  await click(state, 'Perfil'); await click(state, 'Datos'); await click(state, 'Inicio'); await click(state, 'Coach');
  for (const [index, field, value] of fields) assert.equal(proposalField(state, index, field).value, value);
  assert.equal(state.document.querySelectorAll('.chat-proposal-edit').length, 2);
  assert.equal(state.logWrites, 0); assert.equal(state.aiCalls, 1);
});

test('incomplete proposal edits survive navigation and can be completed before one explicit confirmation', async t => {
  const state = await mountApp(t, [meal]);
  await sendActions(state); await click(state, 'Editar');
  await changeProposalField(state, 0, 'Nombre de la comida', '');
  await changeProposalField(state, 0, 'Calorías (kcal)', '');
  await click(state, 'Inicio'); await click(state, 'Coach');
  assert.equal(proposalField(state, 0, 'Nombre de la comida').value, '');
  assert.equal(proposalField(state, 0, 'Calorías (kcal)').value, '');
  await click(state, 'Confirmar');
  assert.equal(state.logWrites, 0, 'Restoration must not normalize an incomplete edit into a valid write');
  await changeProposalField(state, 0, 'Nombre de la comida', 'Comida completada');
  await changeProposalField(state, 0, 'Calorías (kcal)', '350');
  await click(state, 'Confirmar');
  assert.equal(state.logWrites, 1);
  await act(async () => { state.release(); await turn(); });
  assert.equal(state.persisted.meals[0].name, 'Comida completada');
  assert.equal(state.persisted.meals[0].calories, 350);
  assert.equal(state.mealWrites, 1); assert.equal(state.document.querySelector('.chat-confirmation'), null);
});

test('cancelling a resumed edited proposal removes it permanently from that conversation without a write', async t => {
  const state = await mountApp(t, [meal]);
  await sendActions(state); await click(state, 'Editar');
  await changeProposalField(state, 0, 'Nombre de la comida', 'Borrador para cancelar');
  await click(state, 'Datos'); await click(state, 'Coach');
  await click(state, 'Cancelar');
  await click(state, 'Perfil'); await click(state, 'Coach');
  assert.equal(state.document.querySelector('.chat-confirmation'), null);
  assert.equal(conversationMessages(state).filter(message => message.text === 'Registro cancelado.').length, 1);
  assert.equal(state.logWrites, 0); assert.equal(state.aiCalls, 1);
});

test('returning before a proposal save acknowledgement keeps confirmation busy and prevents a duplicate write', async t => {
  const state = await mountApp(t, [meal]);
  await sendActions(state); await click(state, 'Editar');
  await changeProposalField(state, 0, 'Calorías (kcal)', '650');
  await click(state, 'Confirmar');
  assert.equal(state.logWrites, 1);
  await click(state, 'Inicio'); await click(state, 'Coach');
  assert.equal(state.document.querySelector('.chat-confirmation')?.getAttribute('aria-busy'), 'true');
  assert.equal(confirmationButton(state).disabled, true);
  assert.equal(proposalField(state, 0, 'Calorías (kcal)').disabled, true, 'The pending write cannot discard a newer field edit');
  await act(async () => { confirmationButton(state).click(); confirmationButton(state).click(); await turn(); });
  assert.equal(state.logWrites, 1); assert.equal(state.persisted, null);
  await act(async () => { state.release(); await turn(); });
  assert.equal(state.document.querySelector('.chat-confirmation'), null);
  assert.equal(state.persisted.meals[0].calories, 650);
  assert.equal(conversationMessages(state).filter(message => message.recordedActions?.length).length, 1);
  assert.equal(state.mealWrites, 1); assert.equal(state.logWrites, 1);
});

test('a late save acknowledgement preserves older-message reading after Coach remounts', async t => {
  const state = await mountApp(t, [meal]);
  await sendActions(state); await click(state, 'Confirmar');
  await click(state, 'Inicio'); await click(state, 'Coach');
  const { log, scrollCalls } = await readOlderCoachMessages(state);
  await act(async () => {
    state.release(); await turn();
    await new Promise(resolve => window.requestAnimationFrame(resolve));
  });
  assert.equal(state.document.querySelector('.chat-messages'), log);
  assert.match(log.textContent, /Registrado hoy/);
  assert.equal(log.scrollTop, 150);
  assert.deepEqual(scrollCalls, [], 'The receipt must respect the remounted reader instead of following the old view');
  assert.equal(state.document.querySelector('.chat-confirmation'), null);
  assert.equal(state.logWrites, 1); assert.equal(state.mealWrites, 1);
  assert.equal(conversationMessages(state).filter(message => message.recordedActions?.length).length, 1);
});

test('an acknowledgement received outside Coach removes the proposal and retains replay provenance on return', async t => {
  const state = await mountApp(t, [meal]);
  await sendActions(state); await click(state, 'Confirmar'); await click(state, 'Datos');
  await act(async () => { state.release(); await turn(); });
  await click(state, 'Coach');
  assert.equal(state.document.querySelector('.chat-confirmation'), null);
  const receipts = conversationMessages(state).filter(message => message.recordedActions?.length);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].recordedActions[0].entryId, state.persisted.meals[0].id);
  assert.match(state.document.querySelector('.chat-messages').textContent, /Registrado hoy/);
  await inputValue(state, 'textarea[aria-label="Mensaje para Coach"]', 'Repetí la propuesta para revisarla.');
  await act(async () => { state.document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await turn(); });
  assert.match(state.document.querySelector('.chat-already-recorded')?.textContent ?? '', /Ya registrado/);
  assert.equal(confirmationButton(state).disabled, true, 'An identical proposal is excluded unless explicitly selected again');
  assert.equal(state.logWrites, 1); assert.equal(state.mealWrites, 1); assert.equal(state.aiCalls, 2);
});

test('a failed offscreen confirmation retains the edited proposal and entry IDs for a successful explicit retry', async t => {
  t.mock.method(console, 'error', () => {});
  const state = await mountApp(t, [meal], false, current => { current.recordFailures = 1; });
  await sendActions(state); await click(state, 'Editar');
  await changeProposalField(state, 0, 'Nombre de la comida', 'Borrador conservado');
  await changeProposalField(state, 0, 'Calorías (kcal)', '571');
  await changeProposalField(state, 0, 'Detalles', 'Primera línea\nSegunda línea');
  await click(state, 'Confirmar'); await click(state, 'Perfil');
  await act(async () => { state.release(); await turn(); });
  await click(state, 'Coach');
  assert.equal(proposalField(state, 0, 'Nombre de la comida').value, 'Borrador conservado');
  assert.equal(proposalField(state, 0, 'Calorías (kcal)').value, '571');
  assert.equal(proposalField(state, 0, 'Detalles').value, 'Primera línea\nSegunda línea');
  assert.match(state.document.querySelector('.chat-messages').textContent, /No se pudo completar el guardado/);
  assert.equal(confirmationButton(state).disabled, false);
  assert.equal(state.persisted, null); assert.equal(state.logWrites, 1);
  const firstId = state.recordAttempts[0].intent.record.meals[0].id;
  await click(state, 'Confirmar');
  assert.equal(state.recordAttempts[1].intent.record.meals[0].id, firstId);
  assert.equal(state.persisted.meals[0].id, firstId);
  assert.equal(state.persisted.meals[0].calories, 571);
  assert.equal(state.mealWrites, 1); assert.equal(state.logWrites, 2);
  assert.equal(state.document.querySelector('.chat-confirmation'), null);
  assert.equal(conversationMessages(state).filter(message => message.recordedActions?.length).length, 1);
});

test('pending proposals are isolated by account and are not restored after ending that authenticated session', async t => {
  const state = await mountApp(t, [meal]);
  await sendActions(state);
  state.currentProfile = { ...profile, id: 'profile-other', user_id: 'user-other' };
  await act(async () => {
    for (const listener of state.listeners) listener('SIGNED_IN', { user: { id: state.currentProfile.user_id } });
    await turn();
  });
  await click(state, 'Coach');
  assert.equal(state.document.querySelector('.chat-confirmation'), null);
  assert.doesNotMatch(state.document.querySelector('.chat-messages').textContent, /Comida de prueba|Revisá esta propuesta/);
  state.currentProfile = profile;
  await act(async () => {
    for (const listener of state.listeners) listener('SIGNED_IN', { user: { id: profile.user_id } });
    await turn();
  });
  await click(state, 'Coach');
  assert.equal(state.document.querySelector('.chat-confirmation'), null);
  assert.equal(state.logWrites, 0); assert.equal(state.aiCalls, 1);
});

test('a stale confirmation cannot append a receipt into a newly authenticated session of the same account', async t => {
  const state = await mountApp(t, [meal]);
  await sendActions(state); await click(state, 'Confirmar');
  await act(async () => {
    for (const listener of state.listeners) listener('SIGNED_OUT', null);
    await turn();
  });
  await act(async () => {
    for (const listener of state.listeners) listener('SIGNED_IN', { user: { id: profile.user_id } });
    await turn();
  });
  await click(state, 'Coach');
  assert.equal(state.document.querySelector('.chat-confirmation'), null);
  await act(async () => { state.release(); await turn(); });
  assert.doesNotMatch(state.document.querySelector('.chat-messages').textContent, /Registrado hoy|No se pudo confirmar el guardado/);
  assert.equal(conversationMessages(state).filter(message => message.recordedActions?.length).length, 0);
  assert.equal(state.persistedUser, profile.user_id); assert.equal(state.logWrites, 1);
});

test('a proposal created today for a past entry day keeps its target date across navigation and confirmation', async t => {
  const date = new Date(today + 'T12:00:00'); date.setDate(date.getDate() - 1);
  const target = formatDateStr(date);
  const state = await mountApp(t, [{ ...meal, payload: { ...meal.payload, dateStr: target } }]);
  await sendActions(state);
  const originalDate = state.document.querySelector('.chat-proposal-date').textContent;
  await click(state, 'Inicio'); await click(state, 'Coach');
  assert.equal(state.document.querySelector('.chat-proposal-date')?.textContent, originalDate);
  await click(state, 'Confirmar');
  await act(async () => { state.release(); await turn(); });
  assert.equal(state.persisted.dateStr, target);
  const receipts = conversationMessages(state).flatMap(message => message.recordedActions ?? []);
  assert.equal(receipts.length, 1); assert.equal(receipts[0].dateStr, target);
  assert.equal(state.logWrites, 1); assert.equal(state.mealWrites, 1);
});

test('an incomplete pending proposal remains read-only in yesterday’s conversation after midnight and can be cancelled without writing', async t => {
  const beforeMidnight = new Date(today + 'T23:59:00');
  const afterMidnight = new Date(beforeMidnight); afterMidnight.setDate(afterMidnight.getDate() + 1); afterMidnight.setHours(0, 1, 0, 0);
  t.mock.timers.enable({ apis: ['Date'], now: beforeMidnight });
  const state = await mountApp(t, [meal]);
  await sendActions(state); await click(state, 'Editar');
  await changeProposalField(state, 0, 'Nombre de la comida', 'Borrador de ayer');
  await changeProposalField(state, 0, 'Calorías (kcal)', '');
  const originalTarget = state.document.querySelector('.chat-proposal-date').textContent;
  await act(async () => {
    t.mock.timers.setTime(afterMidnight.getTime());
    window.dispatchEvent(new window.Event('focus'));
    await turn();
  });
  assert.equal(state.document.querySelector('.chat-confirmation'), null, 'A pending proposal cannot silently migrate into today');
  const openYesterday = async () => {
    await click(state, 'Historial');
    await act(async () => {
      const select = state.document.querySelector('.chat-history-picker select');
      assert.ok(select);
      assert.ok([...select.options].some(option => option.value === today));
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(select, today);
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
      await turn();
    });
  };
  await openYesterday();
  assert.equal(state.document.querySelector('.chat-proposal-date').textContent, originalTarget);
  assert.equal(proposalField(state, 0, 'Nombre de la comida').value, 'Borrador de ayer');
  assert.equal(proposalField(state, 0, 'Calorías (kcal)').value, '');
  const editor = state.document.querySelector('.chat-proposal-edit');
  assert.ok([...editor.querySelectorAll('input, select, textarea')].every(field => field.disabled));
  assert.equal(confirmationButton(state).disabled, true);
  const edit = [...state.document.querySelectorAll('.chat-proposal-actions button')].find(button => button.textContent === 'Editar');
  assert.equal(edit.disabled, true);
  assert.match(state.document.querySelector('.chat-proposal-footnote').textContent, /no está confirmado.*solo lectura/);
  await act(async () => { confirmationButton(state).click(); edit.click(); await turn(); });
  assert.equal(state.logWrites, 0);
  await click(state, 'Cancelar');
  assert.equal(state.document.querySelector('.chat-confirmation'), null);
  await click(state, 'Volver a hoy'); await openYesterday();
  assert.equal(state.document.querySelector('.chat-confirmation'), null);
  assert.equal(conversationMessages(state).filter(message => message.text === 'Registro cancelado.').length, 1);
  assert.equal(state.logWrites, 0); assert.equal(state.aiCalls, 1);
});

test('activity exploration and the explicitly opened day survive real App tab navigation without writes', async t => {
  const state = await mountApp(t, []);
  const date = new Date(today + 'T12:00:00'); date.setDate(date.getDate() - 40);
  const explored = formatDateStr(date);
  const history = { view: 'month', dateStr: explored, anchor: explored };
  await act(async () => { state.historyProps.onHistoryStateChange(history); await turn(); });
  assert.equal(state.document.querySelector('.daily-active-date').dateTime, today, 'Exploration cannot retarget the record writer');
  await act(async () => { state.historyProps.onSelectDate(explored); await turn(); });
  assert.equal(state.document.querySelector('.daily-active-date').dateTime, explored);
  await click(state, 'Datos'); await click(state, 'Coach'); await click(state, 'Inicio');
  assert.deepEqual(state.historyProps.historyState, history);
  assert.equal(state.document.querySelector('.daily-active-date').dateTime, explored);
  assert.ok(state.document.querySelector('.history-record-return'));
  assert.equal(state.logWrites, 0);
});

test('activity presentation context from one account is not passed to a different authenticated owner', async t => {
  const state = await mountApp(t, []);
  const history = { view: 'year', dateStr: '2025-10-05', anchor: '2025-10-05' };
  await act(async () => { state.historyProps.onHistoryStateChange(history); await turn(); });
  await click(state, 'Datos');
  state.currentProfile = { ...profile, id: 'other-profile', user_id: 'other-owner' };
  await act(async () => {
    for (const listener of state.listeners) listener('SIGNED_IN', { user: { id: 'other-owner' } });
    await turn();
  });
  assert.notDeepEqual(state.historyProps.historyState, history);
  assert.equal(state.historyProps.historyState.dateStr, today);
  assert.equal(state.historyProps.historyState.view, 'month');
  assert.equal(state.document.querySelector('.daily-active-date').dateTime, today);
  assert.equal(state.logWrites, 0);
});

test('leaving Inicio cannot silently discard an active entry draft', async t => {
  const state = await mountApp(t, []);
  await click(state, 'Agregar comida');
  await inputValue(state, '#add-meal-description', 'Borrador que debe conservarse');
  await click(state, 'Datos');
  assert.equal(state.document.querySelector('#add-meal-description')?.value, 'Borrador que debe conservarse');
  assert.equal(state.document.querySelector('.charts-insights'), null, 'Finish or close the draft before changing sections');
  assert.equal(state.logWrites, 0);
  await click(state, 'Cancelar');
  assert.equal(state.document.activeElement.textContent, 'Seguir editando');
  await click(state, 'Seguir editando');
  assert.equal(state.document.querySelector('#add-meal-description')?.value, 'Borrador que debe conservarse');
  await click(state, 'Cancelar');
  await click(state, 'Descartar cambios');
  assert.equal(state.document.querySelector('#add-meal-description'), null);
  await click(state, 'Datos');
  assert.ok(state.document.querySelector('.charts-insights'));
  assert.equal(state.logWrites, 0);
});

test('confirming a Coach meal publishes the saved record to Inicio, Datos and history without reloading', async t => {
  const state = await mountApp(t, [meal]);
  await sendActions(state);
  const confirm = [...state.document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Confirmar');
  // Two clicks in the same React batch exercise the synchronous busy guard.
  await act(async () => {
    confirm.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    confirm.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await turn();
  });
  assert.equal(state.logWrites, 1); assert.equal(state.mealWrites, 0);
  assert.ok(!state.document.querySelector('.chat-messages').textContent.includes('Registrado hoy'));
  await act(async () => { state.release(); await turn(); });
  assert.match(state.document.querySelector('.chat-messages').textContent, /Registrado hoy/);
  await click(state, 'Inicio');
  assert.match(state.document.querySelector('.home-variants').textContent, /Calorías consumidas500 kcal/);
  const balance = 500 - calculateDailyExpenditure(profile, state.persisted);
  assert.ok(state.document.querySelector('.home-variants').textContent.includes(balance.toLocaleString('es-AR')));
  assert.equal(state.document.querySelectorAll('.daily-logs li').length, 1);
  assert.equal(state.historyRecords[today].meals.length, 1);
  await click(state, 'Datos');
  assert.match(state.document.querySelector('.charts-insights').textContent, /Consumidas500/);
  await click(state, 'Coach');
  assert.match(state.document.querySelector('.chat-messages').textContent, /Registrado hoy/);
  assert.equal(state.mealWrites, 1); assert.equal(state.logWrites, 1); assert.equal(state.aiCalls, 1);
  assert.equal(state.reads, state.initialReads);
});

test('confirmed Coach meals and workouts share the same saved record across navigation', async t => {
  const actions = [meal,
    { type: 'add_workout', estimated: true, payload: { dateStr: today, activity: 'Actividad de prueba', duration: 30, calories: 200, time: '17:00', details: '' } }];
  const state = await mountApp(t, actions);
  await sendActions(state); await click(state, 'Confirmar');
  await act(async () => { state.release(); await turn(); });
  await click(state, 'Inicio');
  assert.equal(state.historyRecords[today].workouts.length, 1);
  assert.match(state.document.querySelector('.daily-logs').textContent, /Actividad de prueba/);
  assert.equal(state.workoutWrites, 1); assert.equal(state.mealWrites, 1); assert.equal(state.logWrites, 1);
  assert.equal(state.reads, state.initialReads);
});

test('a replayed confirmed lunch is excluded from the next dinner confirmation across Coach/Home navigation', async t => {
  const lunch = { ...meal, payload: { ...meal.payload, name: 'Sorrentinos', calories: 900, time: '13:00' } };
  const dinner = { ...meal, payload: { ...meal.payload, name: 'Milanesa', type: 'Cena', calories: 1000, time: '21:00' } };
  const state = await mountApp(t, [lunch], false, current => { current.skipWriteGate = true; });
  await sendActions(state); await click(state, 'Confirmar');
  const firstId = state.persisted.meals[0].id;
  await click(state, 'Inicio');
  assert.equal(state.document.querySelectorAll('.daily-logs li').length, 1);
  await click(state, 'Coach');
  state.ai = async () => ({ reply: 'Revisá esta propuesta.', actions: [lunch, dinner], presentation: 'none' });
  await inputValue(state, 'textarea[aria-label="Mensaje para Coach"]', 'Registrá también la cena.');
  await act(async () => { state.document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await turn(); });
  assert.match(state.document.querySelector('.chat-already-recorded').textContent, /Ya registrado/);
  assert.equal(state.document.querySelector('.chat-already-recorded input').checked, false);
  await click(state, 'Confirmar');
  assert.equal(state.persisted.meals.length, 2);
  assert.equal(state.persisted.meals[0].id, firstId);
  assert.equal(state.persisted.meals.reduce((sum, entry) => sum + entry.calories, 0), 1900);
  assert.equal(state.mealWrites, 2); assert.equal(state.logWrites, 2);
  await click(state, 'Inicio');
  assert.equal(state.document.querySelectorAll('.daily-logs li').length, 2);
  assert.equal(state.historyRecords[today].meals.length, 2);
  await click(state, 'Datos');
  assert.match(state.document.querySelector('.charts-insights').textContent, /Consumidas1\.900/);
});

test('steps and water drafts survive Home unmount and finish queued increments after the in-flight acknowledgement', async t => {
  const state = await mountApp(t, []);
  t.after(() => state.release());
  const press = async label => act(async () => {
    const button = state.document.querySelector(`button[aria-label="${label}"]`);
    assert.ok(button, `Missing control: ${label}`);
    button.click(); await turn();
  });
  const waitForDebounce = async () => act(async () => {
    await new Promise(resolve => setTimeout(resolve, 450)); await turn();
  });
  const displayedValue = label => Number(state.document.querySelector(`button[aria-label="${label}"]`).textContent.replace(/\D/g, ''));
  await press('Sumar 500 pasos'); await waitForDebounce();
  assert.equal(state.logWrites, 1); assert.equal(state.persisted, null);
  await press('Sumar 500 pasos'); await press('Sumar 250 ml de agua');
  assert.equal(displayedValue('Editar total de pasos'), 1000);
  assert.equal(displayedValue('Editar cantidad de agua'), 250);
  await click(state, 'Datos'); await click(state, 'Coach'); await click(state, 'Inicio');
  assert.equal(displayedValue('Editar total de pasos'), 1000, 'The pending second increment is retained across navigation');
  assert.equal(displayedValue('Editar cantidad de agua'), 250);
  assert.equal(state.logWrites, 1, 'A second write cannot overtake the first acknowledgement');
  await click(state, 'Datos');
  await act(async () => { state.release(); await turn(); });
  await waitForDebounce();
  assert.equal(state.logWrites, 2);
  assert.equal(state.persisted.steps, 1000); assert.equal(state.persisted.water, 250);
  await click(state, 'Inicio');
  assert.equal(displayedValue('Editar total de pasos'), 1000);
  assert.equal(displayedValue('Editar cantidad de agua'), 250);
  assert.match(state.document.querySelector('.daily-habits-heading [role=status]').textContent, /Guardado/);
  assert.equal(state.mealWrites, 0); assert.equal(state.workoutWrites, 0); assert.equal(state.aiCalls, 0);
});

for (const [type, field, value] of [['add_water', 'water', 500], ['set_steps', 'steps', 7000], ['set_weight', 'weight', 71]]) {
  test(`Coach ${type} preserves its current registration flow and publishes the saved ${field} without reloading`, async t => {
    const state = await mountApp(t, [{ type, estimated: false, payload: { dateStr: today, [field]: value } }]);
    await sendActions(state, false);
    assert.equal(state.logWrites, 1);
    assert.ok(!state.document.querySelector('.chat-messages').textContent.includes('Registrado hoy'));
    await act(async () => { state.release(); await turn(); });
    assert.match(state.document.querySelector('.chat-messages').textContent, /Registrado hoy/);
    await click(state, 'Inicio');
    assert.equal(state.historyRecords[today][field], value);
    assert.equal(state.logWrites, 1);
    assert.equal(state.reads, state.initialReads);
  });
}

test('a failed Coach save rolls back shared state and never claims success or duplicates a record', async t => {
  t.mock.method(console, 'error', () => {});
  const state = await mountApp(t, [meal], true);
  await sendActions(state); await click(state, 'Confirmar');
  await act(async () => { state.release(); await turn(); });
  const messages = state.document.querySelector('.chat-messages').textContent;
  assert.match(messages, /No se pudo completar el guardado/);
  assert.ok(!messages.includes('Registrado hoy'));
  await click(state, 'Inicio');
  assert.equal(state.document.querySelector('.fitness-breakdown-values dd').textContent, 'Sin ingesta registrada');
  assert.equal(state.document.querySelectorAll('.daily-logs li').length, 0);
  assert.equal(state.mealWrites, 0); assert.equal(state.logWrites, 1);
});

test('a pending Coach save cannot publish another account’s records after a session change', async t => {
  const state = await mountApp(t, [meal]);
  await sendActions(state); await click(state, 'Confirmar');
  state.currentProfile = { ...profile, id: 'profile-other', user_id: 'user-other' };
  await act(async () => {
    for (const listener of state.listeners) listener('SIGNED_IN', { user: { id: state.currentProfile.user_id } });
    await turn();
  });
  await act(async () => { state.release(); await turn(); });
  await click(state, 'Inicio');
  assert.equal(state.document.querySelector('.fitness-breakdown-values dd').textContent, 'Sin ingesta registrada');
  assert.equal(state.historyRecords[today], undefined);
  assert.equal(state.persistedUser, profile.user_id);
  assert.equal(state.mealWrites, 1);
});

const goalProposal = { operation: 'accept', id: '00000000-0000-0000-0000-000000000055', type: 'workout_sessions',
  target: 3, startDate: today, endDate: today, stepThreshold: null };
function prepareGoal(state, failure = false) {
  state.goalProposal = goalProposal; state.goalWrites = 0;
  state.confirmGoal = async (proposed, _today, userId) => {
    state.goalWrites++; await state.goalGate;
    if (failure) throw new Error('No se pudo guardar el objetivo.');
    state.savedGoalOwner = userId;
    const saved = { ...proposed, status:'active',version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString() };
    state.goals = [saved, ...state.goals.filter(goal => goal.id !== saved.id)];
    state.goalOwner = userId;
    return saved;
  };
  state.goalGate = new Promise(resolve => { state.releaseGoal = resolve; });
}
test('goal proposals share the navigation lifecycle and the remounted view refreshes its goals when confirmation finishes', async t => {
  const state = await mountApp(t, []); prepareGoal(state); await sendActions(state);
  const original = state.document.querySelector('.chat-confirmation').textContent;
  await click(state, 'Perfil'); await click(state, 'Coach');
  assert.equal(state.document.querySelector('.chat-confirmation')?.textContent, original);
  await click(state, 'Aceptar objetivo');
  await click(state, 'Inicio'); await click(state, 'Coach');
  const confirm = state.document.querySelector('.chat-goal-confirm');
  assert.ok(confirm?.disabled);
  const readsBefore = state.goalReads;
  await act(async () => { state.releaseGoal(); await turn(); });
  assert.equal(state.document.querySelector('.chat-confirmation'), null);
  assert.ok(state.goalReads > readsBefore, 'The current goal hook must refresh after an earlier view completes the write');
  assert.equal(state.document.querySelector('.chat-proactive')?.dataset.insightKind, 'goal');
  assert.equal(conversationMessages(state).filter(message => message.text.startsWith('Objetivo aceptado y guardado')).length, 1);
  assert.equal(state.goalWrites, 1); assert.equal(state.aiCalls, 1); assert.equal(state.logWrites, 0);
});
test('a suggested goal writes once only after confirmation and does not create activities across Home/Data navigation', async t => {
  const state = await mountApp(t, []); prepareGoal(state); await sendActions(state);
  assert.equal(state.goalWrites,0); assert.match(state.document.querySelector('.chat-messages').textContent,/Solo se guarda al confirmar/);
  assert.match(state.document.querySelector('.chat-messages').textContent,/Revisá esta propuesta/);
  const button = [...state.document.querySelectorAll('button')].find(element => element.textContent === 'Aceptar objetivo');
  await act(async () => { button.click(); button.click(); await turn(); });
  assert.equal(state.goalWrites,1); assert.ok(!state.document.querySelector('.chat-messages').textContent.includes('Objetivo aceptado y guardado'));
  await act(async () => { state.releaseGoal(); await turn(); });
  assert.match(state.document.querySelector('.chat-messages').textContent,/Objetivo aceptado y guardado/);
  await click(state,'Inicio'); await click(state,'Datos'); await click(state,'Coach');
  assert.equal(state.logWrites,0); assert.equal(state.workoutWrites,0); assert.equal(state.mealWrites,0);
  assert.equal(state.aiCalls,1); assert.equal(state.goalWrites,1);
});
test('failed goal persistence never claims acceptance; dismissing a proposal performs no write', async t => {
  const state = await mountApp(t, []); prepareGoal(state,true); await sendActions(state);
  await click(state,'Aceptar objetivo'); await act(async () => { state.releaseGoal(); await turn(); });
  assert.match(state.document.querySelector('.chat-messages').textContent,/No se pudo guardar el objetivo/);
  assert.ok(!state.document.querySelector('.chat-messages').textContent.includes('Objetivo aceptado y guardado'));
  await click(state,'Descartar propuesta'); assert.equal(state.document.querySelector('.chat-confirmation'),null);
  assert.equal(state.goalWrites,1); assert.equal(state.logWrites,0);
});
test('a pending goal confirmation cannot publish success into a different account’s conversation', async t => {
  const state=await mountApp(t,[]); prepareGoal(state); await sendActions(state); await click(state,'Aceptar objetivo');
  state.currentProfile={...profile,id:'profile-other',user_id:'user-other'};
  await act(async () => { for(const listener of state.listeners) listener('SIGNED_IN',{user:{id:state.currentProfile.user_id}}); await turn(); });
  await act(async () => { state.releaseGoal(); await turn(); });
  await click(state,'Coach');
  assert.ok(!state.document.querySelector('.chat-messages').textContent.includes('Objetivo aceptado y guardado'));
  assert.equal(state.savedGoalOwner,profile.user_id); assert.equal(state.logWrites,0);
});
test('a proposed goal can be personalized conversationally before acceptance without writing either goal',async t=>{
  const state=await mountApp(t,[]);prepareGoal(state);await sendActions(state);
  const oldId=state.goalProposal.id;
  state.goalProposal={...goalProposal,id:'00000000-0000-0000-0000-000000000066',target:2};
  await act(async()=>{
    const input=state.document.querySelector('textarea');assert.equal(input.disabled,false);
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(input,'¿Y si solo puedo entrenar dos días?');
    input.dispatchEvent(new window.Event('input',{bubbles:true}));
  });
  await act(async()=>{state.document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await turn();});
  assert.notEqual(state.goalProposal.id,oldId);assert.equal(state.goalWrites,0);
  assert.match(state.document.querySelector('.chat-confirmation').textContent,/2 sesiones/);
  assert.equal(state.aiCalls,2);assert.equal(state.logWrites,0);
});
test('conversational weekly choice passes real API/client validation into confirmation, Mis objetivos and a new conversation',async t=>{
  const owner='00000000-0000-0000-0000-000000000001';
  const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:owner,iss:`${supabaseUrl}/auth/v1`,
    aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'synthetic_signature'].join('.');
  const envKeys=['AI_COACH_GOALS_ENABLED','GEMINI_API_KEY','SUPABASE_AI_SECRET_KEY','AI_TEXT_DAILY_LIMIT'];
  const previous=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
  Object.assign(process.env,{AI_COACH_GOALS_ENABLED:'true',GEMINI_API_KEY:'synthetic',SUPABASE_AI_SECRET_KEY:'sb_secret_synthetic',AI_TEXT_DAILY_LIMIT:'30'});
  const state=await mountApp(t,[],false,current=>{
    current.currentProfile={...profile,user_id:owner};current.goalWrites=0;current.modelCalls=0;current.quotaCalls=0;
    current.getSession=async()=>({data:{session:{access_token:token,user:{id:owner}}}});
  });
  const oldFetch=globalThis.fetch;let persisted;
  t.after(()=>{globalThis.fetch=oldFetch;for(const key of envKeys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}});
  globalThis.fetch=async(url,options={})=>{
    if(url==='/api/ai/chat') return chatHandler.fetch(new Request('http://local/api/ai/chat',options));
    if(url===`${supabaseUrl}/auth/v1/user`) return Response.json({id:owner});
    if(url===`${supabaseUrl}/rest/v1/rpc/reserve_ai_quota`){state.quotaCalls++;return Response.json({allowed:!state.quotaDenied,retry_after_seconds:3600});}
    if(url.startsWith(`${supabaseUrl}/rest/v1/coach_goals?`)){
      if(options.method==='POST'){
        state.goalWrites++;persisted={...JSON.parse(options.body),status:'active',version:1,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
        return Response.json([persisted]);
      }
      return Response.json(persisted?[persisted]:[]);
    }
    assert.equal(new URL(url).hostname,'generativelanguage.googleapis.com');state.modelCalls++;
    return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({reply:'Te propongo un objetivo de tres sesiones. ¿Quieres confirmarlo?',actions:[]})}]}}]});
  };
  const realAI=await import(await compile(path.join(rootDir,'services/aiService.ts')));
  state.ai=async(...args)=>{state.aiCalls++;return realAI.generateAIResponse(...args);};
  state.fetchGoals=async()=>{
    const response=await goalsHandler.fetch(new Request('http://local/api/coach/goals',{headers:{Authorization:`Bearer ${token}`}}));
    assert.equal(response.status,200);return response.json();
  };
  state.confirmGoal=async(proposal,localToday,expectedOwner)=>{
    assert.equal(expectedOwner,owner);
    const response=await goalsHandler.fetch(new Request('http://local/api/coach/goals',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({today:localToday,proposal})}));
    assert.equal(response.status,200);return (await response.json()).goal;
  };
  await sendActions(state,false,'Quiero ir al gimnasio 3 veces por semana durante el mes de noviembre');
  assert.equal(state.document.querySelector('.chat-confirmation'),null);
  for (const text of ['Septiembre', 'Perdón, es para el mes de noviembre', 'No quiero otras metas', '¿Podés guardar mi objetivo?']) {
    await sendActions(state,false,text);assert.equal(state.document.querySelector('.chat-confirmation'),null);
  }
  await sendActions(state,true,'Prefiero la opción semanal');
  assert.match(state.document.querySelector('.chat-confirmation').textContent,/3 sesiones de entrenamiento/);
  assert.equal(state.goalWrites,0);assert.equal(state.modelCalls,6);assert.equal(state.quotaCalls,6);
  state.quotaDenied=true;await click(state,'Aceptar objetivo');
  assert.match(state.document.querySelector('.chat-messages').textContent,/Objetivo aceptado y guardado/);
  assert.equal(state.goalWrites,1);assert.equal(state.modelCalls,6);assert.equal(state.quotaCalls,6);
  assert.equal(persisted.user_id,owner);assert.equal(state.logWrites,0);assert.equal(state.workoutWrites,0);
  await click(state,'Mis objetivos');assert.match(state.document.querySelector('.coach-goal-card').textContent,/0\/3/);
  await click(state,'Cerrar formulario');await click(state,'Nueva conversación');
  await click(state,'Mis objetivos');assert.match(state.document.querySelector('.coach-goal-card').textContent,/0\/3/);
  assert.equal(state.goalWrites,1);assert.equal(state.modelCalls,6);
});
test('discarding an unaccepted goal proposal never calls persistence',async t=>{
  const state=await mountApp(t,[]);prepareGoal(state);await sendActions(state);
  await click(state,'Descartar propuesta');assert.equal(state.document.querySelector('.chat-confirmation'),null);
  assert.equal(state.goalWrites,0);assert.equal(state.logWrites,0);assert.equal(state.aiCalls,1);
});

const acceptedGoal = (overrides = {}) => ({ ...goalProposal, status: 'active', version: 1,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...overrides });
const inputValue = async (state, selector, value) => act(async () => {
  const field = state.document.querySelector(selector); assert.ok(field, `Missing ${selector}`);
  const prototype = field.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
  field.dispatchEvent(new window.Event('input', { bubbles: true })); await turn();
});
async function goalManagement(state) {
  const { CoachGoalsError } = await import(await compile(path.join(rootDir, 'services/coachGoals.ts')));
  state.goalWrites = 0;
  state.confirmGoal = async proposed => {
    state.goalWrites++;
    if (state.writeGate) await state.writeGate;
    if (state.writeFailure) throw new CoachGoalsError('No se pudo guardar el objetivo.', 'goals_unavailable');
    const current = state.goals.find(goal => goal.id === proposed.id);
    if (current?.version !== proposed.expectedVersion) throw new CoachGoalsError('El objetivo cambió. Consultalo nuevamente.', 'goal_conflict');
    const saved = { ...current, target: proposed.target, stepThreshold: proposed.stepThreshold,
      status: proposed.operation === 'cancel' ? 'cancelled' : 'active', version: current.version + 1, updatedAt: new Date().toISOString() };
    state.goals = state.goals.map(goal => goal.id === saved.id ? saved : goal);
    return structuredClone(saved);
  };
}

test('goal cards use the official aggregator for zero/partial/reached/ended/missing/future/cancelled periods and step days', async () => {
  const { default: Card } = await import(await compile(path.join(rootDir, 'components/CoachGoalCard.tsx')));
  const { renderToStaticMarkup } = await import('react-dom/server');
  const localToday = '2026-10-21';
  const goal = acceptedGoal({ startDate: '2026-10-19', endDate: '2026-10-25' });
  const context = (count, steps = 0) => buildCoachContext({ ...profile, records: { [localToday]: {
    meals: [], workouts: Array.from({ length: count }, () => ({ activity: 'Gimnasio', calories: 100, duration: 20 })), steps, water: 0,
  } } }, localToday).historyDays;
  const markup = (target, history, date = localToday) => renderToStaticMarkup(React.createElement(Card, { goal: target, history, today: date }));
  for (const [count, percent, remaining] of [[0, 0, 3], [1, 33, 2], [3, 100, 0], [5, 100, 0]]) {
    const html = markup(goal, context(count));
    assert.match(html, new RegExp(`${count}/3`)); assert.match(html, new RegExp(`value="${percent}"`));
    assert.ok(html.includes(remaining ? `Para alcanzar la meta según tus registros: ${remaining} sesiones` : 'Meta cubierta'));
  }
  assert.match(markup(goal, context(0)), /El avance se calcula con los entrenamientos que registraste/);
  assert.match(markup({ ...goal, endDate: '2026-10-20' }, context(0)), /Período finalizado/);
  assert.match(markup({ ...goal, startDate: '2026-10-22' }, context(0)), /Por empezar/);
  assert.match(markup({ ...goal, status: 'cancelled' }, context(0)), /Cancelado/);
  const unavailable = markup(goal, []);
  assert.match(unavailable, /Progreso no disponible/); assert.doesNotMatch(unavailable, /<progress|0\/3/);
  const stepsGoal = { ...goal, type: 'step_days', target: 5, stepThreshold: 8000 };
  assert.match(markup(stepsGoal, context(0, 30000)), /1\/5/);
  assert.match(markup(stepsGoal, context(0, 7999)), /0\/5/);
  assert.match(markup(stepsGoal, context(0, 8000)), /1\/5/);
});

test('Mis objetivos reviews edits and cancellations explicitly, saves once, refreshes cards and restores focus without AI calls', async t => {
  const state = await mountApp(t, [], false, current => { current.goals = [acceptedGoal()]; });
  await goalManagement(state); await click(state, 'Coach');
  const trigger = state.document.querySelector('[aria-label="Mis objetivos"]'); trigger.focus();
  await click(state, 'Mis objetivos');
  const dialog = state.document.querySelector('[role="dialog"]'); assert.ok(dialog);
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  for (let ancestor = dialog.parentElement; ancestor; ancestor = ancestor.parentElement) assert.notEqual(ancestor.inert, true, 'A desktop modal must never have an inert ancestor');
  assert.equal(state.document.activeElement.getAttribute('aria-label'), 'Cerrar formulario');
  assert.match(dialog.textContent, /0\/3/);
  await click(state, 'Editar objetivo'); await inputValue(state, '.coach-goal-edit input', '2');
  await click(state, 'Revisar cambio');
  assert.match(dialog.textContent, /Antes: 3 entrenamientos. Nueva meta: 2 entrenamientos/);
  assert.equal(state.goalWrites, 0);
  await click(state, 'Descartar propuesta'); assert.equal(state.goalWrites, 0);
  await click(state, 'Editar objetivo'); await inputValue(state, '.coach-goal-edit input', '2'); await click(state, 'Revisar cambio');
  let release; state.writeGate = new Promise(resolve => { release = resolve; });
  const confirm = [...dialog.querySelectorAll('button')].find(button => button.textContent === 'Confirmar modificación');
  await act(async () => { confirm.click(); confirm.click(); await turn(); });
  assert.equal(state.goalWrites, 1); assert.ok(!dialog.textContent.includes('Objetivo actualizado.'));
  await act(async () => { release(); await turn(); await turn(); });
  assert.equal(state.goals[0].target, 2); assert.equal(state.goals[0].version, 2);
  assert.match(dialog.textContent, /Objetivo actualizado/); assert.match(dialog.textContent, /0\/2/);
  await click(state, 'Cancelar objetivo'); assert.equal(state.goalWrites, 1);
  await click(state, 'Descartar propuesta'); assert.equal(state.goals[0].status, 'active');
  await click(state, 'Cancelar objetivo'); await click(state, 'Confirmar cancelación');
  assert.equal(state.goals[0].status, 'cancelled'); assert.equal(state.goals[0].version, 3);
  assert.equal(state.goalWrites, 2); assert.match(dialog.textContent, /Cancelado/);
  await act(() => state.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(state.document.querySelector('[role="dialog"]'), null); assert.equal(state.document.activeElement, trigger);
  assert.equal(state.aiCalls, 0); assert.equal(state.logWrites, 0); assert.equal(state.workoutWrites, 0);
});

test('failed saves and reads hide previous progress; version conflicts require a fresh explicit review', async t => {
  const state = await mountApp(t, [], false, current => { current.goals = [acceptedGoal()]; });
  await goalManagement(state); await click(state, 'Coach'); await click(state, 'Mis objetivos');
  const normalRead = state.fetchGoals;
  state.fetchGoals = async (...args) => { if (state.readFailure) throw new Error('No pudimos consultar tus objetivos.'); return normalRead(...args); };
  await click(state, 'Editar objetivo'); await inputValue(state, '.coach-goal-edit input', '2'); await click(state, 'Revisar cambio');
  state.writeFailure = true; state.readFailure = true;
  await click(state, 'Confirmar modificación');
  assert.equal(state.goals[0].target, 3); assert.equal(state.goals[0].version, 1);
  assert.equal(state.document.querySelector('.coach-goal-card'), null);
  assert.match(state.document.querySelector('[role="dialog"]').textContent, /No se pudo guardar/);
  assert.ok(!state.document.querySelector('[role="dialog"]').textContent.includes('Objetivo actualizado.'));
  await click(state, 'Volver a objetivos'); state.readFailure = false; state.writeFailure = false;
  await click(state, 'Volver a consultar');
  await click(state, 'Editar objetivo'); await inputValue(state, '.coach-goal-edit input', '2'); await click(state, 'Revisar cambio');
  state.goals[0] = { ...state.goals[0], target: 4, version: 2 };
  await click(state, 'Confirmar modificación');
  assert.equal(state.goals[0].target, 4); assert.equal(state.goals[0].version, 2);
  const dialog = state.document.querySelector('[role="dialog"]');
  assert.match(dialog.textContent, /objetivo cambió/); assert.match(dialog.textContent, /0\/4/);
  assert.ok(!dialog.textContent.includes('Confirmar modificación'));
  assert.equal(state.aiCalls, 0); assert.equal(state.logWrites, 0);
});

test('late goal reads and pending goal edits cannot cross accounts; disabled flag removes cards and write actions', async t => {
  const state = await mountApp(t, [], false, current => { current.goals = [acceptedGoal()]; });
  await goalManagement(state); await click(state, 'Coach'); await click(state, 'Mis objetivos');
  const { CoachGoalsError } = await import(await compile(path.join(rootDir, 'services/coachGoals.ts')));
  const normalRead = state.fetchGoals;
  state.fetchGoals = async () => { throw new CoachGoalsError('Deshabilitado.', 'goals_disabled'); };
  await click(state, 'Actualizar lista');
  assert.match(state.document.querySelector('[role="dialog"]').textContent, /no están habilitados/);
  assert.equal(state.document.querySelector('.coach-goal-card'), null);
  assert.equal(state.document.querySelector('.coach-goal-actions'), null);
  state.fetchGoals = normalRead;
  await click(state, 'Cerrar formulario'); await click(state, 'Mis objetivos');
  await click(state, 'Editar objetivo'); await inputValue(state, '.coach-goal-edit input', '2'); await click(state, 'Revisar cambio');
  let releaseWrite; state.writeGate = new Promise(resolve => { releaseWrite = resolve; });
  await click(state, 'Confirmar modificación');
  let releaseRead;
  state.fetchGoals = owner => owner === profile.user_id ? new Promise(resolve => { releaseRead = resolve; }) : Promise.resolve({ goals: [], hasMore: false });
  await act(async () => { window.dispatchEvent(new window.Event('focus')); await turn(); });
  state.currentProfile = { ...profile, id: 'other-profile', user_id: 'other-owner' };
  await act(async () => { for (const listener of state.listeners) listener('SIGNED_IN', { user: { id: 'other-owner' } }); await turn(); });
  await act(async () => { releaseRead({ goals: [acceptedGoal()], hasMore: false }); releaseWrite(); await turn(); });
  await click(state, 'Coach'); await click(state, 'Mis objetivos');
  const text = state.document.querySelector('[role="dialog"]').textContent;
  assert.match(text, /No tenés objetivos/); assert.ok(!text.includes('0/3') && !text.includes('Objetivo actualizado'));
});

test('goals follow shared Home workout add/edit/delete and step changes across new conversations and application reload', async t => {
  const state = await mountApp(t, [], false, current => {
    current.goals = [acceptedGoal(), acceptedGoal({ id: '00000000-0000-0000-0000-000000000066', type: 'step_days', target: 1, stepThreshold: 8000 })];
    current.skipWriteGate = true;
  });
  state.ai = async () => { state.aiCalls++; return { reply: 'Texto del modelo: 999 sesiones.', actions: [], presentation: 'none' }; };
  await click(state, 'Coach'); await click(state, 'Mis objetivos');
  assert.equal(state.document.querySelectorAll('.coach-goal-card').length, 2); assert.equal(state.aiCalls, 0);
  await click(state, 'Cerrar formulario'); await click(state, 'Inicio'); await click(state, 'Agregar ejercicio');
  await inputValue(state, '#add-workout-activity', 'Gimnasio');
  await inputValue(state, '#add-workout-duration', '30'); await inputValue(state, '#add-workout-calories', '200');
  await act(async () => { state.document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await turn(); });
  await sendActions(state, false, '¿Cómo voy con mis entrenamientos?');
  assert.match(state.document.querySelector('.coach-goal-card').textContent, /1\/3/);
  assert.ok(!state.document.querySelector('.coach-goal-card').textContent.includes('999'));
  await click(state, 'Inicio');
  await act(() => state.document.querySelector('.daily-record-open').click());
  await act(() => state.document.querySelector('.record-detail-edit').click());
  await inputValue(state, '#edit-workout-duration', '40');
  await act(async () => { state.document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await turn(); });
  assert.equal(state.persisted.workouts[0].duration, 40);
  await click(state, 'Coach'); assert.match(state.document.querySelector('.coach-goal-card').textContent, /1\/3/);
  await click(state, 'Inicio');
  await act(() => state.document.querySelector('.daily-record-open').click());
  await click(state, 'Eliminar');
  assert.equal(state.persisted.workouts.length, 1, 'The detail action must request confirmation before writing');
  const confirm = state.document.querySelector('dialog[data-record-delete][open] .profile-button-danger');
  assert.ok(confirm);
  await act(async () => { confirm.click(); await turn(); });
  assert.equal(state.persisted.workouts.length, 0);
  await act(async () => { state.document.querySelector('[title="Editar pasos"]').click(); await turn(); });
  await inputValue(state, '.daily-habits input', '8000');
  await act(async () => { state.document.querySelector('.daily-habits input').blur(); await new Promise(resolve => setTimeout(resolve, 450)); });
  await sendActions(state, false, '¿Cuál es mi objetivo?');
  const cards = state.document.querySelectorAll('.coach-goal-card');
  assert.equal(cards.length, 3); // Previous workout response plus the new contextual pair, all live.
  assert.match(cards[0].textContent, /0\/3/);
  assert.match(cards[2].textContent, /1\/1/);
  await click(state, 'Nueva conversación');
  assert.equal(state.document.querySelectorAll('.coach-goal-card').length, 0);
  await sendActions(state, false, '¿Cuál es mi objetivo?');
  assert.equal(state.document.querySelectorAll('.coach-goal-card').length, 2);
  const main = await compile(path.join(rootDir, 'main.tsx'));
  await act(async () => { state.root.unmount(); instance++; await import(main + `#reload-${instance}`); await turn(); });
  await click(state, 'Coach');
  assert.equal(state.document.querySelectorAll('.coach-goal-card').length, 2);
  assert.match(state.document.querySelector('.chat-messages').textContent, /0\/3[\s\S]*1\/1/);
  assert.equal(state.persisted.workouts.length, 0); assert.equal(state.persisted.steps, 8000);
  assert.equal(state.aiCalls, 3);
});

test('Coach keeps header/composer outside its log and anchors delayed content only for a reader near the end on desktop', async t => {
  const previousObserver = globalThis.ResizeObserver, observers = [];
  globalThis.ResizeObserver = class {
    targets = [];
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.targets.push(target); }
    disconnect() { this.targets = []; }
  };
  t.after(() => { globalThis.ResizeObserver = previousObserver; });
  const state = await mountApp(t, []);
  await click(state, 'Coach');
  const log = state.document.querySelector('[role="log"]'), main = state.document.querySelector('.app-main');
  const heading = state.document.querySelector('.chat-heading'), composer = state.document.querySelector('.chat-composer');
  assert.equal(log.contains(heading), false); assert.equal(log.contains(composer), false);
  assert.equal(heading.parentElement, log.parentElement); assert.equal(composer.parentElement, log.parentElement);
  for (const name of ['Mis objetivos', 'Historial', 'Nueva conversación']) assert.ok(heading.querySelector(`[aria-label="${name}"]`));
  for (const name of ['Iniciar dictado por voz', 'Enviar mensaje']) assert.ok(composer.querySelector(`[aria-label="${name}"]`));
  assert.equal(observers.some(item => item.targets.includes(log)), false, 'Empty suggestions stay anchored at the first suggestion');
  await sendActions(state, false, 'Una consulta de prueba.');
  const observer = observers.find(item => item.targets.includes(log)); assert.ok(observer);
  assert.ok(observer.targets.includes(state.document.querySelector('.chat-message-list')), 'Late card/image content must be observed, not only the viewport');
  let total = 2000;
  Object.defineProperty(log, 'scrollHeight', { get: () => total, configurable: true });
  Object.defineProperty(log, 'clientHeight', { value: 500, configurable: true });
  main.scrollTop = 87; log.scrollTop = 1500;
  observer.callback(); // Establish dimensions after mounting.
  total = 2400; observer.callback();
  assert.ok(log.scrollTop >= 1900, 'A reader at the end follows newly loaded content');
  assert.equal(main.scrollTop, 87, 'Desktop auto-scroll must not move the outer page');
  log.scrollTop = 150; total = 2800; observer.callback();
  assert.equal(log.scrollTop, 150, 'Reading older messages must not jump to the end');
  await click(state, 'Historial'); assert.ok(state.document.querySelector('.chat-history-picker'));
  assert.equal(log.contains(state.document.querySelector('.chat-history-picker')), false);
});

for (const scenario of [
  { name: 'calories through confirmation', action: meal, selector: '.chat-proposal-edit input[type="number"]',
    value: '725', fieldHeight: 44, confirm: true },
  { name: 'multiline details through cancellation', action: { type: 'add_workout', estimated: true,
    payload: { dateStr: today, activity: 'Actividad de prueba', duration: 30, calories: 200, time: '17:00', details: '' } },
    selector: '.chat-proposal-edit textarea', value: 'Primera serie\nSegunda serie\nÚltima serie sin perder el borrador',
    fieldHeight: 100, confirm: false },
]) {
  test(`Coach proposal editing keeps ${scenario.name} visible when the keyboard shrinks the reader`, async t => {
    const previousObserver = globalThis.ResizeObserver, observers = [];
    globalThis.ResizeObserver = class {
      targets = [];
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target) { this.targets.push(target); }
      disconnect() { this.targets = []; }
    };
    t.after(() => { globalThis.ResizeObserver = previousObserver; });
    let viewport;
    const state = await mountApp(t, [scenario.action], false, () => {
      Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 812, configurable: true });
      viewport = new window.EventTarget();
      Object.assign(viewport, { width: 375, height: 812, offsetTop: 0, scale: 1 });
      Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
      window.matchMedia = query => ({
        matches: query === '(max-width: 767px)' || query === '(any-pointer: coarse)',
        addEventListener() {}, removeEventListener() {},
      });
    });
    await sendActions(state);
    await click(state, 'Editar');
    const log = state.document.querySelector('[role="log"]');
    const main = state.document.querySelector('.app-main');
    const shell = state.document.querySelector('.app-shell-coach');
    const field = state.document.querySelector(scenario.selector); assert.ok(field);
    const label = field.closest('label'); assert.ok(label);
    const observer = observers.find(item => item.targets.includes(log)); assert.ok(observer);

    // Explicit synthetic layout: the reader starts at the end with a closed keyboard.
    // Shrinking it would move this field above the reader if ResizeObserver anchored
    // to the new end. JSDOM has no layout or browser scroll clamping of its own.
    const total = 1800, readerTop = 80, labelOffset = 1400, fieldOffset = 1426;
    let readerHeight = 600, scroll = total - readerHeight;
    Object.defineProperties(log, {
      scrollHeight: { get: () => total, configurable: true },
      clientHeight: { get: () => readerHeight, configurable: true },
      scrollTop: { get: () => scroll, set: value => { scroll = Math.max(0, Math.min(value, total - readerHeight)); }, configurable: true },
    });
    const rect = (top, height) => ({ x: 0, y: top, top, bottom: top + height, left: 0, right: 375, width: 375, height });
    log.getBoundingClientRect = () => rect(readerTop, readerHeight);
    field.getBoundingClientRect = () => rect(readerTop + fieldOffset - scroll, scenario.fieldHeight);
    label.getBoundingClientRect = () => rect(readerTop + labelOffset - scroll, 26 + scenario.fieldHeight);
    main.scrollTop = 87;
    observer.callback(); // Establish the near-end dimensions before any field has focus.
    assert.equal(scroll, total - readerHeight);
    await act(async () => {
      field.focus();
      await new Promise(resolve => window.requestAnimationFrame(resolve));
    });
    assert.notEqual(shell.dataset.coachKeyboard, 'open', 'The proposal field is focused before the keyboard opens');
    await inputValue(state, scenario.selector, scenario.value);
    if (field.tagName === 'TEXTAREA') field.setSelectionRange(12, 12);
    await act(async () => { await new Promise(resolve => window.requestAnimationFrame(resolve)); });
    assert.equal(state.document.activeElement, field);
    assert.equal(field.value, scenario.value);
    assert.equal(state.logWrites, 0, 'Editing the proposal cannot persist an unconfirmed record');
    const beforeKeyboard = scroll;
    const assertVisible = () => {
      const reader = log.getBoundingClientRect();
      for (const element of [label, field]) {
        const bounds = element.getBoundingClientRect();
        assert.ok(bounds.top >= reader.top && bounds.bottom <= reader.bottom,
          `Focused ${element.tagName} must remain inside the reader, not jump above it`);
      }
      assert.ok(scroll >= beforeKeyboard && scroll < total - readerHeight,
        'Reveal only the obscured field rather than anchoring the reader to its new end');
      assert.equal(main.scrollTop, 87, 'Revealing a proposal must not scroll the outer page');
      assert.equal(state.document.activeElement, field);
      assert.equal(field.value, scenario.value);
      if (field.tagName === 'TEXTAREA') {
        assert.equal(field.selectionStart, 12); assert.equal(field.selectionEnd, 12);
      }
    };
    await act(async () => {
      readerHeight = 260; viewport.height = 460;
      viewport.dispatchEvent(new window.Event('resize'));
      observer.callback();
      // Assert synchronously: a later focus/viewport RAF must not conceal a bad
      // ResizeObserver jump followed by another compensating scroll.
      assertVisible();
      await new Promise(resolve => window.requestAnimationFrame(resolve));
    });
    assertVisible();
    assert.equal(shell.dataset.coachKeyboardOwner, 'proposal');

    const action = [...state.document.querySelectorAll('.chat-proposal-actions button')]
      .find(button => button.textContent === (scenario.confirm ? 'Confirmar' : 'Cancelar'));
    assert.ok(action);
    const touchDown = new window.Event('pointerdown', { bubbles: true, cancelable: true });
    Object.defineProperty(touchDown, 'pointerType', { value: 'touch' });
    await act(() => action.dispatchEvent(touchDown));
    assert.equal(touchDown.defaultPrevented, true, 'Touch down keeps the active editor stable until the click');
    assert.equal(state.document.activeElement, field);
    assert.equal(state.logWrites, 0, 'Pointer down alone must not confirm or cancel the proposal');

    if (scenario.confirm) {
      await act(async () => {
        // Same-batch duplicate clicks exercise the real synchronous write guard.
        action.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
        action.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
        await turn();
      });
      assert.equal(state.logWrites, 1); assert.equal(state.mealWrites, 0);
      await act(async () => { state.release(); await turn(); });
      assert.equal(state.persisted.meals.length, 1);
      assert.equal(state.persisted.meals[0].calories, 725);
      assert.equal(state.persisted.dateStr, today);
      assert.equal(state.persistedUser, profile.user_id);
      assert.equal(state.mealWrites, 1); assert.equal(state.logWrites, 1);
      assert.match(state.document.querySelector('.chat-messages').textContent, /Registrado hoy/);
    } else {
      await click(state, 'Cancelar');
      assert.equal(state.document.querySelector('.chat-confirmation'), null);
      assert.match(state.document.querySelector('.chat-messages').textContent, /Registro cancelado\./);
      assert.equal(state.persisted, null);
      assert.equal(state.logWrites, 0); assert.equal(state.workoutWrites, 0);
    }
    assert.equal(state.aiCalls, 1, 'Editing and confirming/cancelling must not ask the model again');
  });
}
