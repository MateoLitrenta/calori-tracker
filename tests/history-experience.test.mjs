import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';
import React, { act } from 'react';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import { aggregateEnergy } from '../src/utils/helpers.ts';
import { buildHistoryPeriods } from '../src/utils/historyPeriods.ts';

// These tests exercise real React components and presentation helpers. Auth,
// Storage and the record writer are synthetic boundaries, not certified services.
const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
const url = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const cache = new Map();
const boundaries = {
  'lib/supabase.ts': 'export const supabase = { storage: { from: () => ({}) } };',
  'services/aiService.ts': 'export const estimateMeal = async () => ({}); export const estimateWorkout = async () => ({});',
  'components/MealPhoto.tsx': 'export const MealPhotoPicker = () => null; export const MealThumbnail = () => null;',
};
async function compile(file) {
  if (cache.has(file)) return cache.get(file);
  const relative = path.relative(sourceRoot, file).replaceAll('\\', '/');
  if (boundaries[relative]) return url(boundaries[relative]);
  const source = (await readFile(file, 'utf8')).replace(/import ['"][^'"]+\.css['"];?/g, '')
    .replace(/import\s+\{([^}]+)\}\s+from ['"]@phosphor-icons\/react['"];?/g, (_, names) =>
      names.split(',').filter(name => name.trim()).map(name => 'const ' + name.trim() + ' = () => null;').join('\n'));
  let code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 } }).outputText;
  const specifiers = new Set([...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]));
  for (const specifier of specifiers) {
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
const { default: HomeView } = await import(await compile(path.join(sourceRoot, 'components/HomeView.tsx')));
const today = '2026-11-12';
const yesterday = '2026-11-11';
const mealDay = '2026-11-10';
const workoutDay = '2026-11-09';
const partialDay = '2026-11-08';
const waterDay = '2026-11-07';
const emptyDay = '2026-11-06';
const generation = '22222222-2222-4222-8222-222222222222';
const profile = { id: 'test', user_id: 'test', name: 'Test', age: 30, sex: 'Masculino', weight: 70,
  height: 170, goal: 'Mantenimiento', activity: 'Moderado', records: {}, recordProtocol: 'atomic', recordGeneration: generation };
const record = (dateStr, patch = {}) => ({ dateStr, date: new Date(dateStr + 'T12:00:00'),
  meals: [], workouts: [], water: 0, steps: 0, version: '1', generation, ...patch });
const meal = (name = 'Almuerzo con verduras') => ({ id: '11111111-1111-4111-8111-111111111111',
  name, type: 'Almuerzo', calories: 650, time: '12:30', details: 'Verduras y arroz' });
const workout = { id: '33333333-3333-4333-8333-333333333333', activity: 'Correr',
  duration: 35, calories: 280, muscles: [], time: '18:15' };
const fixtures = () => ({
  [today]: record(today, { meals: [meal('Comida de hoy')], water: 1500, steps: 4000 }),
  [yesterday]: record(yesterday, { meals: [meal('Comida de ayer')], workouts: [workout], water: 2000, steps: 8500 }),
  [mealDay]: record(mealDay, { meals: [meal()] }),
  [workoutDay]: record(workoutDay, { workouts: [workout] }),
  [partialDay]: record(partialDay, { steps: 7000 }),
  [waterDay]: record(waterDay, { water: 2500, weight: 71.2 }),
});

async function mount(t, initial = fixtures(), { width: initialWidth = 1440, controlled = false } = {}) {
  const NativeDate = globalThis.Date;
  class FixedDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : ['2026-11-12T12:00:00'])); }
    static now() { return new NativeDate('2026-11-12T12:00:00').getTime(); }
  }
  const dom = new JSDOM('<main class="app-main"><div id="root"></div></main>', { pretendToBeVisual: true });
  const saved = {};
  for (const name of ['window', 'document', 'HTMLElement', 'getComputedStyle', 'IS_REACT_ACT_ENVIRONMENT', 'Date', 'ResizeObserver']) saved[name] = globalThis[name];
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement; globalThis.getComputedStyle = dom.window.getComputedStyle;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true; globalThis.Date = FixedDate;
  const resizeObservers = [];
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.targets = new Set(); this.disconnected = false; resizeObservers.push(this); }
    observe(target) { this.targets.add(target); }
    disconnect() { this.disconnected = true; this.targets.clear(); }
  };
  let width = initialWidth;
  const queries = [];
  window.matchMedia = query => {
    const media = { media: query, listeners: new Set(), get matches() {
      const min = /min-width:\s*(\d+)px/.exec(query), max = /max-width:\s*(\d+)px/.exec(query);
      return (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]));
    }, addEventListener(_type, callback) { this.listeners.add(callback); }, removeEventListener(_type, callback) { this.listeners.delete(callback); } };
    queries.push(media); return media;
  };
  Object.defineProperty(window, 'innerWidth', { get: () => width });
  const scrolls = [];
  window.HTMLElement.prototype.scrollIntoView = function(options) { scrolls.push({ node: this, options }); };
  window.scrollTo = () => {};
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  const saves = [], contextChanges = [];
  function App() {
    const [records, setRecords] = React.useState(initial);
    const [showHome, setShowHome] = React.useState(true);
    const [viewState, setViewState] = React.useState(undefined);
    const home = React.createElement(HomeView, { activeProfile: { ...profile, records },
      ...(controlled ? { viewState, onViewStateChange: next => {
        contextChanges.push({ state: structuredClone(next), detailMinBlockSize: document.querySelector('.ah-detail')?.style.minBlockSize });
        setViewState(next);
      } } : {}),
      updateRecord: async (date, value, options) => {
        saves.push({ date, record: structuredClone(value) });
        const canonical = { ...value, version: String(Number(value.version ?? 0) + 1), generation };
        setRecords(current => ({ ...current, [date]: canonical }));
        options?.onConfirmed?.(canonical, generation);
        return true;
      } });
    if (!controlled) return home;
    return React.createElement(React.Fragment, null,
      React.createElement('button', { onClick: () => setShowHome(false) }, 'Otra sección de prueba'),
      React.createElement('button', { onClick: () => setShowHome(true) }, 'Regresar a Inicio de prueba'),
      showHome ? home : React.createElement('p', { 'data-other-view': true }, 'Otra vista sintética'));
  }
  await act(() => root.render(React.createElement(App)));
  let mounted = true;
  const unmount = async () => { if (mounted) { mounted = false; await act(() => root.unmount()); } };
  t.after(async () => { await unmount(); dom.window.close();
    for (const [name, value] of Object.entries(saved)) globalThis[name] = value; });
  const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text || node.getAttribute('aria-label') === text);
  const day = date => document.querySelector('.history-day[data-date="' + date + '"]');
  const click = async node => { assert.ok(node, 'The requested control must exist'); await act(() => node.click()); };
  return { saves, button, day, scrolls, contextChanges, resizeObservers, unmount, click,
    scale: async name => click(button(name)),
    resize: async nextWidth => act(() => { width = nextWidth;
      for (const query of queries) query.listeners.forEach(listener => listener({ matches: query.matches, media: query.media }));
      window.dispatchEvent(new window.Event('resize'));
      for (const observer of resizeObservers) if (!observer.disconnected) observer.callback([], observer); }),
    selectDay: async date => click(day(date)),
    open: async () => click(button('Abrir registros del día')),
    heading: () => document.querySelector('.daily-heading time').dateTime,
    detail: () => document.querySelector('.ah-detail'),
  };
}
const press = async (node, key) => act(() => node.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
async function fill(id, value) {
  const input = document.getElementById(id);
  assert.ok(input, id + ' must remain mounted');
  const prototype = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  await act(() => { Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
async function submit() {
  await act(async () => { document.querySelector('.entry-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(setImmediate); });
}

test('history defaults to a numbered month with three periods, today and an immediately visible contextual detail', async t => {
  const view = await mount(t);
  const history = document.querySelector('.activity-history-v2');
  assert.match(history.querySelector('h2').textContent, /Tu actividad/);
  const selector = history.querySelector('[aria-label="Período del historial"]');
  assert.deepEqual([...selector.querySelectorAll('button')].map(button => button.textContent.trim()), ['Semana', 'Mes', 'Año']);
  assert.equal(selector.querySelector('[aria-pressed="true"]').textContent.trim(), 'Mes');
  assert.equal(history.querySelector('.history-annual-calendar'), null);
  const days = [...history.querySelectorAll('.history-day[data-date]')];
  assert.ok(days.length >= 28 && days.length <= 42, 'The main calendar is a month, not 365 miniature selectors');
  assert.equal(new Set(days.map(day => day.dataset.date)).size, days.length);
  assert.ok(days.every(day => day.textContent.includes(String(Number(day.dataset.date.slice(-2))))));
  assert.equal(view.day(today).getAttribute('aria-current'), 'date');
  assert.equal(view.day(today).getAttribute('aria-pressed'), 'true');
  assert.equal(view.detail().getAttribute('role'), 'region');
  assert.equal(view.detail().getAttribute('aria-label'), 'Detalle del día');
  assert.ok(view.button('Hoy'));
  assert.ok(view.button('Abrir registros del día'));
  assert.equal(view.saves.length, 0);
});

test('selecting yesterday updates only its contextual detail, without changing the daily writer or scrolling the page', async t => {
  const view = await mount(t);
  const daily = document.querySelector('.daily-panel'), habits = document.querySelector('.daily-habits');
  document.documentElement.scrollTop = 128;
  const beforeScrolls = view.scrolls.length;
  await view.selectDay(yesterday);
  assert.equal(view.day(yesterday).getAttribute('aria-pressed'), 'true');
  assert.equal(view.day(today).getAttribute('aria-current'), 'date');
  assert.equal(view.heading(), today);
  assert.match(view.detail().textContent, /Comida de ayer/);
  assert.equal(document.querySelector('.daily-panel'), daily);
  assert.equal(document.querySelector('.daily-habits'), habits);
  assert.equal(document.documentElement.scrollTop, 128);
  assert.equal(view.scrolls.length, beforeScrolls, 'Previewing a date must not scroll another section');
  assert.equal(view.saves.length, 0);
});

test('a shorter preview reserves its measured detail before publishing selection, and releases it for another width or period', async t => {
  const view = await mount(t, fixtures(), { controlled: true, width: 768 });
  const detail = view.detail();
  const observer = view.resizeObservers.find(candidate => candidate.targets.has(detail));
  assert.ok(observer, 'The detail observes line-wrapping width changes');
  const frames = new Map();
  let nextFrame = 0;
  window.requestAnimationFrame = callback => { const id = ++nextFrame; frames.set(id, callback); return id; };
  window.cancelAnimationFrame = id => frames.delete(id);
  const flushFrame = async () => act(() => {
    const callbacks = [...frames.values()]; frames.clear();
    for (const callback of callbacks) callback(Date.now());
  });
  let detailWidth = 400, detailHeight = 312;
  detail.getBoundingClientRect = () => ({ width: detailWidth, height: detailHeight, top: 0, bottom: detailHeight, left: 0, right: detailWidth });
  await view.resize(768); // Deliver its first real geometry before a selection.
  await flushFrame();
  assert.equal(detail.style.minBlockSize, '', 'There is no arbitrary fixed height before interaction');
  await view.selectDay(emptyDay);
  assert.equal(view.contextChanges.at(-1).detailMinBlockSize, '312px',
    'Reserve is applied in the activation event, before React can shrink the page and clamp scroll');
  assert.equal(detail.style.minBlockSize, '312px');
  assert.equal(view.heading(), today);
  detailHeight = 190;
  await view.selectDay(mealDay);
  assert.equal(detail.style.minBlockSize, '312px', 'A shorter measured follow-up must not shrink the reserved area');
  detailWidth = 360;
  await view.resize(393);
  assert.equal(detail.style.minBlockSize, '312px', 'ResizeObserver delivery itself must not write layout');
  assert.equal(frames.size, 1);
  detailWidth = 350;
  await view.resize(375);
  assert.equal(frames.size, 1, 'Multiple observer deliveries are coalesced into one frame');
  await flushFrame();
  assert.equal(detail.style.minBlockSize, '', 'The next frame releases a reserve from another wrapping width');
  detailHeight = 284;
  await view.selectDay(workoutDay);
  assert.equal(detail.style.minBlockSize, '284px', 'The next reserve comes from the new measurement');
  detailWidth = 340;
  await view.resize(375);
  assert.equal(frames.size, 1);
  detailHeight = 350;
  await view.selectDay(partialDay);
  assert.equal(detail.style.minBlockSize, '350px');
  await flushFrame();
  assert.equal(detail.style.minBlockSize, '350px', 'An older resize frame must not remove a newer click reservation');
  await view.scale('Año');
  assert.equal(view.contextChanges.at(-1).detailMinBlockSize, '');
  assert.equal(detail.style.minBlockSize, '', 'A different period can find its own natural height');
  assert.equal(view.saves.length, 0);
  await view.scale('Mes');
  await view.selectDay(mealDay);
  detailWidth = 330;
  await view.resize(320);
  assert.equal(frames.size, 1);
  const cancelledCallbacks = [...frames.values()];
  const beforeUnmount = detail.style.minBlockSize;
  await view.unmount();
  assert.equal(observer.disconnected, true);
  assert.equal(frames.size, 0, 'Unmount cancels the outstanding frame');
  for (const callback of cancelledCallbacks) callback(Date.now());
  assert.equal(detail.style.minBlockSize, beforeUnmount, 'A late disposed callback cannot touch the detached detail');
});

test('Hoy immediately returns the explored date and calendar context, without submitting anything', async t => {
  const view = await mount(t);
  await view.selectDay(mealDay);
  await view.click(view.button('Mes anterior'));
  assert.ok(document.querySelector('.history-day[data-date^="2026-10-"]'));
  await view.click(view.button('Hoy'));
  assert.ok(view.day(today));
  assert.equal(view.day(today).getAttribute('aria-pressed'), 'true');
  assert.match(view.detail().textContent, /Comida de hoy/);
  assert.equal(view.heading(), today);
  assert.equal(view.saves.length, 0);
});

test('previous and next month change a readable calendar, preserve daily widgets and never save records', async t => {
  const view = await mount(t);
  const daily = document.querySelector('.daily-panel');
  await view.click(view.button('Mes anterior'));
  assert.ok(document.querySelector('.history-day[data-date="2026-10-01"]'));
  assert.equal(document.querySelector('.daily-panel'), daily);
  assert.equal(view.heading(), today);
  await view.click(view.button('Mes siguiente'));
  assert.ok(view.day(today));
  assert.equal(view.saves.length, 0);
});

test('a genuinely empty day communicates no records without inventing energy or activity', async t => {
  const view = await mount(t);
  await view.selectDay(emptyDay);
  assert.match(view.detail().textContent, /Sin registros|Todavía no|No registraste/);
  assert.doesNotMatch(view.detail().textContent, /Almuerzo con verduras|Correr/);
  assert.doesNotMatch(view.detail().textContent, /0 kcal/);
  assert.equal(view.heading(), today);
  assert.equal(view.saves.length, 0);
});

test('a meal day explains what and when was registered using the existing record content', async t => {
  const records = fixtures(), frozen = structuredClone(records);
  const view = await mount(t, records);
  await view.selectDay(mealDay);
  assert.match(view.detail().textContent, /Almuerzo con verduras/);
  assert.match(view.detail().textContent, /12:30/);
  assert.match(view.detail().textContent, /650/);
  assert.match(view.day(mealDay).getAttribute('aria-label'), /comida/i);
  assert.deepEqual(records, frozen);
  assert.equal(view.saves.length, 0);
});

test('a workout day exposes its activity and duration independently of food indicators', async t => {
  const view = await mount(t);
  await view.selectDay(workoutDay);
  assert.match(view.detail().textContent, /Correr/);
  assert.match(view.detail().textContent, /35/);
  assert.match(view.detail().textContent, /18:15/);
  assert.match(view.day(workoutDay).getAttribute('aria-label'), /entrenamiento|ejercicio/i);
  assert.equal(view.saves.length, 0);
});

test('steps without meals are shown as incomplete data rather than a complete nutritional day', async t => {
  const view = await mount(t);
  await view.selectDay(partialDay);
  assert.match(view.detail().textContent, /7[.\s]?000/);
  assert.match(view.detail().textContent, /pasos/i);
  assert.match(view.detail().textContent, /incomplet|sin comidas|no registraste comidas/i);
  assert.match(view.day(partialDay).getAttribute('aria-label'), /incomplet|sin comidas/i);
  assert.equal(view.saves.length, 0);
});

test('water and weight remain discoverable when the day has no energy data', async t => {
  const view = await mount(t);
  await view.selectDay(waterDay);
  assert.match(view.detail().textContent, /2[.\s]?500/);
  assert.match(view.detail().textContent, /ml|agua/i);
  assert.match(view.detail().textContent, /71[,.]2/);
  assert.match(view.detail().textContent, /kg|peso/i);
  assert.doesNotMatch(view.detail().textContent, /Sin registros/);
  assert.equal(aggregateEnergy(fixtures(), [waterDay], profile, today).averageBalance, null);
  assert.equal(view.saves.length, 0);
});

test('the year exposes twelve real months and one activation drills into the chosen month and day', async t => {
  const view = await mount(t);
  await view.scale('Año');
  const months = [...document.querySelectorAll('.ah-month[data-month]')];
  assert.equal(months.length, 12);
  assert.equal(new Set(months.map(month => month.dataset.month)).size, 12);
  const november = document.querySelector('.ah-month[data-month="2026-11"]');
  assert.ok(november);
  assert.match(november.getAttribute('aria-label'), /noviembre.*2026/i);
  assert.match(november.textContent, /6 días/,
    'Activity coverage includes the water/weight day; energy averages retain their separate existing denominator');
  await view.click(november);
  assert.equal(document.querySelector('[aria-label="Período del historial"] [aria-pressed="true"]').textContent.trim(), 'Mes');
  await view.selectDay(mealDay);
  assert.match(view.detail().textContent, /Almuerzo con verduras/);
  assert.equal(view.heading(), today);
  assert.equal(view.saves.length, 0);
});

test('previous calendar year remains available without a miniature annual day heatmap', async t => {
  const view = await mount(t);
  await view.scale('Año');
  await view.click(view.button('Año anterior'));
  assert.equal(document.querySelectorAll('.ah-month[data-month^="2025-"]').length, 12);
  assert.equal(document.querySelector('.history-annual-calendar'), null);
  await view.click(view.button('Año siguiente'));
  assert.equal(document.querySelectorAll('.ah-month[data-month^="2026-"]').length, 12);
  assert.equal(view.heading(), today);
  assert.equal(view.saves.length, 0);
});

test('week shows seven exact Sunday-aligned dates and navigates one real week at a time', async t => {
  const view = await mount(t);
  await view.scale('Semana');
  const dates = () => [...document.querySelectorAll('.history-day[data-date]')].map(day => day.dataset.date);
  assert.deepEqual(dates(), ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']);
  await view.click(view.button('Semana anterior'));
  assert.deepEqual(dates(), ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
  await view.click(view.button('Semana siguiente'));
  assert.ok(view.day(today));
  assert.equal(view.heading(), today);
  assert.equal(view.saves.length, 0);
});

test('future dates cannot be selected and future-only records do not manufacture past activity', async t => {
  const future = '2026-11-13';
  const view = await mount(t, { [future]: record(future, { meals: [meal('Future sentinel')] }) });
  const futureButton = view.day(future);
  assert.ok(futureButton);
  assert.equal(futureButton.disabled, true);
  await view.click(futureButton);
  assert.equal(view.day(today).getAttribute('aria-pressed'), 'true');
  assert.doesNotMatch(view.detail().textContent, /Future sentinel/);
  assert.match(view.detail().textContent, /Sin registros|Todavía no|No registraste/);
  await view.scale('Año');
  const december = document.querySelector('.ah-month[data-month="2026-12"]');
  assert.equal(december.disabled, true);
  assert.equal(view.saves.length, 0);
});

test('period changes retain the selected day context and never replace the daily panel or records', async t => {
  const view = await mount(t);
  const daily = document.querySelector('.daily-panel'), journal = document.querySelector('.daily-records');
  await view.selectDay(yesterday);
  for (const scale of ['Semana', 'Año', 'Mes', 'Semana', 'Mes']) {
    await view.scale(scale);
    assert.equal(document.querySelector('.daily-panel'), daily);
    assert.equal(document.querySelector('.daily-records'), journal);
    assert.equal(view.heading(), today);
    assert.match(view.detail().textContent, /Comida de ayer/);
  }
  assert.equal(view.day(yesterday).getAttribute('aria-pressed'), 'true');
  assert.equal(view.saves.length, 0);
});

test('keyboard arrows preview the correct calendar date without opening or retargeting the daily writer', async t => {
  const view = await mount(t);
  const selected = view.day(today);
  assert.equal(document.querySelectorAll('.history-day[tabindex="0"]').length, 1);
  await act(() => selected.focus());
  await press(selected, 'ArrowLeft');
  assert.equal(document.activeElement.dataset.date, yesterday);
  await press(document.activeElement, 'ArrowUp');
  assert.equal(document.activeElement.dataset.date, '2026-11-04');
  assert.equal(view.day('2026-11-04').getAttribute('aria-pressed'), 'true');
  assert.equal(selected.getAttribute('aria-pressed'), 'false');
  assert.equal(view.heading(), today);
  await view.click(document.activeElement);
  assert.equal(view.day('2026-11-04').getAttribute('aria-pressed'), 'true');
  assert.equal(view.heading(), today);
  assert.equal(view.saves.length, 0);
});

test('keyboard Home and End stay on valid dates and never focus a disabled future date', async t => {
  const view = await mount(t);
  await act(() => view.day(today).focus());
  await press(document.activeElement, 'End');
  assert.ok(document.activeElement.matches('.history-day[data-date]'));
  assert.equal(document.activeElement.disabled, false);
  await press(document.activeElement, 'Home');
  assert.ok(document.activeElement.matches('.history-day[data-date]'));
  assert.equal(document.activeElement.disabled, false);
  await act(() => view.day(today).focus());
  await press(document.activeElement, 'ArrowRight');
  assert.equal(document.activeElement.disabled, false);
  assert.ok(document.activeElement.dataset.date <= today);
  assert.equal(view.day(today).getAttribute('aria-pressed'), 'true');
  assert.equal(view.saves.length, 0);
});

test('PageUp and PageDown move between months with the same valid day and keep the writer untouched', async t => {
  const view = await mount(t);
  await act(() => view.day(today).focus());
  await press(document.activeElement, 'PageUp');
  assert.equal(document.activeElement.dataset.date, '2026-10-12');
  assert.equal(document.activeElement.getAttribute('aria-pressed'), 'true');
  assert.equal(view.heading(), today);
  await press(document.activeElement, 'PageDown');
  assert.equal(document.activeElement.dataset.date, today);
  assert.equal(view.heading(), today);
  assert.equal(view.saves.length, 0);
});

test('day controls expose names, selected/today semantics and an accessible keyboard explanation', async t => {
  const view = await mount(t);
  const selected = view.day(today);
  assert.match(selected.getAttribute('aria-label'), /12.*noviembre.*2026/i);
  assert.equal(selected.type, 'button');
  assert.equal(selected.getAttribute('aria-current'), 'date');
  assert.equal(selected.getAttribute('aria-pressed'), 'true');
  const described = selected.closest('[aria-describedby]');
  assert.ok(described);
  const help = document.getElementById(described.getAttribute('aria-describedby'));
  assert.ok(help);
  assert.match(help.textContent, /Flechas|flechas/);
  assert.ok(document.querySelector('[aria-live="polite"]'), 'Selection feedback is announced without a page navigation');
  const icons = [...selected.querySelectorAll('svg')];
  assert.ok(icons.every(icon => icon.getAttribute('aria-hidden') === 'true'));
  assert.equal(view.saves.length, 0);
});

test('opening the complete day is explicit and uses precisely the previewed date', async t => {
  const view = await mount(t);
  await view.selectDay(mealDay);
  assert.equal(view.heading(), today);
  await view.open();
  assert.equal(view.heading(), mealDay);
  assert.match(document.querySelector('.daily-records').textContent, /Almuerzo con verduras/);
  assert.equal(view.day(mealDay).getAttribute('aria-pressed'), 'true');
  assert.equal(view.saves.length, 0);
});

test('returning to activity restores the explored date and view, with focus instead of an unexpected selection change', async t => {
  const view = await mount(t);
  await view.selectDay(yesterday);
  await view.scale('Semana');
  await view.open();
  assert.equal(view.heading(), yesterday);
  assert.ok(document.activeElement.matches('h2, h3, h4'));
  assert.match(document.activeElement.textContent, /Registros del día/);
  assert.equal(view.scrolls.at(-1).node, document.activeElement);
  await view.click(view.button('← Volver a Tu actividad'));
  assert.equal(document.querySelector('[aria-label="Período del historial"] [aria-pressed="true"]').textContent.trim(), 'Semana');
  assert.equal(view.day(yesterday).getAttribute('aria-pressed'), 'true');
  assert.equal(document.activeElement, document.querySelector('[data-history-root]'));
  assert.equal(view.heading(), yesterday);
  assert.equal(view.saves.length, 0);
});

test('controlled activity context survives a Home unmount and return from another section', async t => {
  const view = await mount(t, fixtures(), { controlled: true });
  await view.selectDay(yesterday);
  await view.scale('Semana');
  await view.open();
  assert.equal(view.heading(), yesterday);
  await view.click(view.button('Otra sección de prueba'));
  assert.ok(document.querySelector('[data-other-view]'));
  assert.equal(document.querySelector('.activity-history-v2'), null);
  await view.click(view.button('Regresar a Inicio de prueba'));
  assert.equal(view.heading(), yesterday);
  assert.equal(view.day(yesterday).getAttribute('aria-pressed'), 'true');
  assert.equal(document.querySelector('[aria-label="Período del historial"] [aria-pressed="true"]').textContent.trim(), 'Semana');
  assert.match(view.detail().textContent, /Comida de ayer/);
  assert.equal(view.saves.length, 0);
});

test('a boundary arrow cannot leave a stale focus request that steals focus on the next mouse selection', async t => {
  const view = await mount(t);
  await act(() => view.day(today).focus());
  await press(document.activeElement, 'ArrowRight');
  assert.equal(document.activeElement, view.day(today));
  await act(() => { view.day(yesterday).focus(); view.day(yesterday).click(); });
  assert.equal(document.activeElement, view.day(yesterday));
  assert.equal(view.day(yesterday).getAttribute('aria-pressed'), 'true');
  assert.equal(view.heading(), today);
  assert.equal(view.saves.length, 0);
});

test('meal drafts survive date, period and month exploration and submit once to their original day', async t => {
  const view = await mount(t);
  await view.click(view.button('+ Comida'));
  await fill('add-meal-description', 'Borrador conservado al explorar');
  await fill('add-meal-calories', '400');
  const textarea = document.getElementById('add-meal-description');
  await view.selectDay(mealDay);
  for (const scale of ['Semana', 'Año', 'Mes']) await view.scale(scale);
  await view.click(view.button('Mes anterior'));
  assert.equal(document.getElementById('add-meal-description'), textarea);
  assert.equal(textarea.value, 'Borrador conservado al explorar');
  assert.equal(view.heading(), today);
  assert.equal(view.saves.length, 0);
  await submit();
  assert.equal(view.saves.length, 1);
  assert.equal(view.saves[0].date, today);
  assert.equal(view.saves[0].record.meals.length, 2);
  assert.equal(view.saves[0].record.meals.at(-1).name, 'Borrador conservado al explorar');
  assert.match(document.querySelector('.daily-records').textContent, /Borrador conservado al explorar/);
});

test('a pending meal form prevents explicit opening from silently retargeting or discarding its input', async t => {
  const view = await mount(t);
  await view.click(view.button('+ Comida'));
  await fill('add-meal-description', 'No cambiar mi día');
  const form = document.querySelector('.entry-form');
  await view.selectDay(mealDay);
  await view.open();
  assert.equal(view.heading(), today);
  assert.equal(document.querySelector('.entry-form'), form);
  assert.equal(document.getElementById('add-meal-description').value, 'No cambiar mi día');
  assert.equal(view.saves.length, 0);
});

test('exercise drafts retain their fields and original date while browsing a different calendar day', async t => {
  const view = await mount(t);
  await view.click(view.button('+ Ejercicio'));
  const values = { 'add-workout-activity': 'Correr', 'add-workout-duration': '35', 'add-workout-calories': '280',
    'add-workout-notes': 'Borrador de ejercicio que debe seguir disponible' };
  for (const [id, value] of Object.entries(values)) await fill(id, value);
  const form = document.querySelector('.entry-form');
  await view.selectDay(workoutDay);
  for (const scale of ['Semana', 'Año', 'Mes']) await view.scale(scale);
  await view.open();
  for (const [id, value] of Object.entries(values)) assert.equal(document.getElementById(id).value, value);
  assert.equal(document.querySelector('.entry-form'), form);
  assert.equal(view.heading(), today);
  assert.equal(view.saves.length, 0);
  await submit();
  assert.equal(view.saves.length, 1);
  assert.equal(view.saves[0].date, today);
  assert.equal(view.saves[0].record.workouts.length, 1);
  assert.equal(view.saves[0].record.workouts[0].details, values['add-workout-notes']);
});

test('resizing the activity surface preserves selected context, daily date and pending text', async t => {
  const view = await mount(t);
  await view.click(view.button('+ Comida'));
  await fill('add-meal-description', 'Borrador durante cambio de ancho');
  const form = document.querySelector('.entry-form');
  await view.selectDay(yesterday);
  for (const width of [320, 375, 393, 430, 768, 1440]) {
    await view.resize(width);
    assert.equal(view.heading(), today);
    assert.equal(view.day(yesterday).getAttribute('aria-pressed'), 'true');
    assert.equal(document.getElementById('add-meal-description').value, 'Borrador durante cambio de ancho');
  }
  // EntryFormShell may portal when crossing its existing mobile breakpoint.
  // The form content and date, not DOM identity across that portal, are the contract.
  assert.ok(form);
  assert.equal(view.saves.length, 0);
});

test('optional energy disclosure preserves official period arithmetic and does not complete missing days', async t => {
  const records = fixtures(), frozen = structuredClone(records);
  const view = await mount(t, records);
  await view.selectDay(mealDay);
  const energy = document.querySelector('.activity-history-v2 .ah-energy');
  assert.ok(energy);
  assert.equal(energy.querySelector('summary').textContent.trim(), 'Ver resumen energético');
  const month = buildHistoryPeriods(new Date(today + 'T12:00:00')).month.at(-1);
  const expected = aggregateEnergy(records, month.dates, profile, today);
  const numeric = number => number.toLocaleString('es-AR');
  assert.ok(energy.textContent.includes(numeric(expected.consumed)));
  assert.ok(energy.textContent.includes(numeric(expected.expenditure)));
  assert.ok(energy.textContent.includes(numeric(expected.averageBalance)));
  const accumulated = [...energy.querySelectorAll('div')].find(node => node.querySelector('dt')?.textContent === 'Balance acumulado');
  assert.ok(accumulated, 'The advanced period disclosure retains the existing accumulated balance');
  assert.ok(accumulated.querySelector('dd').textContent.includes(numeric(expected.balance)));
  assert.match(accumulated.querySelector('dd').textContent, /kcal$/);
  assert.ok(energy.textContent.includes(expected.days + ' días con datos energéticos'));
  const originalFigures = [...energy.querySelectorAll('dd')].map(node => node.textContent);
  await view.selectDay(partialDay);
  assert.match(view.detail().textContent, /incomplet|sin comidas/i);
  assert.deepEqual([...energy.querySelectorAll('dd')].map(node => node.textContent), originalFigures,
    'Day preview does not silently change a monthly aggregate into another denominator');
  await view.selectDay(emptyDay);
  assert.doesNotMatch(view.detail().textContent, /0 kcal/);
  await view.click(view.button('Mes anterior'));
  assert.ok([...energy.querySelectorAll('dd')].every(node => node.textContent === 'Sin datos'));
  assert.equal(view.saves.length, 0);
  assert.deepEqual(records, frozen);
});

test('habit detail and its accessible date label preserve precision in the stored values', async t => {
  const records = { [waterDay]: record(waterDay, { water: 2500, weight: 80.12345 }) };
  const view = await mount(t, records);
  await view.selectDay(waterDay);
  assert.match(view.detail().querySelector('.ah-habits').textContent, /80,12345/);
  assert.match(view.day(waterDay).getAttribute('aria-label'), /80,12345/);
  assert.equal(view.saves.length, 0);
  assert.equal(records[waterDay].weight, 80.12345);
});
