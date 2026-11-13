import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';
import React, { act } from 'react';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import { homeDateBounds, homePresentationKey, homeWeek, isHomeDate, moveHomeWeek, normalizeHomePresentation } from '../src/utils/homeDateNavigation.ts';

const root = fileURLToPath(new URL('../src/', import.meta.url));
const url = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const cache = new Map();
const mocks = {
  'lib/supabase.ts': 'export const supabase = { storage: { from: () => ({}) } };',
  'services/aiService.ts': 'export const estimateMeal = async () => ({}); export const estimateWorkout = async () => ({});',
  'components/MealPhoto.tsx': 'export const MealPhotoPicker = () => null; export const MealThumbnail = () => null;',
};
async function compile(file) {
  if (cache.has(file)) return cache.get(file);
  const relative = path.relative(root, file).replaceAll('\\', '/');
  if (mocks[relative]) return url(mocks[relative]);
  const source = (await readFile(file, 'utf8')).replace(/import ['"][^'"]+\.css['"];?/g, '')
    .replace(/import\s+\{([^}]+)\}\s+from ['"]@phosphor-icons\/react['"];?/g, (_, names) =>
      names.split(',').filter(name => name.trim()).map(name => 'const ' + name.trim() + ' = () => null;').join('\n'));
  let code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 } }).outputText;
  for (const specifier of new Set([...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]))) {
    let target;
    if (specifier === 'react-hot-toast') target = url('export default { error() {}, success() {} };');
    else if (specifier.startsWith('.')) {
      let dependency = path.resolve(path.dirname(file), specifier);
      if (!path.extname(dependency)) {
        try { await readFile(dependency + '.ts'); dependency += '.ts'; } catch { dependency += '.tsx'; }
      }
      target = await compile(dependency);
    } else target = import.meta.resolve(specifier);
    code = code.replaceAll("'" + specifier + "'", JSON.stringify(target)).replaceAll('"' + specifier + '"', JSON.stringify(target));
  }
  const result = url(code); cache.set(file, result); return result;
}
const { default: HomeView } = await import(await compile(path.join(root, 'components/HomeView.tsx')));
const today = '2026-11-12', yesterday = '2026-11-11';
const generation = '22222222-2222-4222-8222-222222222222';
const profile = { id: 'A', user_id: 'A', name: 'Synthetic A', age: 30, sex: 'Masculino', weight: 70,
  height: 170, goal: 'Mantenimiento', activity: 'Moderado', recordProtocol: 'atomic', recordGeneration: generation };
const record = (dateStr, patch = {}) => ({ dateStr, date: new Date(dateStr + 'T12:00:00'), meals: [], workouts: [],
  steps: 0, water: 0, version: '1', generation, ...patch });
const fixtures = () => ({
  [today]: record(today, { water: 1000, steps: 1000, weight: 70, meals: [{ id: 'meal-today', name: 'Comida de hoy', calories: 650, type: 'Almuerzo', time: '12:00' }] }),
  [yesterday]: record(yesterday, { water: 2500, steps: 8500, weight: 71.2, meals: [{ id: 'meal-yesterday', name: 'Comida de ayer', calories: 900, type: 'Cena', time: '20:00' }],
    workouts: [{ id: 'workout-yesterday', activity: 'Fútbol de ayer', duration: 60, calories: 400, muscles: [], time: '18:00' }] }),
});
async function mount(t, { width = 375, stored = {}, controlled = false, accounts = { A: fixtures(), B: {} }, pending = false, initialNow = today + 'T12:00:00' } = {}) {
  const NativeDate = globalThis.Date;
  let clockNow = initialNow;
  class FixedDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [clockNow])); }
    static now() { return new NativeDate(clockNow).getTime(); }
  }
  const dom = new JSDOM('<main class="app-main"><div id="root"></div></main>', { pretendToBeVisual: true, url: 'http://localhost/' });
  const saved = {};
  for (const name of ['window', 'document', 'HTMLElement', 'getComputedStyle', 'IS_REACT_ACT_ENVIRONMENT', 'Date', 'ResizeObserver']) saved[name] = globalThis[name];
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    getComputedStyle: dom.window.getComputedStyle, IS_REACT_ACT_ENVIRONMENT: true, Date: FixedDate });
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  window.matchMedia = query => ({ matches: query.includes('max-width: 767px') ? width < 768 : false,
    addEventListener() {}, removeEventListener() {} });
  const scrolls = [];
  window.HTMLElement.prototype.scrollIntoView = function() { scrolls.push(this); };
  window.scrollTo = () => {}; window.confirm = () => true;
  for (const [key, value] of Object.entries(stored)) window.sessionStorage.setItem(key, value);
  const saves = [];
  let changeOwner, toggleView, finishSave;
  function App() {
    const [owner, setOwner] = React.useState('A'), [records, setRecords] = React.useState(accounts);
    const [viewState, setViewState] = React.useState(undefined), [visible, setVisible] = React.useState(true);
    React.useLayoutEffect(() => { changeOwner = setOwner; toggleView = setVisible; }, []);
    return visible ? React.createElement(HomeView, { activeProfile: { ...profile, id: owner, user_id: owner, records: records[owner] },
      ...(controlled ? { viewState, onViewStateChange: setViewState } : {}),
      updateRecord: async (date, value, options) => {
        saves.push({ owner, date, record: structuredClone(value) });
        if (pending) await new Promise(resolve => { finishSave = resolve; });
        const canonical = { ...value, version: String(Number(value.version ?? 0) + 1), generation };
        setRecords(current => ({ ...current, [owner]: { ...current[owner], [date]: canonical } }));
        options?.onConfirmed?.(canonical, generation); return true;
      } }) : React.createElement('p', null, 'Otra sección sintética');
  }
  const { createRoot } = await import('react-dom/client');
  let reactRoot = createRoot(document.getElementById('root'));
  await act(() => reactRoot.render(React.createElement(App)));
  t.after(async () => { await act(() => reactRoot.unmount()); dom.window.close();
    for (const [name, value] of Object.entries(saved)) globalThis[name] = value; });
  const click = async node => { assert.ok(node, 'Requested control exists'); await act(async () => { node.click(); await new Promise(setImmediate); }); };
  const button = name => [...document.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === name || el.textContent.trim() === name);
  return { saves, scrolls, click, button,
    day: date => document.querySelector(`.home-date-nav [data-day="${date}"]`),
    selected: () => document.querySelector('.home-date-context time').dateTime,
    switchOwner: async owner => act(() => changeOwner(owner)),
    awayAndBack: async () => { await act(() => toggleView(false)); await act(() => toggleView(true)); },
    reload: async () => { await act(() => reactRoot.unmount()); reactRoot = createRoot(document.getElementById('root')); await act(() => reactRoot.render(React.createElement(App))); },
    finish: async () => act(async () => { finishSave(); await new Promise(setImmediate); }),
    advanceClock: async value => act(() => { clockNow = value; window.dispatchEvent(new window.Event('focus')); document.dispatchEvent(new window.Event('visibilitychange')); }),
  };
}
async function fill(id, value) {
  const input = typeof id === 'string' ? document.getElementById(id) : id; assert.ok(input, typeof id === 'string' ? id : 'Requested input');
  const prototype = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  await act(() => { Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
const submit = async () => act(async () => {
  document.querySelector('.entry-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(setImmediate);
});

test('local calendar validation and week navigation preserve the existing range, leap days and year boundaries', () => {
  assert.deepEqual(homeDateBounds(today), { min: '2025-01-01', max: today });
  for (const value of ['2026-02-30', '2026-11-13', '2024-12-31', '2026-1-2', null]) assert.equal(isHomeDate(value, today), false);
  assert.equal(isHomeDate('2028-02-29', '2028-03-01'), true);
  assert.equal(isHomeDate('2027-02-29', '2027-03-01'), false);
  assert.deepEqual(homeWeek('2027-01-01'), ['2026-12-27','2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02']);
  assert.equal(moveHomeWeek('2026-11-08', 1, today), today);
  assert.equal(moveHomeWeek('2025-01-03', -1, today), '2025-01-01');
  assert.equal(normalizeHomePresentation({ dailyDateStr: '2026-02-30', history: { view: 'invalid', dateStr: '2030-01-01', anchor: 'oops' } }, today).dailyDateStr, today);
});

test('one weekly selection updates meals, workout, water, steps, weight and the daily date together without writes', async t => {
  const view = await mount(t);
  assert.equal(document.querySelectorAll('.home-week-days button').length, 7);
  assert.equal(view.day('2026-11-13').disabled, true);
  const panel = document.querySelector('.daily-panel');
  await view.click(view.day(yesterday));
  assert.equal(view.selected(), yesterday);
  assert.equal(document.querySelector('.daily-heading time').dateTime, yesterday);
  assert.equal(document.querySelector('.daily-panel'), panel);
  assert.match(document.querySelector('.daily-records').textContent, /Comida de ayer.*Fútbol de ayer|Fútbol de ayer.*Comida de ayer/s);
  assert.doesNotMatch(document.querySelector('.daily-records').textContent, /Comida de hoy/);
  const habitValues = [...document.querySelectorAll('.habit-metric')].map(el => el.textContent).join(' ');
  assert.match(habitValues, /2[.\s]?500/); assert.match(habitValues, /8[.\s]?500/); assert.match(habitValues, /71[,.]2/);
  assert.match(document.querySelector('.energy-metrics').textContent, /900/);
  assert.equal(view.day(yesterday).getAttribute('aria-pressed'), 'true');
  assert.equal(view.saves.length, 0);
  await view.click(view.button('Semana anterior')); assert.equal(view.selected(), '2026-11-04');
  await view.click(view.button('Hoy')); assert.equal(view.selected(), today);
  assert.equal(view.button('Semana siguiente').disabled, true);
});

test('selected presentation survives reload and controlled tab remount, scoped to the account with no records in storage', async t => {
  const view = await mount(t, { controlled: true });
  await view.click(view.day(yesterday)); await view.awayAndBack(); assert.equal(view.selected(), yesterday);
  await view.reload(); assert.equal(view.selected(), yesterday);
  const saved = JSON.parse(window.sessionStorage.getItem(homePresentationKey('A')));
  assert.equal(saved.dailyDateStr, yesterday); assert.deepEqual(Object.keys(saved).sort(), ['dailyDateStr','history','openedFromHistory','version']);
  assert.doesNotMatch(JSON.stringify(saved), /Comida|calories|water|token|records/);
  await view.click(document.querySelector('.daily-quick-actions button'));
  await fill('add-meal-description', 'Borrador exclusivo de A');
  await view.switchOwner('B'); assert.equal(view.selected(), today);
  assert.equal(document.querySelector('.entry-form'), null, 'An account change cannot expose the prior account draft, even without a HomeView key');
  assert.doesNotMatch(document.querySelector('.daily-records').textContent, /Comida de ayer|Fútbol de ayer/);
  assert.equal(JSON.parse(window.sessionStorage.getItem(homePresentationKey('B'))).dailyDateStr, today);
  await view.switchOwner('A'); assert.equal(view.selected(), yesterday);
  assert.equal(document.querySelector('.entry-form'), null, 'Presentation storage never restores entry drafts');
  assert.equal(view.saves.length, 0);
});

test('corrupt and future restored dates cannot select a future writer', async t => {
  const view = await mount(t, { stored: { [homePresentationKey('A')]: JSON.stringify({ version: 1, dailyDateStr: '2030-01-01', history: { view: 'month', dateStr: 'oops', anchor: '2030-01-01' } }) } });
  assert.equal(view.selected(), today); await view.click(view.day('2026-11-13'));
  assert.equal(view.selected(), today); assert.equal(view.saves.length, 0);
  window.sessionStorage.setItem(homePresentationKey('A'), '{broken-json');
  await view.reload(); assert.equal(view.selected(), today);
  Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new Error('Storage unavailable'); } });
  await view.reload(); assert.equal(view.selected(), today);
});

test('a desktop weekly click cannot retarget or dismiss a meal draft, and confirmation writes its original date once', async t => {
  const view = await mount(t, { width: 1440 });
  await view.click(document.querySelector('.daily-quick-actions button'));
  await fill('add-meal-description', 'Borrador de prueba'); await fill('add-meal-calories', '400');
  const textarea = document.getElementById('add-meal-description');
  await view.click(view.day(yesterday));
  assert.equal(view.selected(), today); assert.equal(document.getElementById('add-meal-description'), textarea);
  assert.equal(textarea.value, 'Borrador de prueba'); assert.match(document.querySelector('.home-date-blocked').textContent, /borrador se conserva/);
  const form = document.querySelector('.entry-form');
  await view.click(view.button('Volver al registro en edición'));
  assert.equal(document.querySelector('.entry-form'), form); assert.equal(document.getElementById('add-meal-description'), textarea);
  assert.equal(textarea.value, 'Borrador de prueba'); assert.equal(view.selected(), today);
  await submit(); assert.equal(view.saves.length, 1); assert.equal(view.saves[0].date, today);
  assert.equal(view.saves[0].record.meals.at(-1).name, 'Borrador de prueba');
  await view.click(view.day(yesterday)); assert.equal(view.selected(), yesterday);
});

test('the first supported week disables previous-week navigation without disabling its valid days', async t => {
  const view = await mount(t, { stored: { [homePresentationKey('A')]: JSON.stringify({ version: 1, dailyDateStr: '2025-01-02' }) } });
  assert.equal(view.selected(), '2025-01-02'); assert.equal(view.button('Semana anterior').disabled, true);
  assert.equal(view.day('2024-12-31').disabled, true); assert.equal(view.day('2025-01-01').disabled, false);
  await view.click(view.button('Semana siguiente')); assert.equal(view.selected(), '2025-01-09');
  assert.equal(view.saves.length, 0);
});

test('pending exercise save remains bound to the selected historical day', async t => {
  const view = await mount(t, { pending: true }); await view.click(view.day(yesterday));
  await view.click(document.querySelectorAll('.daily-quick-actions button')[1]);
  for (const [id, value] of Object.entries({ 'add-workout-activity': 'Caminata sintética', 'add-workout-duration': '20', 'add-workout-calories': '70' })) await fill(id, value);
  await submit(); assert.equal(view.saves.length, 1); assert.equal(view.saves[0].date, yesterday);
  await view.click(view.button('Hoy')); assert.equal(view.selected(), yesterday);
  await view.finish(); await view.click(view.button('Hoy')); assert.equal(view.selected(), today);
});

test('a delayed habit write keeps its original day while another day is visible', async t => {
  const view = await mount(t); await view.click(view.day(yesterday)); await view.click(view.button('Sumar 250 ml de agua'));
  await view.click(view.button('Hoy')); assert.equal(view.selected(), today);
  await act(async () => new Promise(resolve => setTimeout(resolve, 450)));
  assert.equal(view.saves.length, 1); assert.equal(view.saves[0].date, yesterday); assert.equal(view.saves[0].record.water, 2750);
  assert.match(document.querySelector('.habit-metric').textContent, /1[.\s]?000/);
});

test('blurred step edits save their selected day before navigation and weight confirmation keeps that same date', async t => {
  const view = await mount(t); await view.click(view.day(yesterday));
  await view.click(view.button('Editar total de pasos'));
  const steps = document.querySelector('.daily-habits input'); await fill(steps, '9200');
  await act(() => steps.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })));
  await view.click(view.button('Hoy')); assert.equal(view.selected(), today);
  await act(async () => new Promise(resolve => setTimeout(resolve, 450)));
  assert.equal(view.saves.length, 1); assert.equal(view.saves[0].date, yesterday); assert.equal(view.saves[0].record.steps, 9200);
  assert.match(view.button('Editar total de pasos').textContent, /1[.\s]?000/);
  await view.click(view.day(yesterday)); await view.click(document.querySelector('[title="Registrar peso"]'));
  const weight = document.querySelector('input[inputmode="decimal"]'); await fill(weight, '72.5');
  await view.click(view.button('Hoy')); assert.equal(view.selected(), yesterday); assert.equal(weight.value, '72.5');
  await view.click(view.button('Guardar'));
  assert.equal(view.saves.length, 2); assert.equal(view.saves[1].date, yesterday); assert.equal(view.saves[1].record.weight, 72.5);
  assert.equal(view.saves[1].record.steps, 9200); assert.equal(view.saves[1].record.meals[0].name, 'Comida de ayer');
});

test('mobile monthly access opens the preserved history without changing the daily date, and arrows move focus without selecting', async t => {
  const view = await mount(t); const history = document.querySelector('[data-history-root]');
  assert.equal(document.querySelector('.home-history-content').hidden, true);
  await view.click(view.button('Abrir calendario mensual'));
  assert.equal(document.querySelector('.home-history-content').hidden, false);
  assert.equal(document.querySelector('[data-history-root]'), history); assert.equal(view.selected(), today);
  assert.equal(view.scrolls.at(-1), history);
  view.day(today).focus(); await act(() => view.day(today).dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
  assert.equal(document.activeElement, view.day(yesterday)); assert.equal(view.selected(), today);
  assert.equal(view.saves.length, 0);
});

test('a local midnight refresh changes Hoy to a past date without changing a draft or its writer date', async t => {
  const view = await mount(t); await view.click(document.querySelector('.daily-quick-actions button'));
  await fill('add-meal-description', 'Borrador de medianoche'); await fill('add-meal-calories', '400');
  const form = document.querySelector('.entry-form'); assert.equal(document.querySelector('.home-date-kicker').textContent, 'Hoy');
  await view.advanceClock('2026-11-13T00:01:00');
  assert.equal(view.selected(), today); assert.equal(document.querySelector('.home-date-kicker').textContent, 'Fecha anterior');
  assert.equal(view.day('2026-11-13').disabled, false); assert.equal(view.button('Hoy').disabled, false);
  assert.equal(document.querySelector('.entry-form'), form); assert.equal(document.getElementById('add-meal-description').value, 'Borrador de medianoche');
  await submit(); assert.equal(view.saves.length, 1); assert.equal(view.saves[0].date, today);
});

test('the annual range moving forward cannot silently retarget a validly selected historical draft', async t => {
  const oldDay = '2025-01-02';
  const view = await mount(t, { initialNow: '2026-12-31T23:59:00', stored: { [homePresentationKey('A')]: JSON.stringify({ version: 1, dailyDateStr: oldDay }) } });
  assert.equal(view.selected(), oldDay); await view.click(document.querySelector('.daily-quick-actions button'));
  await fill('add-meal-description', 'Borrador del año anterior'); await fill('add-meal-calories', '300');
  await view.advanceClock('2027-01-01T00:01:00');
  assert.equal(view.selected(), oldDay); assert.equal(document.querySelector('.daily-heading time').dateTime, oldDay);
  assert.equal(document.getElementById('add-meal-description').value, 'Borrador del año anterior');
  await submit(); assert.equal(view.saves.length, 1); assert.equal(view.saves[0].date, oldDay);
  await view.reload(); assert.equal(view.selected(), '2027-01-01', 'A fresh restoration still enforces the current supported date range');
});
