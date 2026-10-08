import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';


import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { formatDateStr } from '../src/utils/helpers.ts';


const source = await readFile(new URL('../src/components/DailyPanel.tsx', import.meta.url), 'utf8');
const stub = code => `data:text/javascript,${encodeURIComponent(code)}`;
const imports = {
  '../utils/helpers': new URL('../src/utils/helpers.ts', import.meta.url).href,
  '../services/aiService': stub('export const estimateMeal = async () => ({}); export const estimateWorkout = async () => ({});'),
  '../lib/supabase': stub('export const supabase = {};'),
  './MealPhoto': stub('export const MealPhotoPicker = () => null; export const MealThumbnail = () => null;'),
};
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 } }).outputText
  .replace(/from ["']([^"']+)["']/g, (_, specifier) => `from ${JSON.stringify(imports[specifier] || import.meta.resolve(specifier))}`);
const { default: DailyPanel } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const profile = { id: 'test', name: 'Test', age: 30, sex: 'Masculino', weight: 70,
  height: 170, goal: 'Mantenimiento', activity: 'Moderado', records: {} };
const dateStr = formatDateStr(new Date());
const base = { dateStr, date: new Date(), meals: [], workouts: [], steps: 0, water: 0 };
function render(record, user = profile) {
  return renderToStaticMarkup(React.createElement(DailyPanel, { profile: user, record,
    dateStr: record.dateStr, records: { [record.dateStr]: record }, onUpdateRecord() {} }))
    .replace(/<[^>]+>/g, '');
}

test('DailyPanel renders dynamic expenditure after steps and workout add/edit/delete', () => {
  for (const [record, target] of [[base, '1.618'], [{ ...base, steps: 7000 }, '1.898'],
    [{ ...base, steps: 7000, workouts: [{ id: 'w', activity: 'Correr', calories: 450, duration: 45, muscles: [] }] }, '2.348'],
    [{ ...base, steps: 7000, workouts: [{ id: 'w', activity: 'Correr', calories: 600, duration: 45, muscles: [] }] }, '2.498'],
    [{ ...base, steps: 7000, workouts: [] }, '1.898']]) {
    const text = render(record);
    assert.ok(text.includes(`Gasto estimado${target} kcal`));
    assert.ok(text.includes('Calorías consumidas0 kcal'));
  }
});

test('DailyPanel shows historical Sin datos and current energy balance', () => {
  assert.ok(render({ ...base, dateStr: '2000-01-01' }).includes('Sin datos'));
  assert.ok(render(base).includes('-1.618 kcal'));
});

test('DailyPanel displays equilibrium and surplus states', () => {
  for (const [calories, label] of [[1618, 'Mantenimiento'], [1800, 'Superávit']]) {
    const text = render({ ...base, meals: [{ id: 'm', name: 'Comida', type: 'Almuerzo', calories }] });
    assert.ok(text.includes(label));
  }
});

test('daily summary has a collapsed breakdown and no profile explanations', () => {
  const html = renderToStaticMarkup(React.createElement(DailyPanel, {
    profile, record: base, dateStr, records: {}, onUpdateRecord() {},
  }));
  assert.match(html, /<details class=/);
  assert.doesNotMatch(html, /<details[^>]* open/);
  assert.match(html, /Ver desglose/);
  assert.doesNotMatch(html, /TDEE|solaparse|Meta de hoy/);
});

test('only empty meal and workout lists use the compact records state', () => {
  const html = record => renderToStaticMarkup(React.createElement(DailyPanel, {
    profile, record, dateStr, records: {}, onUpdateRecord() {},
  }));
  assert.match(html(base), /daily-logs--empty/);
  assert.match(html(base), /Registros del día/);
  assert.match(html(base), /Todavía no cargaste comidas ni entrenamientos\./);
  for (const record of [
    { ...base, meals: [{ id: 'm', name: 'Ensalada', type: 'Almuerzo', calories: 400 }] },
    { ...base, workouts: [{ id: 'w', activity: 'Gimnasio', calories: 300, duration: 45 }] },
  ]) {
    assert.doesNotMatch(html(record), /daily-logs--empty|Todavía no cargaste/);
    assert.match(html(record), /<li/);
    assert.match(html(record), /Registros del día/);
  }
});

test('habit controls keep accessible names and daily quick actions', () => {
  const html = renderToStaticMarkup(React.createElement(DailyPanel, {
    profile, record: { ...base, steps: 18500, water: 2500, weight: 105 }, dateStr,
    records: {}, onUpdateRecord() {},
  }));
  for (const name of ['Restar 250 ml de agua', 'Sumar 250 ml de agua', 'Restar 500 pasos', 'Sumar 500 pasos']) {
    assert.ok(html.includes(`aria-label="${name}"`));
  }
  for (const label of ['2.500', '18.500', '105', '+ Comida', '+ Ejercicio', 'Pasos/Agua', 'Editar']) {
    assert.ok(html.includes(label));
  }
});

test('grouped periods keep accumulated balance and hide daily controls and records', () => {
  const records = { [dateStr]: { ...base, steps: 7000, meals: [{ calories: 1200 }] } };
  for (const type of ['week', 'month', 'year']) {
    const html = renderToStaticMarkup(React.createElement(DailyPanel, {
      profile, record: base, dateStr, records, onUpdateRecord() {},
      selectedGroup: { type, label: 'Período', dates: [dateStr] },
    }));
    for (const text of ['Balance acumulado', '-698 kcal', 'Promedio diario:', '1 días con datos.']) {
      assert.ok(html.includes(text));
    }
    assert.doesNotMatch(html, /daily-habits|daily-quick-actions|daily-logs|Ver desglose/);
  }
});

// Use the actual event handlers with local hook state; persistence stays mocked.
const interactiveCode = code.replace(JSON.stringify(import.meta.resolve('react')), JSON.stringify(stub(`
  export default {};
  export const useState = value => globalThis.__dailyHooks.useState(value);
  export const useRef = value => globalThis.__dailyHooks.useRef(value);
  export const useEffect = () => {};
`)));
const { default: InteractiveDailyPanel } = await import(`data:text/javascript;base64,${Buffer.from(interactiveCode).toString('base64')}`);
function mount(props) {
  const slots = [];
  let cursor = 0;
  const hooks = {
    useState(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = value;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: value };
      return slots[index];
    },
  };
  return () => { cursor = 0; globalThis.__dailyHooks = hooks; return InteractiveDailyPanel(props); };
}
function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  if (!React.isValidElement(tree)) return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props.children, predicate)];
}
function node(tree, predicate) {
  const result = nodes(tree, predicate)[0];
  assert.ok(result, 'Expected control to be rendered');
  return result;
}

test('rapid water and step taps update locally and save combined final values once', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const saves = [];
  const view = mount({ profile, record: base, dateStr, records: { [dateStr]: base },
    onUpdateRecord: (date, record) => { saves.push({ date, record }); return Promise.resolve(true); } });
  const tree = view();
  for (let i = 0; i < 6; i++) {
    node(tree, e => e.props['aria-label'] === 'Sumar 250 ml de agua').props.onClick();
    node(tree, e => e.props['aria-label'] === 'Sumar 500 pasos').props.onClick();
  }
  const html = renderToStaticMarkup(view());
  assert.match(html, />1\.500<\/button>/);
  assert.match(html, />3\.000<\/button>/);
  assert.equal(saves.length, 0);
  t.mock.timers.tick(399);
  assert.equal(saves.length, 0);
  t.mock.timers.tick(1);
  assert.equal(saves.length, 1);
  assert.equal(saves[0].date, dateStr);
  assert.equal(saves[0].record.water, 1500);
  assert.equal(saves[0].record.steps, 3000);
});

test('quick actions toggle existing forms and values retain inline editing', () => {
  const view = mount({ profile, record: base, dateStr, records: {}, onUpdateRecord: async () => true });
  for (const [label, content] of [['+ Comida', 'Agregar Comida'], ['+ Ejercicio', 'Agregar Entrenamiento'], ['Pasos/Agua', 'Pasos del Día']]) {
    const button = () => node(view(), e => e.type === 'button' && e.props.children?.trim?.() === label);
    button().props.onClick();
    assert.ok(renderToStaticMarkup(view()).includes(content));
    assert.equal(button().props['aria-pressed'], true);
    button().props.onClick();
    assert.equal(button().props['aria-pressed'], false);
  }
  node(view(), e => e.props.title === 'Editar cantidad').props.onClick();
  assert.ok(nodes(view(), e => e.type === 'input' && e.props.autoFocus).length);
  node(view(), e => e.props.title === 'Editar pasos').props.onClick();
  assert.equal(nodes(view(), e => e.type === 'input' && e.props.autoFocus).length, 2);
  node(view(), e => e.props.title === 'Registrar peso').props.onClick();
  assert.match(renderToStaticMarkup(view()), /Registrar Peso/);
});

