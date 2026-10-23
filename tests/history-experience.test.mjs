import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';
import React, { act } from 'react';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import { formatDateStr, aggregateEnergy } from '../src/utils/helpers.ts';

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
      names.split(',').map(name => 'const ' + name.trim() + ' = () => null;').join('\n'));
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
const today = formatDateStr(new Date());
const previous = new Date(); previous.setDate(previous.getDate() - 10);
const past = formatDateStr(previous);
const profile = { id: 'test', name: 'Test', age: 30, sex: 'Masculino', weight: 70,
  height: 170, goal: 'Mantenimiento', activity: 'Moderado', records: {} };
const makeRecord = dateStr => ({ dateStr, date: new Date(dateStr + 'T12:00:00'),
  meals: [{ id: dateStr, name: 'Comida ' + dateStr, type: 'Almuerzo', calories: 1618, time: '12:00' }],
  workouts: [], water: 1750, steps: 0, weight: 70 });

async function mount(t, initial = { [today]: makeRecord(today), [past]: makeRecord(past) }) {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  const saved = {};
  for (const name of ['window', 'document', 'HTMLElement', 'getComputedStyle', 'IS_REACT_ACT_ENVIRONMENT']) saved[name] = globalThis[name];
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement; globalThis.getComputedStyle = dom.window.getComputedStyle;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  const saves = [];
  function App() {
    const [records, setRecords] = React.useState(initial);
    return React.createElement(HomeView, { activeProfile: { ...profile, records },
      updateRecord: async (date, record) => { saves.push({ date, record: structuredClone(record) });
        setRecords(current => ({ ...current, [date]: record })); return true; } });
  }
  await act(() => root.render(React.createElement(App)));
  t.after(async () => { await act(() => root.unmount()); dom.window.close();
    for (const [name, value] of Object.entries(saved)) globalThis[name] = value; });
  const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
  return { saves, button, scale: async name => act(() => button(name).click()),
    selectDay: async date => act(() => document.querySelector('button[aria-label^="Seleccionar ' + date + '"]').click()),
    groups: () => [...document.querySelectorAll('.history-period')],
    heading: () => document.querySelector('.daily-heading').textContent,
    detail: () => document.querySelector('.history-detail'),
  };
}

test('Home preserves the consulted day, all daily widgets, records and nodes during repeated scale/interval changes', async t => {
  const view = await mount(t);
  await view.selectDay(past);
  const daily = document.querySelector('.daily-panel');
  const habits = document.querySelector('.daily-habits');
  const journal = document.querySelector('.daily-records');
  const dailyText = daily.textContent;
  for (let pass = 0; pass < 2; pass++) {
    for (const [scale, count] of [['Semana', 53], ['Mes', 12], ['Año', 2], ['Día', 0]]) {
      await view.scale(scale);
      assert.equal(document.querySelector('.daily-panel'), daily);
      assert.equal(document.querySelector('.daily-habits'), habits);
      assert.equal(document.querySelector('.daily-records'), journal);
      assert.equal(daily.textContent, dailyText);
      assert.equal(view.groups().length, count);
      assert.equal(document.querySelector('[aria-label="Período del historial"] [aria-pressed="true"]').textContent, scale);
      if (count) {
        await act(() => view.groups()[0].click());
        assert.equal(view.groups()[0].getAttribute('aria-pressed'), 'true');
        assert.equal(daily.textContent, dailyText);
      } else assert.equal(document.querySelector('.heatmap-date[aria-pressed="true"]').getAttribute('aria-label').includes(past), true);
    }
  }
  assert.equal(view.saves.length, 0);
  assert.match(view.heading(), new RegExp(past));
});

test('each scale remembers its selected interval and exposes exact dates, averages, totals and real coverage', async t => {
  const records = { [today]: makeRecord(today), [past]: makeRecord(past) };
  const view = await mount(t, records);
  await view.scale('Semana');
  await act(() => view.groups()[0].click());
  const label = view.groups()[0].getAttribute('aria-label');
  assert.match(view.detail().textContent, /Sin datos/);
  assert.match(view.detail().textContent, /0 de 7/);
  await view.scale('Mes'); await act(() => view.groups()[1].click());
  const monthLabel = view.groups()[1].getAttribute('aria-label');
  await view.scale('Año');
  const thisYear = view.groups().at(-1);
  await act(() => thisYear.click());
  const dates = Object.keys(records);
  const summary = aggregateEnergy(records, dates, profile, today);
  assert.match(view.detail().textContent, /Balance promedio/);
  assert.match(view.detail().textContent, /En curso/);
  assert.equal(view.detail().querySelector('dd').textContent, summary.averageBalance.toLocaleString('es-AR') + ' kcal/día');
  assert.match(view.detail().textContent, /Balance acumulado/);
  assert.match(view.detail().textContent, /Consumidas/);
  assert.match(view.detail().textContent, /Gasto estimado/);
  assert.ok(!document.querySelector('.activity-border-legend').textContent.includes('Gimnasio'));
  await view.scale('Semana');
  assert.equal(view.groups().find(node => node.getAttribute('aria-pressed') === 'true').getAttribute('aria-label'), label);
  await view.scale('Mes');
  assert.equal(view.groups().find(node => node.getAttribute('aria-pressed') === 'true').getAttribute('aria-label'), monthLabel);
});

test('keyboard roves dates and grouped periods without changing selection until activation', async t => {
  const view = await mount(t);
  const press = async (button, key) => act(() => button.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true })));
  const selectedDay = document.querySelector('.heatmap-date[aria-pressed="true"]');
  assert.equal(document.querySelectorAll('.heatmap-date[tabindex="0"]').length, 1);
  selectedDay.focus();
  await press(selectedDay, 'ArrowUp');
  assert.notEqual(document.activeElement, selectedDay);
  assert.equal(selectedDay.getAttribute('aria-pressed'), 'true');
  await press(document.activeElement, 'Home');
  assert.equal(document.activeElement, document.querySelector('.heatmap-date'));
  await press(document.activeElement, 'End');
  assert.equal(document.activeElement, selectedDay);
  for (const scale of ['Semana', 'Mes', 'Año']) {
    await view.scale(scale);
    const buttons = view.groups();
    assert.equal(buttons.filter(node => node.tabIndex === 0).length, 1);
    buttons.at(-1).focus();
    await press(document.activeElement, 'Home'); assert.equal(document.activeElement, buttons[0]);
    await press(document.activeElement, 'ArrowRight'); assert.equal(document.activeElement, buttons[1]);
    await press(document.activeElement, 'ArrowLeft'); assert.equal(document.activeElement, buttons[0]);
    await act(() => document.activeElement.click());
    assert.equal(buttons[0].getAttribute('aria-pressed'), 'true');
    assert.equal(buttons[0].tabIndex, 0);
    await press(buttons[0], 'End'); assert.equal(document.activeElement, buttons.at(-1));
  }
  assert.equal(view.saves.length, 0);
});

test('history navigation preserves an open meal draft; submitting while exploring a year saves once to the consulted day', async t => {
  const view = await mount(t);
  await view.selectDay(past);
  await act(() => view.button('+ Comida').click());
  async function fill(id, value) {
    const input = document.getElementById(id);
    const prototype = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    await act(() => { Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
      input.dispatchEvent(new window.Event('input', { bubbles: true })); });
  }
  await fill('add-meal-description', 'Borrador conservado durante exploración');
  await fill('add-meal-calories', '400');
  const textarea = document.getElementById('add-meal-description');
  for (const scale of ['Semana', 'Mes', 'Año']) {
    await view.scale(scale);
    await act(() => view.groups()[0].click());
    assert.equal(document.getElementById('add-meal-description'), textarea);
    assert.equal(textarea.value, 'Borrador conservado durante exploración');
    assert.equal(view.saves.length, 0);
  }
  await act(async () => {
    document.querySelector('.entry-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(setImmediate); // Include the real async save continuation and draft cleanup.
  });
  assert.equal(view.saves.length, 1);
  assert.equal(view.saves[0].date, past);
  assert.equal(view.saves[0].record.meals.length, 2);
  assert.equal(view.saves[0].record.meals[1].name, 'Borrador conservado durante exploración');
  assert.match(document.querySelector('.daily-records').textContent, /Borrador conservado durante exploración/);
  assert.equal(document.querySelector('.heatmap-frame').dataset.period, 'year');
  await view.scale('Día');
  assert.match(view.heading(), new RegExp(past));
  assert.equal(document.querySelectorAll('.daily-records li').length, 2);
});

test('empty and future-only records stay unknown in every aggregated view, with no false activity borders', async t => {
  const future = new Date(); future.setDate(future.getDate() + 1);
  const stamp = formatDateStr(future);
  const view = await mount(t, { [stamp]: makeRecord(stamp) });
  for (const scale of ['Semana', 'Mes', 'Año']) {
    await view.scale(scale);
    assert.ok(view.groups().every(node => node.dataset.empty === 'true'));
    assert.ok(view.groups().every(node => /Sin datos/.test(node.getAttribute('aria-label'))));
    assert.match(view.detail().textContent, /0 de/);
    assert.ok([...view.detail().querySelectorAll('dd')].every(node => node.textContent === 'Sin datos'));
  }
  assert.equal(view.saves.length, 0);
});

test('the touch-friendly date control changes only the daily selection, rejects empty/future values and performs no write', async t => {
  const view = await mount(t);
  await view.scale('Mes');
  const selectedMonth = view.groups().find(node => node.getAttribute('aria-pressed') === 'true').getAttribute('aria-label');
  async function choose(value) {
    const input = document.querySelector('.history-navigation input');
    await act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
  }
  await choose(past);
  assert.match(view.heading(), new RegExp(past));
  assert.equal(view.groups().find(node => node.getAttribute('aria-pressed') === 'true').getAttribute('aria-label'), selectedMonth);
  await choose('');
  assert.match(view.heading(), new RegExp(past));
  const future = new Date(); future.setDate(future.getDate() + 1);
  await choose(formatDateStr(future));
  assert.match(view.heading(), new RegExp(past));
  assert.equal(view.saves.length, 0);
  await view.scale('Día');
  assert.equal(document.querySelector('.heatmap-date[aria-pressed="true"]').getAttribute('aria-label').includes(past), true);
});

test('mobile column-flow keyboard follows visual rows without selecting or writing', async t => {
  const view = await mount(t);
  await view.scale('Semana');
  const grid = document.querySelector('.history-period-grid');
  // JSDOM has no media-query layout; emulate the computed three-row geometry.
  grid.style.gridAutoFlow = 'column';
  grid.style.setProperty('--history-grid-rows', '3');
  const buttons = view.groups();
  await act(() => buttons[0].focus());
  const press = async key => act(() => document.activeElement.dispatchEvent(
    new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
  await press('ArrowDown'); assert.equal(document.activeElement, buttons[1]);
  await press('ArrowRight'); assert.equal(document.activeElement, buttons[4]);
  await press('ArrowLeft'); assert.equal(document.activeElement, buttons[1]);
  await press('ArrowUp'); assert.equal(document.activeElement, buttons[0]);
  await press('End'); assert.equal(document.activeElement, buttons.at(-1));
  assert.equal(buttons.at(-1).getAttribute('aria-pressed'), 'true');
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'false');
  assert.equal(view.saves.length, 0);
});

test('context disclosure retains all official metrics, scale selection and an open meal draft', async t => {
  const view = await mount(t);
  await view.scale('Mes');
  await act(() => view.groups()[0].click());
  const selected = view.groups()[0].getAttribute('aria-label');
  const values = [...view.detail().querySelectorAll('dd')].map(node => node.textContent);
  await act(() => view.button('+ Comida').click());
  const draft = document.getElementById('add-meal-description');
  const toggle = document.querySelector('.history-detail-toggle');
  const extra = document.getElementById(toggle.getAttribute('aria-controls'));
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(extra.dataset.expanded, 'false');
  for (const expanded of ['true', 'false', 'true']) {
    await act(() => toggle.click());
    assert.equal(toggle.getAttribute('aria-expanded'), expanded);
    assert.equal(extra.dataset.expanded, expanded);
    assert.deepEqual([...view.detail().querySelectorAll('dd')].map(node => node.textContent), values);
    assert.equal(document.getElementById('add-meal-description'), draft);
    assert.equal(view.groups()[0].getAttribute('aria-label'), selected);
  }
  await view.scale('Año');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(view.detail().querySelectorAll('dd').length, 4);
  await view.scale('Día');
  assert.equal(view.detail().querySelectorAll('dd').length, 3);
  assert.equal(view.saves.length, 0);
});

test('resize reveals the selected week horizontally once, without moving the page or resetting manual scroll', async t => {
  const view = await mount(t);
  await view.scale('Semana');
  const grid = document.querySelector('.history-period-grid');
  const selected = grid.querySelector('[aria-pressed="true"]');
  Object.defineProperties(grid, { scrollWidth: { value: 1440 }, clientWidth: { value: 293 } });
  Object.defineProperty(selected, 'offsetWidth', { value: 72 });
  grid.getBoundingClientRect = () => ({ left: 40 });
  selected.getBoundingClientRect = () => ({ left: 600 });
  grid.scrollLeft = 100;
  const scrollTop = document.documentElement.scrollTop;
  await act(() => window.dispatchEvent(new window.Event('resize')));
  assert.equal(grid.scrollLeft, 549.5);
  assert.equal(document.documentElement.scrollTop, scrollTop);
  grid.scrollLeft = 25;
  await act(() => view.groups()[0].click());
  assert.equal(grid.scrollLeft, 25, 'Selection must not recenter after the user scrolls');
  assert.equal(view.saves.length, 0);
});
