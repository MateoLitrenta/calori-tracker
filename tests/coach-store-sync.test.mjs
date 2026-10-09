import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { act } from 'react';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
import { calculateDailyExpenditure, formatDateStr } from '../src/utils/helpers.ts';

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
    'syncAvatarPath', 'completeOnboarding', 'deleteUserRecords'].map(name =>
    `export const ${name} = (...args) => globalThis.__syncHarness.db.${name}(...args);`).join('\n'),
  'components/ThemeProvider.tsx': 'export const ThemeProvider = ({children}) => children;',
  'components/Sidebar.tsx': blank,
  'components/ProfileView.tsx': blank,
  'components/AuthModal.tsx': blank,
  'components/LandingPage.tsx': blank,
  'components/Onboarding.tsx': blank,
  'components/ViewSkeleton.tsx': blank,
  'components/UserAvatar.tsx': blank,
  'components/Heatmap.tsx': 'export default ({records}) => { globalThis.__syncHarness.historyRecords = records; return null; };',
  'components/MealPhoto.tsx': 'export const MealPhotoPicker = () => null; export const MealThumbnail = () => null;',
  'components/EntryFormShell.tsx': blank,
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
  weight: 70, height: 170, goal: 'Mantenimiento', activity: 'Moderado', onboarding_completed: true, records: {} };
const turn = () => new Promise(setImmediate);
async function mountApp(t, actions, fail = false) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://calori.test/app', pretendToBeVisual: true });
  const savedGlobals = {};
  for (const name of ['window', 'document', 'HTMLElement', 'MutationObserver', 'localStorage', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    savedGlobals[name] = globalThis[name]; globalThis[name] = dom.window[name];
  }
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  dom.window.scrollTo = () => {};
  dom.window.HTMLElement.prototype.scrollTo = () => {};
  const state = { reads: 0, logWrites: 0, mealWrites: 0, workoutWrites: 0, persisted: null,
    historyRecords: {}, listeners: new Set(), aiCalls: 0, currentProfile: profile };
  let release;
  const writeGate = new Promise(resolve => { release = resolve; });
  state.release = release;
  state.getSession = async () => ({ data: { session: { user: { id: state.currentProfile.user_id } } } });
  state.subscribe = callback => { state.listeners.add(callback); return { data: { subscription: {
    unsubscribe: () => state.listeners.delete(callback) } } }; };
  state.ai = async () => { state.aiCalls++; return { reply: 'Revisá esta propuesta.', actions, presentation: 'none' }; };
  state.db = {
    fetchUserData: async () => { state.reads++; return structuredClone({ ...state.currentProfile,
      records: state.persisted && state.persistedUser === state.currentProfile.user_id ? { [today]: state.persisted } : {} }); },
    ensureDailyLog: async (_user, record) => {
      state.logWrites++;
      await writeGate;
      if (fail) return null;
      state.persistedUser = _user;
      state.persisted = { ...structuredClone(record), meals: [], workouts: [] }; return 'log-test';
    },
    syncAddMeal: async (_user, _log, meal) => { state.mealWrites++; state.persisted.meals.push(structuredClone(meal)); },
    syncAddWorkout: async (_user, _log, workout) => { state.workoutWrites++; state.persisted.workouts.push(structuredClone(workout)); },
    fetchDailyLog: async () => structuredClone(state.persisted),
  };
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
  const button = [...state.document.querySelectorAll('button')].find(element => element.textContent.trim() === label);
  assert.ok(button, `Missing button: ${label}`);
  await act(async () => { button.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await turn(); });
}
async function sendActions(state, hasProposal = true) {
  await click(state, 'Coach');
  await act(async () => {
    const input = state.document.querySelector('textarea'); assert.ok(input);
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(input, 'Registrá estos datos de prueba.');
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await act(async () => { state.document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await turn(); });
  if (hasProposal) {
    assert.ok(state.document.querySelector('.chat-confirmation'));
    assert.equal(state.logWrites, 0);
  }
}
const meal = { type: 'add_meal', estimated: true, payload: { dateStr: today, name: 'Comida de prueba', type: 'Almuerzo', calories: 500, time: '12:30' } };

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
  assert.match(state.document.querySelector('.home-variants').textContent, /Calorías consumidas0 kcal/);
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
  assert.match(state.document.querySelector('.home-variants').textContent, /Calorías consumidas0 kcal/);
  assert.equal(state.historyRecords[today], undefined);
  assert.equal(state.persistedUser, profile.user_id);
  assert.equal(state.mealWrites, 1);
});
