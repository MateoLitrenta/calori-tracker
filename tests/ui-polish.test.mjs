import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
import { formatDateStr } from '../src/utils/helpers.ts';

const css = await readFile(new URL('../src/components/HomeVariants.css', import.meta.url), 'utf8');
const rawSource = await readFile(new URL('../src/components/Heatmap.tsx', import.meta.url), 'utf8');
const source = rawSource.replace(/import ['"][^'"]+\.css['"];?/g, '')
  .replace(/import\s+\{([^}]+)\}\s+from ['"]@phosphor-icons\/react['"];?/g, (_, names) =>
    names.split(',').filter(name => name.trim()).map(name => 'const ' + name.trim() + ' = () => null;').join('\n'));
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 } }).outputText
  .replace(/from ["']([^"']+)["']/g, (_, specifier) => `from ${JSON.stringify(specifier.startsWith('../utils/')
    ? new URL(`../src/utils/${specifier.slice(9).replace(/\.ts$/, '')}.ts`, import.meta.url).href : import.meta.resolve(specifier))}`);
const { default: Heatmap } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const today = formatDateStr(new Date());
const profile = { age: 30, sex: 'Masculino', height: 170, weight: 70, goal: 'Mantenimiento' };

test('numbered monthly selection is a preview; only the explicit open action changes the daily context', async t => {
  const dom = new JSDOM('<div class="home-variants" id="root"></div>', { pretendToBeVisual: true });
  const saved = {};
  for (const name of ['window', 'document', 'HTMLElement', 'getComputedStyle', 'IS_REACT_ACT_ENVIRONMENT']) saved[name] = globalThis[name];
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.HTMLElement = window.HTMLElement; globalThis.getComputedStyle = window.getComputedStyle;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const root = createRoot(document.getElementById('root'));
  t.after(async () => { await act(() => root.unmount()); dom.window.close();
    for (const [name, value] of Object.entries(saved)) globalThis[name] = value; });
  let openedDate = null, opens = 0;
  const record = { dateStr: today, meals: [{ id: 'meal', name: 'Comida sintética', type: 'Almuerzo', calories: 1500 }], workouts: [], steps: 7000, water: 0 };
  await act(() => root.render(React.createElement(Heatmap, { records: { [today]: record }, selectedDateStr: today,
    profile, onSelectDate: date => { openedDate = date; opens++; } })));
  const day = document.querySelector('.history-day[data-date="' + today + '"]');
  assert.ok(day);
  assert.ok(day.textContent.includes(String(Number(today.slice(-2)))));
  assert.equal(day.getAttribute('aria-current'), 'date');
  assert.equal(day.getAttribute('aria-pressed'), 'true');
  assert.match(day.getAttribute('aria-label'), /comida/i);
  assert.equal(document.querySelectorAll('.history-day[data-date="' + today + '"]').length, 1);
  assert.equal(document.querySelector('.history-annual-calendar'), null);
  assert.ok(document.querySelectorAll('.history-day[data-date]').length <= 42);
  document.documentElement.scrollTop = 123;
  await act(() => day.click());
  assert.equal(opens, 0);
  assert.equal(document.documentElement.scrollTop, 123);
  const selector = document.querySelector('[aria-label="Período del historial"]');
  assert.deepEqual([...selector.querySelectorAll('button')].map(button => button.textContent.trim()), ['Semana', 'Mes', 'Año']);
  for (const label of ['Semana', 'Mes', 'Año', 'Mes']) {
    const button = [...selector.querySelectorAll('button')].find(button => button.textContent.trim() === label);
    await act(() => button.click());
    assert.equal(selector.querySelectorAll('[aria-pressed="true"]').length, 1);
    assert.equal(opens, 0);
    assert.equal(document.documentElement.scrollTop, 123);
  }
  const open = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Abrir registros del día');
  await act(() => open.click());
  assert.equal(opens, 1);
  assert.equal(openedDate, today);
});

test('history and existing Coach/period controls use scoped, touch-friendly and motion-safe styles', async () => {
  const selectorCSS = await readFile(new URL('../src/components/PeriodSelector.css', import.meta.url), 'utf8');
  const premiumCSS = await readFile(new URL('../src/components/PremiumViews.css', import.meta.url), 'utf8');
  const charts = await readFile(new URL('../src/components/ChartsView.tsx', import.meta.url), 'utf8');
  const historyCSS = await readFile(new URL('../src/components/ActivityHistory.css', import.meta.url), 'utf8');
  assert.match(rawSource, /ActivityHistory\.css/);
  assert.match(charts, /PeriodSelector\.css/);
  assert.match(selectorCSS, /prefers-reduced-motion: reduce/);
  assert.match(selectorCSS, /transition: none/);
  assert.match(selectorCSS, /transform: translateX/);
  assert.match(historyCSS, /\.activity-history-v2/);
  assert.match(historyCSS, /repeat\(7,\s*minmax\(/);
  assert.match(historyCSS, /min-height:\s*44px/);
  assert.match(historyCSS, /overflow-x:\s*auto/);
  assert.match(historyCSS, /focus-visible/);
  assert.match(historyCSS, /prefers-reduced-motion:\s*reduce/);
  assert.match(historyCSS, /var\(--home-/);
  assert.match(css, /daily-quick-actions[^}]+repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(premiumCSS, /chat-composer :is\([^}]+border-radius: var\(--radius-control\)/);
  assert.match(premiumCSS, /chat-suggestion[^}]+min-height: 44px/);
  assert.match(css, /overflow-wrap: anywhere/);
});
