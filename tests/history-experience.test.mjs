import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';
import React, { act } from 'react';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import { aggregateEnergy, calculateDailyExpenditure, getBalanceCategory, getBalanceLabel, getHeatmapColor, getNetBalance } from '../src/utils/helpers.ts';
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
const energyRecord = (dateStr, balance, patch = {}) => {
  const base = record(dateStr, patch);
  return { ...base, meals: [{ ...meal(), calories: calculateDailyExpenditure(profile, base) + balance }] };
};

async function mount(t, initial = fixtures(), { width: initialWidth = 1440, controlled = false, reducedMotion = false, dark = false } = {}) {
  const NativeDate = globalThis.Date;
  class FixedDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : ['2026-11-12T12:00:00'])); }
    static now() { return new NativeDate('2026-11-12T12:00:00').getTime(); }
  }
  const dom = new JSDOM('<main class="app-main"><div id="root"></div></main>', { pretendToBeVisual: true });
  dom.window.document.documentElement.classList.toggle('dark', dark);
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
      if (query.includes('prefers-reduced-motion')) return reducedMotion;
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

test('meal-backed deficits, surpluses and equilibrium expose the existing balance category and signed value', async t => {
  const balances = { [mealDay]: -600, [yesterday]: 300, [today]: 0 };
  const initial = Object.fromEntries(Object.entries(balances).map(([date, balance]) => [date, energyRecord(date, balance)]));
  const view = await mount(t, initial);
  for (const [date, balance] of Object.entries(balances)) {
    const cell = view.day(date);
    assert.equal(cell.dataset.balance, getBalanceCategory(balance));
    assert.equal(cell.dataset.completeness, 'with-meals');
    assert.ok(cell.querySelector('.ah-day-fill').classList.contains(getHeatmapColor(balance)));
    assert.ok(cell.textContent.includes(String(balance)), 'Calendar dates must expose the canonical value, not color alone');
    assert.ok(cell.getAttribute('aria-label').includes(getBalanceLabel(balance)));
    await view.selectDay(date);
    const detailBalance = view.detail().querySelector('[data-balance]');
    assert.ok(detailBalance, 'The selected day has a textual balance presentation');
    assert.equal(detailBalance.dataset.balance, getBalanceCategory(balance));
    assert.ok(detailBalance.querySelector('.ah-balance-fill').classList.contains(getHeatmapColor(balance)));
    assert.ok(detailBalance.textContent.includes(String(balance)));
    assert.match(detailBalance.textContent, /kcal/);
  }
  assert.equal(view.saves.length, 0);
});

test('activity without food stays visibly partial and neutral despite its negative canonical estimate', async t => {
  const initial = { [today]: record(today, { steps: 8500, workouts: [{ ...workout, activity: 'Fútbol' }] }),
    [yesterday]: record(yesterday, { water: 2500, weight: 71.2345 }) };
  const view = await mount(t, initial);
  assert.ok(getNetBalance(initial[today], profile) < 0);
  for (const date of [today, yesterday]) {
    const cell = view.day(date);
    assert.equal(cell.dataset.balance, 'empty');
    assert.equal(cell.dataset.completeness, 'partial');
    assert.equal(!!cell.querySelector('.ah-day-fill'), false);
    assert.match(cell.getAttribute('aria-label'), /parcial|sin comidas/i);
    assert.doesNotMatch(cell.getAttribute('aria-label'), /déficit/i, 'A missing meal day cannot announce a confirmed deficit');
    await view.selectDay(date);
    const detailBalance = view.detail().querySelector('[data-balance]');
    assert.ok(detailBalance);
    assert.equal(detailBalance.dataset.balance, 'empty');
    assert.equal(!!detailBalance.querySelector('.ah-balance-fill'), false);
    assert.match(detailBalance.textContent, /parcial|provisional|sin comidas/i);
  }
  await view.scale('Año');
  const month = document.querySelector('.ah-month[data-month="2026-11"]');
  assert.equal(month.dataset.balance, 'empty');
  assert.equal(!!month.querySelector('.ah-balance-reading'), false,
    'A month with zero meal days must not advertise its activity-only estimate as a confirmed average');
  assert.match(month.querySelector('.ah-month-coverage').textContent, /comidas.*0\/12/i);
  assert.match(month.textContent, /parcial|sin comidas/i);
  assert.ok(month.querySelector('[data-sport="football"]'));
  assert.equal(view.saves.length, 0);
});

test('empty and future dates have separate neutral states with no invented balance values', async t => {
  const future = '2026-11-13';
  const view = await mount(t, { [future]: energyRecord(future, -600) });
  assert.equal(view.day(today).dataset.completeness, 'empty');
  assert.equal(view.day(today).dataset.balance, 'empty');
  assert.match(view.day(today).getAttribute('aria-label'), /sin registros/i);
  assert.equal(view.day(future).dataset.completeness, 'future');
  assert.equal(view.day(future).dataset.balance, 'empty');
  assert.equal(view.day(future).disabled, true);
  assert.equal(!!view.day(future).querySelector('.ah-day-fill'), false);
  assert.doesNotMatch(view.day(future).textContent, /-600/);
  assert.equal(view.saves.length, 0);
});

test('football, gym and other sports coexist on a date and every stored workout remains in the daily detail', async t => {
  const workouts = [
    { ...workout, id: 'football', activity: 'Fútbol 5', duration: 60, time: '08:00' },
    { ...workout, id: 'gym', activity: 'Gimnasio', duration: 45, time: '10:00' },
    { ...workout, id: 'other', activity: 'Natación', duration: 35, time: '15:00' },
    { ...workout, id: 'second-other', activity: 'Correr', duration: 25, time: '18:00' },
  ];
  const initial = energyRecord(today, -250, { workouts });
  const view = await mount(t, { [today]: initial });
  const cell = view.day(today);
  for (const sport of ['football', 'gym', 'other']) assert.ok(cell.querySelector('[data-sport="' + sport + '"]'));
  assert.match(cell.getAttribute('aria-label'), /fútbol/i);
  assert.match(cell.getAttribute('aria-label'), /gimnasio/i);
  for (const saved of workouts) {
    const entry = [...view.detail().querySelectorAll('.ah-entries li')].find(node => node.textContent.includes(saved.activity));
    assert.ok(entry, 'Stored workout must be present: ' + saved.activity);
    assert.ok(entry.textContent.includes(String(saved.duration)));
    assert.match(entry.textContent, /min/);
  }
  assert.equal(view.saves.length, 0);
});

test('non-football activities cannot receive a football mark from their notes or substrings', async t => {
  const initial = energyRecord(today, 100, { workouts: [
    { ...workout, activity: 'American football', details: 'fútbol y gimnasio' },
    { ...workout, activity: 'gymnastics', id: 'other-gym' },
  ] });
  const view = await mount(t, { [today]: initial });
  assert.equal(!!view.day(today).querySelector('[data-sport="football"]'), false);
  assert.equal(!!view.day(today).querySelector('[data-sport="gym"]'), false);
  assert.ok(view.day(today).querySelector('[data-sport="other"]'));
  assert.equal(view.saves.length, 0);
});

test('week and annual month averages preserve the official mixed-period denominator and show provisional coverage', async t => {
  const initial = {
    [mealDay]: energyRecord(mealDay, 300, { workouts: [{ ...workout, activity: 'Fútbol', duration: 60 }] }),
    [yesterday]: record(yesterday, { steps: 1000 }),
    [today]: record(today, { water: 2500 }),
  };
  const view = await mount(t, initial);
  const expected = aggregateEnergy(initial, ['2026-11-08', '2026-11-09', mealDay, yesterday, today, '2026-11-13', '2026-11-14'], profile, today);
  await view.scale('Semana');
  const period = document.querySelector('.ah-period-summary .ah-balance-reading');
  assert.ok(period);
  assert.equal(period.dataset.balance, 'empty');
  assert.match(period.textContent, /provisional/i);
  assert.ok(period.textContent.includes(expected.averageBalance.toLocaleString('es-AR')));
  assert.match(period.textContent, /kcal\/día/);
  await view.scale('Año');
  const month = document.querySelector('.ah-month[data-month="2026-11"]');
  assert.equal(month.dataset.balance, 'empty');
  assert.match(month.textContent, /provisional/i);
  assert.ok(month.textContent.includes(expected.averageBalance.toLocaleString('es-AR')));
  assert.match(month.querySelector('.ah-month-coverage').textContent, /comidas.*1\/12/i);
  assert.match(month.getAttribute('aria-label'), /Base 2 días energéticos/i);
  assert.match(month.getAttribute('aria-label'), /fútbol/i);
  assert.ok(month.querySelector('[data-sport="football"]'));
  assert.equal(view.saves.length, 0);
});

test('food-backed annual averages keep balance color while explicitly reporting sparse food coverage', async t => {
  const view = await mount(t, { [today]: energyRecord(today, -92) });
  await view.scale('Año');
  const month = document.querySelector('.ah-month[data-month="2026-11"]');
  assert.equal(month.dataset.balance, 'deficit-low');
  assert.ok(month.textContent.includes('-92'));
  assert.match(month.textContent, /kcal\/día/);
  assert.match(month.querySelector('.ah-month-coverage').textContent, /comidas.*1\/12/i);
  assert.match(month.textContent, /12/);
  assert.equal(view.saves.length, 0);
});

// Verify the compact annual card's semantic content at each responsive input.
// JSDOM does not measure layout; browser captures certify wrapping and clipping.
for (const width of [320, 375, 393, 430, 1440]) for (const dark of [false, true]) {
  test('compact annual cards retain balances, coverage, sports and drill-down at ' + width +
    'px in the ' + (dark ? 'dark' : 'light') + ' theme', async t => {
    const septemberDate = '2026-09-12', octoberDate = '2026-10-12';
    const workouts = [
      { ...workout, id: 'compact-football', activity: 'Fútbol', duration: 60 },
      { ...workout, id: 'compact-gym', activity: 'Gimnasio', duration: 45 },
      { ...workout, id: 'compact-other', activity: 'Natación', duration: 35 },
    ];
    const initial = {
      '2026-03-12': energyRecord('2026-03-12', 0),
      [septemberDate]: energyRecord(septemberDate, -123, { workouts }),
      [octoberDate]: energyRecord(octoberDate, 321),
      [mealDay]: energyRecord(mealDay, 75),
      [yesterday]: record(yesterday, { steps: 1000 }),
      '2026-12-12': energyRecord('2026-12-12', -600),
    };
    const view = await mount(t, initial, { width, dark });
    assert.equal(document.documentElement.classList.contains('dark'), dark);
    await view.scale('Año');
    const month = key => document.querySelector('.ah-month[data-month="' + key + '"]');
    assert.equal(document.querySelectorAll('.ah-month[data-month]').length, 12);
    for (const [key, value, name] of [
      ['2026-03', 0, 'marzo'],
      ['2026-09', -123, 'septiembre'],
      ['2026-10', 321, 'octubre'],
    ]) {
      const card = month(key), balance = card.querySelector('.ah-balance-reading');
      assert.ok(card.textContent.includes(name), 'The month name remains visible');
      assert.equal(card.dataset.balance, getBalanceCategory(value));
      assert.equal(balance.dataset.balance, getBalanceCategory(value));
      assert.match(balance.textContent, new RegExp(value > 0 ? '\\+' + value : String(value)));
      assert.match(balance.textContent, /kcal\/día/);
      assert.match(balance.textContent, value < 0 ? /déficit/i : value > 0 ? /superávit/i : /equilibrio/i);
      assert.match(card.querySelector('.ah-month-coverage').textContent, /comidas.*1\/3[01]/i);
      assert.ok(!card.disabled);
    }
    const september = month('2026-09');
    for (const sport of ['football', 'gym', 'other']) {
      assert.ok(september.querySelector('[data-sport="' + sport + '"]'), sport + ' is still represented');
    }
    assert.match(september.getAttribute('aria-label'), /fútbol.*gimnasio.*otros entrenamientos/i);
    assert.match(september.getAttribute('aria-label'), /3 entrenamientos/);

    const november = month('2026-11');
    const canonical = aggregateEnergy(initial, [mealDay, yesterday], profile, today).averageBalance;
    assert.equal(november.dataset.balance, 'empty');
    assert.equal(november.dataset.provisional, 'true');
    assert.match(november.querySelector('.ah-balance-reading').textContent, /provisional/i);
    assert.match(november.querySelector('.ah-balance-reading').textContent, /kcal\/día/);
    assert.ok(november.textContent.includes(canonical.toLocaleString('es-AR')));
    assert.match(november.querySelector('.ah-month-coverage').textContent, /comidas.*1\/12/i);
    for (const key of ['2026-08', '2026-12']) {
      const card = month(key);
      assert.equal(card.dataset.balance, 'empty');
      assert.equal(!!card.querySelector('.ah-balance-reading'), false);
      assert.equal(!!card.querySelector('[data-sport]'), false);
      assert.doesNotMatch(card.textContent, /déficit|superávit|kcal|-600/i);
    }
    assert.match(month('2026-08').textContent, /sin registros/i);
    assert.match(month('2026-12').textContent, /próximamente/i);
    assert.equal(month('2026-12').disabled, true);

    await view.click(september);
    assert.equal(document.querySelector('[aria-label="Período del historial"] [aria-pressed="true"]').textContent.trim(), 'Mes');
    await view.selectDay(septemberDate);
    assert.match(view.detail().textContent, /Fútbol.*60.*Gimnasio.*45.*Natación.*35/s);
    assert.match(view.detail().textContent, /-123.*kcal/s);
    assert.equal(view.heading(), today, 'Exploration does not change the daily editor');
    assert.equal(view.saves.length, 0, 'Inspecting an annual card never persists a record');
  });
}

test('rapid month and scale changes keep the latest context, one calendar and an untouched record writer', async t => {
  const view = await mount(t, fixtures(), { reducedMotion: false });
  const panel = document.querySelector('.daily-panel');
  const top = 96; document.documentElement.scrollTop = top;
  await view.click(view.button('Mes anterior'));
  await view.click(view.button('Mes anterior'));
  await view.click(view.button('Mes siguiente'));
  assert.match(document.querySelector('.ah-navigation h3').textContent, /octubre.*2026/i);
  for (const scale of ['Semana', 'Año', 'Mes']) await view.scale(scale);
  assert.equal(document.querySelectorAll('.ah-calendar').length, 1);
  assert.equal(document.querySelectorAll('.history-day[tabindex="0"]').length, 1);
  assert.equal(document.querySelector('.daily-panel'), panel);
  assert.equal(view.heading(), today);
  assert.equal(document.documentElement.scrollTop, top);
  assert.equal(view.saves.length, 0);
});

test('reduced motion keeps period and keyboard navigation immediate without requesting an animation', async t => {
  const view = await mount(t, fixtures(), { reducedMotion: true });
  const prototype = window.HTMLElement.prototype, previous = prototype.animate;
  prototype.animate = () => { assert.fail('Reduced motion must not start Web Animations'); };
  t.after(() => { if (previous) prototype.animate = previous; else delete prototype.animate; });
  document.documentElement.scrollTop = 77;
  await view.click(view.button('Mes anterior'));
  await view.scale('Semana'); await view.scale('Año'); await view.scale('Mes');
  const selected = document.querySelector('.history-day[aria-pressed="true"]');
  const previousDate = new Date(selected.dataset.date + 'T12:00:00'); previousDate.setDate(previousDate.getDate() - 1);
  await act(() => selected.focus()); await press(selected, 'ArrowLeft');
  assert.equal(document.activeElement.dataset.date, previousDate.toISOString().slice(0, 10));
  assert.equal(document.querySelectorAll('.ah-calendar').length, 1);
  assert.equal(document.querySelectorAll('[data-history-motion]').length, 0);
  assert.equal(document.documentElement.scrollTop, 77);
  assert.equal(view.heading(), today);
  assert.equal(view.saves.length, 0);
});

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
  assert.match(november.getAttribute('aria-label'), /6 días con registros/,
    'Activity coverage includes the water/weight day; energy averages retain their separate existing denominator');
  assert.match(november.querySelector('.ah-month-coverage').textContent, /comidas.*3\/12/i);
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

for (const currentHasActivity of [true, false]) {
  test('year month status distinguishes past, current and future without redundant empty labels' +
    (currentHasActivity ? ' with current activity' : ' with an empty current month'), async t => {
    const view = await mount(t, currentHasActivity ? fixtures() : {});
    await view.scale('Año');
    const month = key => document.querySelector('.ah-month[data-month="' + key + '"]');
    const october = month('2026-10'), november = month('2026-11'), december = month('2026-12');
    assert.equal(october.querySelector('strong').textContent, 'Sin registros');
    assert.equal(!!october.querySelector('.ah-month-caption'), false, 'A past empty month needs no second empty-state label');
    assert.equal(october.dataset.activity, 'false');
    if (currentHasActivity) {
      assert.ok(november.querySelector('.ah-balance-reading'), 'Food-backed months expose the existing average');
      assert.match(november.getAttribute('aria-label'), /6 días con registros/);
      assert.match(november.querySelector('.ah-month-coverage').textContent, /comidas.*3\/12/i);
    } else assert.equal(november.querySelector('strong').textContent, 'Sin registros');
    assert.equal(november.querySelector('.ah-month-caption').textContent.trim(), 'En curso');
    assert.equal(november.dataset.activity, String(currentHasActivity));
    assert.equal(december.querySelector('strong').textContent, 'Próximamente');
    assert.equal(!!december.querySelector('.ah-month-caption'), false, 'A future month does not repeat an empty-state caption');
    assert.equal(december.dataset.activity, 'false');
    assert.equal(december.disabled, true);
    assert.doesNotMatch(document.querySelector('.ah-year').textContent, /Este mes/);
    await view.click(view.button('Año anterior'));
    for (const pastMonth of document.querySelectorAll('.ah-month')) {
      assert.equal(pastMonth.querySelector('strong').textContent, 'Sin registros');
      assert.equal(!!pastMonth.querySelector('.ah-month-caption'), false);
    }
    assert.equal(view.heading(), today);
    assert.equal(view.saves.length, 0);
  });
}

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
