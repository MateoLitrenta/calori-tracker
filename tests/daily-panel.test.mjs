import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';


import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
import { formatDateStr } from '../src/utils/helpers.ts';
import { AIRequestError } from '../src/services/aiTransport.ts';
import { HabitDraftController } from '../src/lib/habitDraft.ts';


const source = await readFile(new URL('../src/components/DailyPanel.tsx', import.meta.url), 'utf8');
const stub = code => `data:text/javascript,${encodeURIComponent(code)}`;
// Decorative icons are exercised by the browser matrix; keep event-handler tests focused.
const withoutIcons = source => source.replace(/import\s+\{([^}]+)\}\s+from ['"]@phosphor-icons\/react['"];?/g,
  (_, names) => names.split(',').map(name => `const ${name.trim()} = () => null;`).join('\n'));
const shellSource = await readFile(new URL('../src/components/EntryFormShell.tsx', import.meta.url), 'utf8');
const shellCode = ts.transpileModule(withoutIcons(shellSource), { compilerOptions: { module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 } }).outputText
  .replace(/from ["']([^"']+)["']/g, (_, specifier) => `from ${JSON.stringify(specifier === 'react-dom'
    ? stub('export const createPortal = children => children;') : import.meta.resolve(specifier))}`);
const shellUrl = `data:text/javascript;base64,${Buffer.from(shellCode).toString('base64')}`;
const textareaSource = await readFile(new URL('../src/components/AutoResizeTextarea.tsx', import.meta.url), 'utf8');
const textareaCode = ts.transpileModule(textareaSource, { compilerOptions: { module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 } }).outputText
  .replace(/from ["']([^"']+)["']/g, (_, specifier) => `from ${JSON.stringify(import.meta.resolve(specifier))}`);
const textareaUrl = `data:text/javascript;base64,${Buffer.from(textareaCode).toString('base64')}`;
const estimateResultSource = await readFile(new URL('../src/components/EntryEstimateResult.tsx', import.meta.url), 'utf8');
const estimateResultCode = ts.transpileModule(withoutIcons(estimateResultSource), { compilerOptions: { module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 } }).outputText
  .replace(/from ["']([^"']+)["']/g, (_, specifier) => `from ${JSON.stringify(specifier === '../utils/helpers'
    ? new URL('../src/utils/helpers.ts', import.meta.url).href : import.meta.resolve(specifier))}`);
const estimateResultUrl = `data:text/javascript;base64,${Buffer.from(estimateResultCode).toString('base64')}`;
globalThis.__entryServices = { estimateMeal: async () => ({}), estimateWorkout: async () => ({}), toast: { error() {} } };
const imports = {
  '@phosphor-icons/react': stub('export const ForkKnife=()=>null, Flame=()=>null, Barbell=()=>null, Drop=()=>null, Trash=()=>null, Check=()=>null, PencilSimple=()=>null, Scales=()=>null, Sneaker=()=>null, X=()=>null, CaretRight=()=>null, Clock=()=>null, Sparkle=()=>null;'),
  '../utils/helpers': new URL('../src/utils/helpers.ts', import.meta.url).href,
  '../services/aiService': stub('export const estimateMeal = (...args) => globalThis.__entryServices.estimateMeal(...args); export const estimateWorkout = (...args) => globalThis.__entryServices.estimateWorkout(...args);'),
  '../services/aiTransport': new URL('../src/services/aiTransport.ts', import.meta.url).href,
  '../lib/supabase': stub('export const supabase = { storage: { from: () => globalThis.__entryServices.storage } };'),
  '../lib/entrySubmission': new URL('../src/lib/entrySubmission.ts', import.meta.url).href,
  '../lib/habitDraft': new URL('../src/lib/habitDraft.ts', import.meta.url).href,
  'react-hot-toast': stub('export default globalThis.__entryServices.toast;'),
  './MealPhoto': stub('export function MealPhotoPicker() { return null; } export const MealThumbnail = () => null;'),
  './DiscardDraftDialog': stub('export default function DiscardDraftDialog() { return null; }'),
  './EntryFormShell': shellUrl,
  './AutoResizeTextarea': textareaUrl,
  './EntryEstimateResult': estimateResultUrl,
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
    assert.ok(text.includes('Calorías consumidasSin ingesta registrada'));
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

test('activity without meals keeps the exact provisional balance inside the closed breakdown', () => {
  const record = { ...base, steps: 7000 };
  const html = renderToStaticMarkup(React.createElement(DailyPanel, { profile, record, dateStr, records: {}, onUpdateRecord() {} }));
  assert.match(html, /data-provisional="true"/);
  assert.match(html, /data-energy-state="partial"/);
  const dom = new JSDOM(html);
  try {
    const doc = dom.window.document;
    assert.equal(doc.querySelector('.energy-number').textContent, 'Sin comidas registradas');
    assert.doesNotMatch(doc.querySelector('.fitness-readout').textContent, /kcal|déficit/i);
    const details = doc.querySelector('.fitness-breakdown');
    assert.equal(details.open, false);
    assert.equal(doc.querySelector('.fitness-comparison').textContent, 'Gasto estimado1.898 kcal');
    assert.equal(doc.querySelector('.fitness-track'), null);
    assert.equal(details.querySelector('.fitness-breakdown-values dd').textContent, 'Sin ingesta registrada');
    assert.match(details.textContent, /Saldo provisional con los registros disponibles: -1\.898 kcal/);
  } finally { dom.window.close(); }
  assert.match(html, /Sin comidas registradas/);
  assert.equal((html.match(/Sin comidas registradas/g) || []).length, 1);
  assert.ok(render(record).includes('-1.898 kcal'));
  assert.ok(render(base).includes('-1.618 kcal'));
});

test('days without energy logs name the missing energy data and keep estimates in the collapsed breakdown', () => {
  for (const day of [dateStr, '2000-01-01']) for (const habits of [{}, { water: 1500, weight: 72.5 }]) {
    const record = { ...base, ...habits, dateStr: day };
    const snapshot = structuredClone(record);
    const dom = new JSDOM(renderToStaticMarkup(React.createElement(DailyPanel, {
      profile, record, dateStr: day, records: {}, onUpdateRecord() {},
    })));
    try {
      const document = dom.window.document;
      assert.equal(document.querySelector('.energy-card').dataset.energyState, 'empty');
      assert.equal(document.querySelector('.energy-number').textContent, 'Sin datos de energía');
      assert.equal(document.querySelector('.energy-status'), null);
      const breakdown = document.querySelector('.energy-breakdown');
      assert.equal(breakdown.open, false);
      assert.equal(breakdown.querySelector('.fitness-breakdown-values dd').textContent, 'Sin ingesta registrada');
      assert.match(breakdown.textContent, /Sin registros de ingesta o actividad, todavía no se puede interpretar el balance/);
      assert.match(breakdown.textContent, /El gasto incluye la estimación basal/);
      assert.match(breakdown.textContent, /TMB: 1\.618 kcal/);
      assert.equal(document.querySelector('.energy-metrics'), null, 'An empty day has no measured intake or expenditure to compare');
      assert.equal(document.querySelectorAll('.fitness-track > span').length, 0);
      assert.match(breakdown.textContent, /Gasto estimado1\.618 kcal/);
      if (day === dateStr) assert.match(breakdown.textContent, /Balance estimado: -1\.618 kcal/);
      else assert.doesNotMatch(breakdown.textContent, /Balance estimado:/);
      assert.deepEqual(record, snapshot);
    } finally { dom.window.close(); }
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

test('energy bars use the same daily maximum, including days with intake above expenditure', () => {
  for (const calories of [0, 400, 1618, 2400]) {
    const record = { ...base, meals: [{ id: 'food', name: 'Almuerzo', type: 'Almuerzo', calories }] };
    const dom = new JSDOM(renderToStaticMarkup(React.createElement(DailyPanel, {
      profile, record, dateStr, records: {}, onUpdateRecord() {},
    })));
    try {
      const { document } = dom.window;
      const scale = Math.max(calories, 1618);
      if (calories === 0) {
        assert.equal(document.querySelector('.fitness-channel dd').textContent, '0 kcal');
        assert.equal(document.querySelector('.fitness-breakdown-values dd').textContent, '0 kcal');
      }
      if (calories === 1618) assert.equal(document.querySelector('.energy-number').textContent, '0 kcal');
      const bars = [...document.querySelectorAll('.fitness-track')];
      assert.equal(bars.length, 2);
      assert.deepEqual(bars.map(bar => bar.getAttribute('aria-hidden')), ['true', 'true']);
      for (const [index, value] of [calories, 1618].entries()) {
        assert.ok(Math.abs(parseFloat(bars[index].firstElementChild.style.width) - 100 * value / scale) < 0.001);
      }
      assert.match(document.querySelector('.energy-breakdown').textContent, /misma escala/);
      assert.match(document.querySelector('.energy-qualifier').textContent, /día puede estar incompleto/);
      assert.match(document.querySelector('.fitness-scale-note').textContent, /Comparación en kcal.*misma escala/);
      assert.equal(document.querySelector('[role="progressbar"]'), null);
    } finally { dom.window.close(); }
  }
});

test('only empty meal and workout lists use the compact records state', () => {
  const html = record => renderToStaticMarkup(React.createElement(DailyPanel, {
    profile, record, dateStr, records: {}, onUpdateRecord() {},
  }));
  assert.match(html(base), /daily-logs--empty/);
  assert.match(html(base), /Registros del día/);
  assert.match(html(base), /Las comidas y los ejercicios que agregues para este día aparecerán acá\./);
  for (const record of [
    { ...base, meals: [{ id: 'm', name: 'Ensalada', type: 'Almuerzo', calories: 400 }] },
    { ...base, workouts: [{ id: 'w', activity: 'Gimnasio', calories: 300, duration: 45 }] },
  ]) {
    assert.doesNotMatch(html(record), /daily-logs--empty|aparecerán acá/);
    assert.match(html(record), /<li/);
    assert.match(html(record), /Registros del día/);
  }
});

test('journal keeps every record and its full description in chronological DOM order at all densities', () => {
  for (const count of [0, 1, 2, 3, 4, 5, 8, 32]) {
    const records = Array.from({ length: count }, (_, index) => ({
      id: `m-${index}`, name: `Registro ${String(index).padStart(2, '0')} ${'descripcionlarga'.repeat(20)}`,
      type: 'Almuerzo', calories: 1234567, time: `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`,
    }));
    const html = renderToStaticMarkup(React.createElement(DailyPanel, {
      profile, record: { ...base, meals: [...records].reverse() }, dateStr, records: {}, onUpdateRecord() {},
    }));
    assert.equal((html.match(/<li\b/g) || []).length, count);
    assert.equal((html.match(/Registros del día/g) || []).length, 1);
    assert.match(html, new RegExp(`data-record-count="${count}"`));
    assert.equal(html.includes('class="daily-records-toggle"'), count > 4);
    for (let index = 0; index < count; index++) {
      assert.ok(html.includes(records[index].name), 'Long descriptions must remain complete');
      assert.ok(html.replace(/<[^>]+>/g, '').includes('+1.234.567 kcal'));
      if (index) assert.ok(html.indexOf(records[index - 1].name) < html.indexOf(records[index].name));
    }
    assert.ok(html.indexOf('Agregar comida') < html.indexOf('Registros del día'), 'Keep the existing mobile reading order');
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
  for (const label of ['2.500', '18.500', '105', 'Agregar comida', 'Agregar ejercicio', 'Editar']) {
    assert.ok(html.includes(label));
  }
  assert.doesNotMatch(html,/Pasos\/Agua|habit-adjustments/);
  assert.match(html,/aria-label="Editar cantidad de agua"/);
  assert.match(html,/aria-label="Editar total de pasos"/);
});

test('daily reading order keeps actions, habits and chronological records together without duplicate controls', () => {
  const record = { ...base, meals: [{ id: 'meal-priority', name: 'Comida de prueba', type: 'Almuerzo', calories: 400 }],
    workouts: [{ id: 'work-priority', activity: 'Caminata de prueba', duration: 20, calories: 70 }], steps: 2500, water: 1000, weight: 70 };
  const dom = new JSDOM(renderToStaticMarkup(React.createElement(DailyPanel, {
    profile, record, dateStr, records: { [dateStr]: record }, onUpdateRecord() {},
  })));
  const document = dom.window.document;
  try {
    const inOrder = [...document.querySelectorAll('.energy-card, .daily-quick-actions, .daily-logs, .daily-habits-block')].map(node => node.className.split(' ')[0]);
    assert.deepEqual(inOrder, ['energy-card', 'daily-quick-actions', 'daily-habits-block', 'daily-logs']);
    assert.equal(document.querySelectorAll('.daily-quick-actions').length, 1);
    assert.equal(document.querySelectorAll('.daily-habits').length, 1);
    assert.equal(document.querySelectorAll('.daily-record-open').length, 2);
    assert.equal(document.querySelectorAll('[aria-label="Sumar 250 ml de agua"]').length, 1);
    assert.equal(document.querySelectorAll('[aria-label="Sumar 500 pasos"]').length, 1);
    assert.equal(document.querySelector('.daily-habits-heading time').dateTime, dateStr);
  } finally { dom.window.close(); }
});

test('coverage reports exact meal and exercise counts without claiming that food entries complete the day', () => {
  for (const [mealCount, workoutCount] of [[0, 0], [1, 1], [2, 3]]) {
    const record = { ...base,
      meals: Array.from({ length: mealCount }, (_, i) => ({ id: `coverage-meal-${i}`, name: 'Comida', type: 'Almuerzo', calories: 300 })),
      workouts: Array.from({ length: workoutCount }, (_, i) => ({ id: `coverage-workout-${i}`, activity: 'Caminata', duration: 20, calories: 70 })),
    };
    const dom = new JSDOM(renderToStaticMarkup(React.createElement(DailyPanel, { profile, record, dateStr, records: {}, onUpdateRecord() {} })));
    try {
      const coverage = dom.window.document.querySelector('.energy-coverage').textContent;
      assert.equal(coverage, `${mealCount} ${mealCount === 1 ? 'comida' : 'comidas'} · ${workoutCount} ${workoutCount === 1 ? 'ejercicio' : 'ejercicios'}Según tus registros`);
      assert.doesNotMatch(coverage, /día completo|objetivo cumplido|consumo completo/i);
      assert.equal(dom.window.document.querySelectorAll('.energy-breakdown').length, 1);
    } finally { dom.window.close(); }
  }
});

test('grouped periods keep accumulated balance and hide daily controls and records', () => {
  const records = { [dateStr]: { ...base, steps: 7000, meals: [{ calories: 1200 }] } };
  for (const type of ['week', 'month', 'year']) {
    const html = renderToStaticMarkup(React.createElement(DailyPanel, {
      profile, record: base, dateStr, records, onUpdateRecord() {},
      selectedGroup: { type, label: 'Período', dates: [dateStr] },
    }));
    for (const text of ['Balance acumulado', '-698 kcal', 'Promedio diario:', '1 día con datos.']) {
      assert.ok(html.includes(text));
    }
    assert.doesNotMatch(html, /daily-habits|daily-quick-actions|daily-logs|Ver desglose/);
  }
});

// Use the actual event handlers with local hook state; persistence stays mocked.
const hookUrl = stub(`
  export default {};
  export const useState = value => globalThis.__dailyHooks.useState(value);
  export const useRef = value => globalThis.__dailyHooks.useRef(value);
  export const useId = () => globalThis.__dailyHooks.useRef('daily-records-test').current;
  export const useMemo = factory => factory();
  export const useEffect = (...args) => globalThis.__dailyHooks.useEffect(...args);
  export const useLayoutEffect = useEffect;
`);
const interactiveCode = code.replace(JSON.stringify(import.meta.resolve('react')), JSON.stringify(hookUrl));
const { default: InteractiveDailyPanel } = await import(`data:text/javascript;base64,${Buffer.from(interactiveCode).toString('base64')}`);
const { default: InteractiveShell } = await import(`data:text/javascript;base64,${Buffer.from(
  shellCode.replace(JSON.stringify(import.meta.resolve('react')), JSON.stringify(hookUrl))).toString('base64')}`);
function mount(props, component = InteractiveDailyPanel, effects = false) {
  const slots = [];
  let cursor = 0;
  let effectCursor = 0;
  const effectSlots = [];
  let pending = [];
  const hooks = {
    useState(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof value === 'function' ? value() : value;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: value };
      return slots[index];
    },
    useEffect(callback, deps) {
      if (!effects) return;
      const index = effectCursor++;
      const previous = effectSlots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        pending.push(() => { previous?.cleanup?.(); effectSlots[index] = { deps, cleanup: callback() }; });
      }
    },
  };
  const view = () => { cursor = 0; effectCursor = 0; pending = []; globalThis.__dailyHooks = hooks; return component(props); };
  view.flushEffects = () => { pending.forEach(callback => callback()); pending = []; };
  view.unmount = () => effectSlots.forEach(effect => effect?.cleanup?.());
  return view;
}
function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  if (!React.isValidElement(tree)) return [];
  // This handler harness traverses shallow trees; DOM resizing is tested with real React separately.
  if (tree.type.name === 'AutoResizeTextarea') tree = React.createElement('textarea', tree.props);
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
  assert.match(html, />1\.500 <small class="habit-unit">ml<\/small><\/button>/);
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

test('habit taps during an outstanding save wait instead of dispatching a stale second write', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finish;
  const saves = [];
  const view = mount({ profile, record: base, dateStr, records: { [dateStr]: base }, onUpdateRecord: (date, record, options) => {
    saves.push({ date, record, options });
    return new Promise(resolve => { finish = resolve; });
  } });
  node(view(), e => e.props['aria-label'] === 'Sumar 500 pasos').props.onClick();
  t.mock.timers.tick(400);
  assert.equal(saves.length, 1);
  node(view(), e => e.props['aria-label'] === 'Sumar 500 pasos').props.onClick();
  node(view(), e => e.props['aria-label'] === 'Sumar 250 ml de agua').props.onClick();
  t.mock.timers.tick(400);
  assert.equal(saves.length, 1, 'one writer must cover steps and water while the response is pending');
  finish(false);
  await Promise.resolve();
});

test('quick actions open forms and values retain inline editing', () => {
  const view = mount({ profile, record: base, dateStr, records: {}, onUpdateRecord: async () => true });
  for (const [label, content] of [['Agregar comida', 'Agregar comida'], ['Agregar ejercicio', 'Agregar ejercicio']]) {
    const button = () => node(view(), e => e.type === 'button' && e.props.children?.trim?.() === label);
    button().props.onClick();
    assert.ok(renderToStaticMarkup(view()).includes(content));
    assert.equal(button().props['aria-pressed'], true);
    button().props.onClick();
    assert.equal(button().props['aria-pressed'], true);
    shell(view).props.onClose();
    assert.equal(button().props['aria-pressed'], false);
  }
  node(view(), e => e.props.title === 'Editar cantidad').props.onClick();
  assert.ok(nodes(view(), e => e.type === 'input' && e.props.autoFocus).length);
  assert.equal(node(view(), e => e.type === 'input' && e.props['aria-label'] === 'Cantidad de agua (ml)').props.inputMode, 'numeric');
  node(view(), e => e.props.title === 'Editar pasos').props.onClick();
  assert.equal(nodes(view(), e => e.type === 'input' && e.props.autoFocus).length, 2);
  assert.equal(node(view(), e => e.type === 'input' && e.props['aria-label'] === 'Total de pasos').props.inputMode, 'numeric');
  const weight = node(view(), e => e.props.className === 'habit-edit');
  weight.props.onClick();
  assert.equal(shell(view).props.title, base.weight ? 'Editar peso' : 'Registrar peso');
});

test('registration actions and both entry forms expose the selected date, including historical days', () => {
  const selected = '2026-01-09';
  const view = mount({ profile, dateStr: selected, record: { ...base, dateStr: selected }, records: {}, onUpdateRecord: async () => false });
  for (const action of ['Agregar comida', 'Agregar ejercicio']) {
    const button = node(view(), e => e.type === 'button' && e.props.children?.trim?.() === action);
    const label = node(view(), e => e.props.id === button.props['aria-describedby']);
    assert.equal(label.type, 'time'); assert.equal(label.props.dateTime, selected);
    button.props.onClick();
    const context = shell(view).props.dateContext;
    assert.equal(node(context, e => e.type === 'time').props.dateTime, selected);
    shell(view).props.onClose();
  }
});

function mobileEnvironment(t, mobile = true) {
  const previous = { window: globalThis.window, document: globalThis.document };
  globalThis.window = { matchMedia: () => ({ matches: mobile }) };
  globalThis.document = { body: {} };
  t.after(() => { globalThis.window = previous.window; globalThis.document = previous.document; });
}
const entryView = (onUpdateRecord = async () => true, record = base) => mount({
  profile, record, dateStr, records: { [dateStr]: record }, onUpdateRecord,
});
const shell = view => node(view(), element => element.type.name === 'EntryFormShell');
const sheet = view => mount(shell(view).props, InteractiveShell)();
const open = (view, label) => node(view(), element => element.type === 'button' &&
  element.props.children?.trim?.() === label).props.onClick();
const field = (view, placeholder) => node(view(), element => element.props.placeholder === placeholder);
const fill = (view, placeholder, value) => field(view, placeholder).props.onChange({ target: { value } });
const submit = view => node(view(), element => element.type === 'form').props.onSubmit({ preventDefault() {} });

test('mobile meal and workout actions open a named modal dialog; steps and water stay inline', t => {
  mobileEnvironment(t);
  const view = entryView();
  for (const [action, title] of [['Agregar comida', 'Agregar comida'], ['Agregar ejercicio', 'Agregar ejercicio']]) {
    open(view, action);
    const dialog = node(sheet(view), element => element.props.role === 'dialog');
    assert.equal(dialog.props['aria-modal'], 'true');
    assert.equal(node(dialog, element => element.props.id === dialog.props['aria-labelledby']).props.children, title);
    assert.equal(nodes(dialog, element => element.type === 'form').length, 1);
    assert.ok(node(dialog, element => element.props.className?.includes('entry-form-footer')));
    shell(view).props.onClose();
  }
  node(view(), e => e.props.title === 'Editar pasos').props.onClick();
  assert.equal(nodes(view(), element => element.type.name === 'EntryFormShell').length, 0);
  assert.ok(node(view(), element => element.type === 'input' && element.props.autoFocus));
});

test('explicit close asks before discarding text and a temporary photo', t => {
  mobileEnvironment(t);
  const view = entryView();
  open(view, 'Agregar comida');
  fill(view, 'Ej. pollo con arroz y verduras', 'Borrador');
  const photo = new Blob(['photo']);
  node(view(), element => element.type.name === 'MealPhotoPicker').props.onChange(photo);
  const tree = sheet(view);
  const close = node(tree, element => element.props['aria-label'] === 'Cerrar formulario').props.onClick;
  assert.equal(node(tree, element => element.props.className === 'entry-sheet-backdrop').props.onClick, undefined);
  const confirmation = () => node(view(), element => typeof element.props.onDiscard === 'function');
  close();
  confirmation().props.onKeep();
  assert.equal(field(view, 'Ej. pollo con arroz y verduras').props.value, 'Borrador');
  assert.equal(node(view(), element => element.type.name === 'MealPhotoPicker').props.blob, photo);
  close();
  confirmation().props.onDiscard();
  assert.equal(nodes(view(), element => element.type === 'form').length, 0);
  open(view, 'Agregar comida');
  assert.equal(field(view, 'Ej. pollo con arroz y verduras').props.value, '');
  assert.equal(node(view(), element => element.type.name === 'MealPhotoPicker').props.blob, null);
});

test('desktop actions use one named dialog while water editing stays inline', t => {
  mobileEnvironment(t, false);
  const view = entryView();
  for (const action of ['Agregar comida', 'Agregar ejercicio']) {
    open(view, action);
    const dialog = node(sheet(view), element => element.props.role === 'dialog');
    assert.equal(dialog.props['aria-modal'], 'true');
    assert.equal(nodes(dialog, element => element.type === 'form').length, 1);
    shell(view).props.onClose();
  }
  node(view(), e => e.props.title === 'Editar cantidad').props.onClick();
  assert.equal(nodes(view(), element => element.type === 'form').length, 0);
});

test('steps cards keep one visible label and complete localized large values',()=>{
  for(const steps of [10000,25000,100000]) {
    const html=renderToStaticMarkup(React.createElement(DailyPanel,{profile,record:{...base,steps},dateStr,records:{},onUpdateRecord(){}}));
    const stepCard=html.split('>Pasos</span>')[1].split('>Peso</span>')[0];
    assert.ok(stepCard.includes(steps.toLocaleString('es-AR')));
    assert.doesNotMatch(stepCard,/>pasos<|>Pasos</);
    assert.match(stepCard,/Sumar 500 pasos/);assert.match(stepCard,/Editar total de pasos/);
  }
});

test('upper cards retain manual totals and the former double increments without another panel',async t=>{
  const timers=new Map();let next=0;
  t.mock.method(globalThis,'setTimeout',callback=>{timers.set(++next,callback);return next;});
  t.mock.method(globalThis,'clearTimeout',id=>timers.delete(id));
  const saves=[];
  const props={profile:{...profile,recordGeneration:'g1'},record:{...base,version:'1',generation:'g1'},dateStr,records:{},
    onUpdateRecord:async(date,record,options)=>{saves.push({date,record});const generation='g'+(saves.length+1);
      props.record={...record,version:String(saves.length+1),generation};props.profile={...props.profile,recordGeneration:generation};
      options?.onConfirmed(props.record,generation);return true;}};
  const view=mount(props);
  const flush=async()=>{for(const [id,callback] of [...timers])if(timers.delete(id))callback();await Promise.resolve();await Promise.resolve();view();};
  for(const label of ['Sumar 500 pasos','Sumar 500 pasos','Sumar 250 ml de agua','Sumar 250 ml de agua'])
    node(view(),e=>e.props['aria-label']===label).props.onClick();
  await flush();
  assert.equal(saves.length,1);
  assert.equal(saves.at(-1).record.steps,1000);assert.equal(saves.at(-1).record.water,500);
  for(const [title,value,field] of [['Editar pasos','25000','steps'],['Editar cantidad','3000','water']]) {
    node(view(),e=>e.props.title===title).props.onClick();
    const input=node(view(),e=>e.type==='input'&&e.props.autoFocus);
    input.props.onChange({target:{value}});
    node(view(),e=>e.type==='input'&&e.props.autoFocus).props.onBlur();
    await flush();
    assert.equal(saves.at(-1).record[field],Number(value));
  }
});

test('steps conflicts use a named Calori dialog and keep the draft until explicit review', t => {
  mobileEnvironment(t); t.mock.timers.enable({ apis: ['setTimeout'] });
  const saves=[];
  const props={profile:{...profile,recordGeneration:'g1'},record:{...base,version:'1',generation:'g1'},dateStr,records:{},
    onUpdateRecord:async(date,record)=>{saves.push({date,record});return false;}};
  const view=mount(props);
  node(view(),e=>e.props['aria-label']==='Sumar 500 pasos').props.onClick();
  props.record={...props.record,version:'2',generation:'g2',steps:9000,water:1000,meals:[{id:'new',name:'Newer meal',calories:300,type:'Cena'}]};
  props.profile={...props.profile,recordGeneration:'g2'};view();t.mock.timers.tick(400);
  assert.equal(saves.length,0);
  node(view(),e=>e.type==='button'&&e.props.children==='Revisar borrador').props.onClick();
  assert.equal(shell(view).props.title,'Revisar cambios del día');
  assert.ok(node(sheet(view),e=>e.props.role==='dialog'));
  const text=renderToStaticMarkup(view()).replace(/<[^>]+>/g,'');assert.match(text,/Guardado: 9\.000/);assert.match(text,/Tu borrador: 500/);
  node(view(),e=>e.type==='button'&&e.props.children==='Conservar borrador').props.onClick();
  assert.match(renderToStaticMarkup(view()),/>500<\/button>/);assert.equal(saves.length,0);
  node(view(),e=>e.type==='button'&&e.props.children==='Revisar borrador').props.onClick();
  node(view(),e=>e.type==='button'&&e.props.children==='Aplicar valores revisados').props.onClick();
  t.mock.timers.tick(400);assert.equal(saves.length,1);assert.equal(saves[0].record.steps,500);
  assert.equal(saves[0].record.water,1000);assert.equal(saves[0].record.meals[0].id,'new');assert.equal(saves[0].record.version,'2');
});

for (const [action, nameField, name, collection] of [
  ['Agregar comida', 'Ej. pollo con arroz y verduras', 'Ensalada', 'meals'],
  ['Agregar ejercicio', 'Ej. running, fútbol, gimnasio', 'Correr', 'workouts'],
]) {
  test(`${action} closes only after successful persistence and keeps values after failure`, async t => {
    mobileEnvironment(t);
    const saves = [];
    let finish;
    const view = entryView((date, record) => { saves.push({ date, record }); return new Promise(resolve => { finish = resolve; }); });
    open(view, action);
    fill(view, nameField, name);
    fill(view, 'Kcal', '350');
    if (collection === 'workouts') fill(view, 'Minutos', '45');
    const pending = submit(view);
    await submit(view);
    assert.equal(saves.length, 1);
    assert.equal(saves[0].date, dateStr);
    assert.equal(saves[0].record[collection][0].calories, 350);
    assert.ok(nodes(view(), element => element.type === 'button' && element.props.type === 'submit').every(button => button.props.disabled));
    assert.ok(shell(view));
    finish(false);
    await pending;
    assert.equal(field(view, nameField).props.value, name);
    assert.ok(shell(view));
    const retry = submit(view);
    finish(true);
    await retry;
    assert.equal(nodes(view(), element => element.type === 'form').length, 0);
    open(view, action);
    assert.equal(field(view, nameField).props.value, '');
  });
}

test('meal photo selection, replacement, removal and AI proposal stay in the existing form without auto-saving', async t => {
  mobileEnvironment(t);
  const calls = [];
  const view = entryView(() => { assert.fail('AI must not save'); });
  globalThis.__entryServices.estimateMeal = async input => { calls.push(input); return { calories: 400, description: 'Ensalada', assumptions: [] }; };
  open(view, 'Agregar comida');
  fill(view, 'Ej. pollo con arroz y verduras', 'Ensalada');
  const photo = () => node(view(), element => element.type.name === 'MealPhotoPicker').props;
  const first = new Blob(['first']);
  const replacement = new Blob(['replacement']);
  photo().onChange(first);
  assert.equal(photo().blob, first);
  photo().onChange(replacement);
  assert.equal(photo().blob, replacement);
  photo().onBusyChange(true);
  assert.equal(node(view(), element => element.type === 'button' && element.props.type === 'submit').props.disabled, true);
  photo().onBusyChange(false);
  photo().onRemove();
  assert.equal(photo().blob, null);
  await node(view(), element => element.type === 'button' && element.props.children?.includes?.('Estimar con IA')).props.onClick();
  // The UI deliberately starts this async handler without returning its promise.
  await Promise.resolve();
  assert.equal(calls[0].name, 'Ensalada');
  assert.equal(field(view, 'Kcal').props.value, 400);
  assert.match(renderToStaticMarkup(view()), /<h5[^>]*>Estimación con IA<\/h5>/);
  fill(view, 'Kcal', '450');
  assert.match(renderToStaticMarkup(view()), /<h5[^>]*>Valor ajustado<\/h5>/);
  assert.doesNotMatch(renderToStaticMarkup(view()), /<h5[^>]*>Estimación con IA<\/h5>/);
  assert.equal(field(view, 'Kcal').props.value, 450);
  assert.match(renderToStaticMarkup(view()), /Se guardarán 450 kcal/);
  assert.match(renderToStaticMarkup(view()), /Estimación original: 400 kcal/);
  for (const invalid of ['', '-2', '1.5']) {
    fill(view, 'Kcal', invalid);
    assert.match(renderToStaticMarkup(view()), /Ingresá un valor válido/);
    assert.doesNotMatch(renderToStaticMarkup(view()), /Se guardarán/);
  }
  assert.ok(shell(view));
});

test('editing closes the record detail and opens the same responsive shell with existing field values', t => {
  mobileEnvironment(t);
  const meal = { id: 'm1', name: 'Pizza', type: 'Cena', calories: 600, details: 'Dos porciones', time: '20:00', photo_path: 'existing.jpg' };
  const workout = { id: 'w1', activity: 'Correr', duration: 40, calories: 300, details: 'Suave', distance: 5, pace: '8:00', time: '18:00' };
  for (const [record, expected] of [[{ ...base, meals: [meal] }, 'Pizza'], [{ ...base, workouts: [workout] }, 'Correr']]) {
    const view = entryView(undefined, record);
    node(view(), element => element.props.className?.split(' ').includes('daily-record-open')).props.onClick({ currentTarget: null });
    node(view(), element => element.props.className?.includes('record-detail-edit')).props.onClick({ stopPropagation() {} });
    assert.equal(nodes(view(), element => element.props.className?.includes('record-detail-modal')).length, 0);
    assert.ok(node(sheet(view), element => element.props.role === 'dialog'));
    assert.ok(nodes(view(), element => element.props.value === expected).length);
    if (expected === 'Pizza') assert.equal(node(view(), element => element.type.name === 'MealPhotoPicker').props.path, 'existing.jpg');
    else for (const value of [40, 300, '5', '8:00']) assert.ok(nodes(view(), element => element.type === 'input').some(input => input.props.value === value));
  }
});

for (const kind of ['meal', 'workout']) {
  test(`${kind} long text survives add, failed edit, successful edit and reopening without truncation or duplicates`, async t => {
    mobileEnvironment(t);
    const description = 'Pollo con arroz, verduras y una preparación muy detallada. '.repeat(12) + '\nSegunda línea 🌱';
    const notes = 'Ingredientes, cantidades y observaciones. '.repeat(15) + '\nSin recortar el final.';
    const collection = kind === 'meal' ? 'meals' : 'workouts';
    const prefix = kind === 'meal' ? 'meal' : 'workout';
    const nameId = kind === 'meal' ? 'description' : 'activity';
    const name = kind === 'meal' ? description : 'Gimnasio';
    const saves = [];
    let succeeds = true;
    const persist = async (_date, record) => { saves.push(structuredClone(record)); return succeeds; };
    const set = (view, id, value) => node(view(), e => e.props.id === id).props.onChange({ target: { value } });
    const edit = record => {
      const view = entryView(persist, record);
      node(view(), e => e.props.className?.split(' ').includes('daily-record-open')).props.onClick({ currentTarget: null });
      node(view(), e => e.props.className?.includes('record-detail-edit')).props.onClick({ stopPropagation() {} });
      return view;
    };
    const view = entryView(persist);
    open(view, kind === 'meal' ? 'Agregar comida' : 'Agregar ejercicio');
    set(view, `add-${prefix}-${nameId}`, name);
    set(view, `add-${prefix}-notes`, notes);
    fill(view, 'Kcal', '350');
    if (kind === 'workout') fill(view, 'Minutos', '45');
    const markup = renderToStaticMarkup(view());
    assert.match(markup, new RegExp(`<textarea[^>]+id="add-${prefix}-notes"`));
    if (kind === 'meal') assert.match(markup, /<textarea[^>]+id="add-meal-description"[^>]+required/);
    await submit(view);
    // Simulate a persistence round trip; the actual backend and save handlers are unchanged.
    const saved = JSON.parse(JSON.stringify(saves.at(-1)));
    assert.equal(saved[collection].length, 1);
    assert.equal(saved[collection][0].details, notes);
    assert.equal(saved[collection][0][kind === 'meal' ? 'name' : 'activity'], name);
    const editing = edit(saved);
    assert.equal(node(editing(), e => e.props.id === `edit-${prefix}-${nameId}`).props.value, name);
    assert.equal(node(editing(), e => e.props.id === `edit-${prefix}-notes`).props.value, notes);
    const changedNotes = notes + '\nEdición con contenido completo.';
    set(editing, `edit-${prefix}-notes`, changedNotes);
    if (kind === 'meal') set(editing, 'edit-meal-description', description + '\nDescripción editada.');
    succeeds = false;
    await submit(editing);
    assert.equal(node(editing(), e => e.props.id === `edit-${prefix}-notes`).props.value, changedNotes);
    succeeds = true;
    await submit(editing);
    const edited = saves.at(-1);
    assert.equal(edited[collection].length, 1);
    assert.equal(edited[collection][0].id, saved[collection][0].id);
    const reopened = edit(edited);
    assert.equal(node(reopened(), e => e.props.id === `edit-${prefix}-notes`).props.value, changedNotes);
    if (kind === 'meal') assert.equal(node(reopened(), e => e.props.id === 'edit-meal-description').props.value, description + '\nDescripción editada.');
  });
}

test('mobile shell locks background scroll, contains focus, handles Escape and restores focus and viewport listeners', t => {
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  const listeners = new Map();
  const viewportListeners = new Map();
  class Element {
    constructor() { this.style = { overflowY: 'auto', setProperty: (key, value) => { this.style[key] = value; } }; this.inert = false; this.isConnected = true; }
    focus() { globalThis.document.activeElement = this; }
    getClientRects() { return [{}]; }
  }
  globalThis.HTMLElement = Element;
  const main = new Element(); main.scrollTop = 850;
  const nav = new Element();
  const trigger = new Element();
  const close = new Element();
  const last = new Element();
  const content = new Element(); content.scrollTop = 0;
  content.getBoundingClientRect = () => ({ top: 100, bottom: 400 });
  last.getBoundingClientRect = () => ({ top: 410, bottom: 450 });
  content.contains = element => element === last;
  const dialog = new Element();
  dialog.contains = element => [close, last].includes(element);
  dialog.querySelectorAll = () => [close, last];
  dialog.querySelector = selector => selector === '.entry-form-content' ? content : null;
  dialog.addEventListener = () => {};
  dialog.removeEventListener = () => {};
  const viewport = { height: 844, offsetTop: 0,
    addEventListener: (type, handler) => viewportListeners.set(type, handler),
    removeEventListener: type => viewportListeners.delete(type) };
  globalThis.window = { innerHeight: 844, visualViewport: viewport, addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) };
  globalThis.document = { body: { style: { overflow: 'auto' } }, activeElement: trigger,
    querySelector: selector => selector === '.app-main' ? main : null, querySelectorAll: () => [main, nav],
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: type => listeners.delete(type) };
  t.after(() => { globalThis.window = previous.window; globalThis.document = previous.document; globalThis.HTMLElement = previous.HTMLElement; });
  let closed = 0;
  const view = mount({ title: 'Agregar comida', onClose() { closed++; }, children: null }, InteractiveShell, true);
  const tree = view();
  node(tree, element => element.props.role === 'dialog').props.ref.current = dialog;
  node(tree, element => element.props['aria-label'] === 'Cerrar formulario').props.ref.current = close;
  close.click = () => { closed++; };
  view.flushEffects();
  assert.equal(main.style.overflowY, 'hidden');
  assert.equal(globalThis.document.body.style.overflow, 'hidden');
  assert.equal(main.inert, true);
  assert.equal(nav.inert, true);
  assert.equal(globalThis.document.activeElement, close);
  listeners.get('keydown')({ key: 'Tab', shiftKey: true, preventDefault() {} });
  assert.equal(globalThis.document.activeElement, last);
  listeners.get('keydown')({ key: 'Tab', shiftKey: false, preventDefault() {} });
  assert.equal(globalThis.document.activeElement, close);
  viewport.height = 450;
  last.focus();
  viewportListeners.get('resize')();
  assert.equal(dialog.style['--entry-visible-bottom'], '450px');
  globalThis.window.innerHeight = 780;
  viewport.offsetTop = 23;
  dialog.parentElement = { getBoundingClientRect: () => ({ top: 9 }) };
  viewportListeners.get('scroll')();
  assert.equal(dialog.style['--entry-visible-bottom'], '464px');
  assert.equal(dialog.style['--entry-viewport-height'], '450px');
  assert.equal(content.scrollTop, 124);
  assert.equal(main.scrollTop, 850);
  listeners.get('keydown')({ key: 'Escape', preventDefault() {} });
  assert.equal(closed, 1);
  view.unmount();
  assert.equal(main.style.overflowY, 'auto');
  assert.equal(main.inert, false);
  assert.equal(nav.inert, false);
  assert.equal(globalThis.document.body.style.overflow, 'auto');
  assert.equal(globalThis.document.activeElement, trigger);
  assert.equal(main.scrollTop, 850);
  assert.equal(viewportListeners.size, 0);
  assert.equal(listeners.size, 0);
});

test('workout estimation fills the proposal without saving or removing secondary fields', async t => {
  mobileEnvironment(t);
  const calls = [];
  globalThis.__entryServices.estimateWorkout = async input => { calls.push(input); return { calories: 280, assumptions: [] }; };
  const view = entryView(() => { assert.fail('AI must not save'); });
  open(view, 'Agregar ejercicio');
  fill(view, 'Ej. running, fútbol, gimnasio', 'Correr');
  fill(view, 'Minutos', '30');
  await node(view(), element => element.type === 'button' && element.props.children?.includes?.('Estimar con IA')).props.onClick();
  await Promise.resolve();
  assert.equal(calls[0].duration, 30);
  assert.equal(field(view, 'Kcal').props.value, 280);
  assert.match(renderToStaticMarkup(view()), /<h5[^>]*>Estimación con IA<\/h5>/);
  fill(view, 'Kcal', '300');
  assert.match(renderToStaticMarkup(view()), /<h5[^>]*>Valor ajustado<\/h5>/);
  assert.doesNotMatch(renderToStaticMarkup(view()), /<h5[^>]*>Estimación con IA<\/h5>/);
  assert.equal(node(view(), e => e.props.id === 'add-workout-distance').props.inputMode, 'decimal');
  assert.match(renderToStaticMarkup(node(view(), e => e.props.htmlFor === 'add-workout-distance')), /Distancia.*\(km\)/);
  assert.ok(field(view, 'Ritmo (ej: 5:30) opc.'));
});

test('AI estimation forms show session/quota/service errors and retain drafts without saving or automatic retries', async t => {
  mobileEnvironment(t);
  const errors = [];
  t.mock.method(globalThis.__entryServices.toast, 'error', message => errors.push(message));
  const previousReader = globalThis.FileReader;
  globalThis.FileReader = class {
    readAsDataURL() { this.result = 'data:image/jpeg;base64,YWJj'; queueMicrotask(() => this.onload()); }
  };
  t.after(() => { globalThis.FileReader = previousReader; });
  let failure;
  const requests = [];
  const failEstimate = async input => { requests.push(input); throw failure; };
  t.mock.method(globalThis.__entryServices, 'estimateMeal', failEstimate);
  t.mock.method(globalThis.__entryServices, 'estimateWorkout', failEstimate);
  for (const kind of ['meal', 'workout']) {
    for (const error of [
      new AIRequestError('Tu sesión expiró. Volvé a iniciar sesión.', 401, 'unauthorized'),
      new AIRequestError('Alcanzaste el límite de consultas por hoy para esta modalidad.', 429, 'quota_exceeded', 60),
      new AIRequestError('No pudimos conectar con el asistente. Intentá nuevamente.', 503, 'service_unavailable'),
      new Error('private_provider_detail'),
    ]) {
      failure = error;
      const view = entryView(() => assert.fail('An estimation failure must not save a record'));
      const meal = kind === 'meal';
      const description = meal ? 'Ej. pollo con arroz y verduras' : 'Ej. running, fútbol, gimnasio';
      const name = meal ? 'Ensalada' : 'Correr';
      open(view, meal ? 'Agregar comida' : 'Agregar ejercicio');
      fill(view, description, name);
      const image = new Blob(['synthetic image'], { type: 'image/jpeg' });
      if (meal) node(view(), element => element.type.name === 'MealPhotoPicker').props.onChange(image);
      else fill(view, 'Minutos', '30');
      const before = requests.length;
      node(view(), element => element.type === 'button' && element.props.children?.includes?.('Estimar con IA')).props.onClick();
      await new Promise(setImmediate);
      assert.equal(requests.length, before + 1);
      const notice = node(view(), e => e.type === 'p' && e.props.role === 'status');
      const message = notice.props.children.join(' ');
      assert.match(message, /calorías manualmente/);
      if (error instanceof AIRequestError) assert.ok(message.includes(error.message));
      assert.ok(!message.includes('private_provider_detail'));
      assert.deepEqual(errors, []);
      const retryable = ![401, 429].includes(error.status);
      const action = node(view(), e => e.type === 'button' && e.props.children?.includes?.(retryable ? 'Reintentar estimación' : 'Estimar con IA'));
      assert.equal(action.props.disabled, !retryable);
      action.props.onClick();
      await new Promise(setImmediate);
      assert.equal(requests.length, before + (retryable ? 2 : 1));
      assert.equal(field(view, description).props.value, name);
      assert.equal(field(view, 'Kcal').props.value, '');
      if (meal) {
        assert.equal(node(view(), element => element.type.name === 'MealPhotoPicker').props.blob, image);
        assert.equal(requests.at(-1).attachment.kind, 'image');
      } else assert.equal(field(view, 'Minutos').props.value, 30);
      assert.ok(shell(view));
    }
  }
});

test('Retry-After expires without sending a request until the user retries', async t => {
  mobileEnvironment(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date('2026-11-13T12:00:00Z') });
  let calls = 0;
  t.mock.method(globalThis.__entryServices, 'estimateMeal', async () => {
    calls++;
    if (calls === 1) throw new AIRequestError('Servicio temporalmente ocupado.', 503, 'service_unavailable', 60);
    return { calories: 321, assumptions: [] };
  });
  const view = mount({ profile, record: base, dateStr, records: {}, onUpdateRecord: () => assert.fail('unexpected save') }, InteractiveDailyPanel, true);
  const render = () => { const tree = view(); view.flushEffects(); return tree; };
  const estimate = () => node(render(), e => e.props.className?.startsWith('entry-ai-action'));
  open(view, 'Agregar comida'); fill(view, 'Ej. pollo con arroz y verduras', 'Arroz');
  estimate().props.onClick(); await new Promise(setImmediate);
  assert.equal(estimate().props.disabled, true);
  t.mock.timers.tick(59999);
  estimate().props.onClick(); assert.equal(calls, 1);
  t.mock.timers.tick(1);
  const retry = estimate();
  assert.equal(retry.props.disabled, false);
  assert.ok(retry.props.children.includes('Reintentar estimación'));
  assert.equal(calls, 1);
  retry.props.onClick(); await new Promise(setImmediate);
  assert.equal(calls, 2); assert.equal(field(view, 'Kcal').props.value, 321);
  view.unmount();
});

test('photo upload failures keep the meal draft and image available for retry', async t => {
  mobileEnvironment(t);
  const uploads = [];
  globalThis.__entryServices.storage = { upload: async (...args) => { uploads.push(args); return { error: new Error('Offline') }; }, remove: async () => ({ error: null }) };
  const view = entryView(() => { assert.fail('A failed upload must not write the record'); });
  open(view, 'Agregar comida');
  fill(view, 'Ej. pollo con arroz y verduras', 'Almuerzo');
  fill(view, 'Kcal', '450');
  const image = new Blob(['jpeg'], { type: 'image/jpeg' });
  node(view(), element => element.type.name === 'MealPhotoPicker').props.onChange(image);
  await submit(view);
  assert.equal(uploads[0][1], image);
  assert.equal(uploads[0][2].contentType, 'image/jpeg');
  assert.match(node(view(), item => item.props.className === 'meal-write-error').props.children, /confirmar el guardado/);
  assert.equal(field(view, 'Ej. pollo con arroz y verduras').props.value, 'Almuerzo');
  assert.equal(node(view(), element => element.type.name === 'MealPhotoPicker').props.blob, image);
  assert.ok(shell(view));
});

test('no global outside-click handler dismisses an active form', t => {
  mobileEnvironment(t, false);
  const handlers = new Map();
  document.addEventListener = (type, handler) => handlers.set(type, handler);
  document.removeEventListener = type => handlers.delete(type);
  const view = mount({ profile, record: base, dateStr, records: {}, onUpdateRecord: async () => true }, InteractiveDailyPanel, true);
  view(); view.flushEffects();
  open(view, 'Agregar comida');
  view(); view.flushEffects();
  assert.equal(handlers.has('click'), false);
  assert.ok(shell(view));
  view.unmount();
});

test('all four entry modes associate labels, retain mobile CTAs and use accessible time actions', t => {
  mobileEnvironment(t);
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 17, 19, 54) });
  t.mock.method(Date.prototype, 'toLocaleTimeString', () => '07:54 p. m.');
  const meal = { id: 'm1', name: 'Pizza', type: 'Cena', calories: 600, details: 'Dos porciones', time: '20:00' };
  const workout = { id: 'w1', activity: 'Correr', duration: 40, calories: 300, details: 'Suave', distance: 5, pace: '8:00', time: '18:00' };
  for (const [action, record, title, cta] of [
    ['Agregar comida', base, 'Agregar comida', 'Guardar comida'],
    ['Agregar ejercicio', base, 'Agregar ejercicio', 'Guardar ejercicio'],
    [null, { ...base, meals: [meal] }, 'Editar comida', 'Guardar cambios'],
    [null, { ...base, workouts: [workout] }, 'Editar ejercicio', 'Guardar cambios'],
  ]) {
    const view = entryView(undefined, record);
    if (action) open(view, action);
    else {
      node(view(), e => e.props.className?.split(' ').includes('daily-record-open')).props.onClick({ currentTarget: null });
      node(view(), e => e.props.className?.includes('record-detail-edit')).props.onClick({ stopPropagation() {} });
    }
    const tree = sheet(view);
    assert.equal(shell(view).props.title, title);
    const form = node(tree, e => e.type === 'form');
    const controls = nodes(form, e => ['input', 'select', 'textarea'].includes(e.type));
    const labels = nodes(form, e => e.type === 'label');
    for (const control of controls) {
      assert.ok(control.props.id);
      assert.equal(labels.filter(label => label.props.htmlFor === control.props.id).length, 1);
    }
    const footer = node(form, e => e.props.className?.includes('entry-form-footer'));
    assert.ok(renderToStaticMarkup(footer).includes(cta));
    const nativeTime = node(form, e => e.type === 'input' && e.props.type === 'time');
    if (!action) assert.equal(nativeTime.props.value, title.includes('comida') ? meal.time : workout.time);
    nativeTime.props.onChange({ target: { value: '08:27' } });
    assert.equal(node(view(), e => e.type === 'input' && e.props.type === 'time').props.value, '08:27');
    const calories = controls.find(control => control.props.id.endsWith('-calories'));
    const suffix = node(form, e => e.props.id === calories.props['aria-describedby']);
    assert.equal(suffix.props.children, 'kcal');
    const now = node(form, e => e.props['aria-label'] === 'Usar hora actual');
    assert.equal(now.props.children, 'Ahora');
    now.props.onClick();
    assert.equal(node(view(), e => e.type === 'input' && e.props.type === 'time').props.value, '19:54');
    assert.equal(node(form, e => e.props.id?.endsWith('-notes')).type, 'textarea');
    assert.equal(node(tree, e => e.props.className === 'entry-sheet-handle').props['aria-hidden'], 'true');
    const ids = controls.map(e => e.props.id);
    assert.ok(ids[0].endsWith(title.includes('comida') ? '-description' : '-activity'));
    assert.ok(ids.at(-1).endsWith('-notes'));
  }
});

test('gym notes retain contextual routine copy without changing running field detection', t => {
  mobileEnvironment(t);
  const view = entryView();
  open(view, 'Agregar ejercicio');
  fill(view, 'Ej. running, fútbol, gimnasio', 'Gimnasio');
  const label = node(view(), e => e.type === 'label' && e.props.htmlFor === 'add-workout-notes');
  assert.match(renderToStaticMarkup(label), /Detalle de la rutina/);
  assert.match(node(view(), e => e.props.id === 'add-workout-notes').props.placeholder, /Press banca/);
  assert.equal(nodes(view(), e => e.props.id === 'add-workout-distance').length, 0);
  fill(view, 'Ej. running, fútbol, gimnasio', 'Correr');
  assert.ok(node(view(), e => e.props.id === 'add-workout-distance'));
  assert.ok(node(view(), e => e.props.id === 'add-workout-pace'));
});

const journalRecord = (count, day = dateStr) => {
  const entries = Array.from({ length: count }, (_, index) => ({
    id: `${day}-${index}`, time: `${String(8 + index).padStart(2, '0')}:00`,
    calories: 100 + index, details: `Detalle completo ${index}`,
    ...(index % 2 ? { activity: `Ejercicio ${index}`, duration: 30, muscles: [] }
      : { name: `Comida ${index}`, type: 'Almuerzo' }),
  }));
  return { ...base, dateStr: day, meals: entries.filter((_, index) => index % 2 === 0).reverse(),
    workouts: entries.filter((_, index) => index % 2 === 1).reverse() };
};

// Real React owns the keyed disclosure state and real DOM events. Persistence
// stays simulated; viewport visibility remains a real-browser acceptance check.
async function journalDOM(t, initial = {}) {
  const dom = new JSDOM('<main class="app-main"><div id="root"></div></main>', { pretendToBeVisual: true });
  const previous = {};
  for (const name of ['window', 'document', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT']) previous[name] = globalThis[name];
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let mobile = false;
  const mediaListeners = new Set();
  window.matchMedia = () => ({ get matches() { return mobile; },
    addEventListener(_type, handler) { mediaListeners.add(handler); },
    removeEventListener(_type, handler) { mediaListeners.delete(handler); } });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  const saves = [];
  let props = { profile, record: journalRecord(8), dateStr, records: {},
    onUpdateRecord: async (day, record) => { saves.push({ day, record: structuredClone(record) }); return true; }, ...initial };
  const render = async (next = {}) => {
    props = { ...props, ...next };
    await act(() => root.render(React.createElement(DailyPanel, props)));
  };
  t.after(async () => {
    await act(() => root.unmount()); dom.window.close();
    for (const [name, value] of Object.entries(previous)) globalThis[name] = value;
  });
  await render();
  return { saves, render, leave: () => act(() => root.render(null)), get props() { return props; },
    list: () => document.querySelector('.daily-records'),
    toggle: () => document.querySelector('.daily-records-toggle'),
    resize: async value => act(() => { mobile = value; mediaListeners.forEach(handler => handler()); window.dispatchEvent(new window.Event('resize')); }),
  };
}

async function mountHabitFeedback(t) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  let record = { ...base, version: '1', generation: 'sample' };
  const writes = [];
  const controller = new HabitDraftController(() => record, (day, candidate, options) =>
    new Promise(resolve => writes.push({ day, candidate, options, resolve })));
  t.after(() => controller.dispose());
  const view = await journalDOM(t, { record, habitDrafts: controller });
  const status = () => document.querySelector('.daily-habits-heading [role=status]');
  const press = (label = 'Sumar 250 ml de agua') => act(() => {
    const button = document.querySelector(`[aria-label="${label}"]`);
    button.focus();
    button.click();
  });
  const tick = ms => act(() => t.mock.timers.tick(ms));
  const settle = async (kind = 'confirmed') => {
    const write = writes.at(-1);
    await act(async () => {
      if (kind === 'confirmed') {
        record = { ...write.candidate, version: String(Number(record.version) + 1) };
        write.options.onConfirmed(record, record.generation);
      } else {
        write.options.onFailure({ kind, message: 'Respuesta sintética' });
      }
      write.resolve(kind === 'confirmed');
    });
    await view.render({ record });
  };
  return { controller, view, status, press, tick, settle, writes };
}

test('habit success lasts 3000 ms after the last acknowledgement, retains focus and never changes saved data', async t => {
  const { controller, status, press, tick, settle, writes } = await mountHabitFeedback(t);
  const region = status();
  assert.equal(region.textContent, '');
  await press();
  assert.equal(region.textContent, 'Guardando…');
  await tick(400);
  await press('Sumar 500 pasos');
  await settle();
  assert.equal(region.textContent, 'Guardando…', 'The first acknowledgement still has queued changes');
  assert.equal(controller.view(dateStr).confirmation, undefined);
  await tick(400);
  await settle();
  const first = controller.view(dateStr).confirmation;
  assert.equal(first.confirmedAt, Date.now());
  assert.equal(region.textContent, '✓ Guardado');
  await tick(1800);
  await press();
  assert.equal(region.textContent, 'Guardando…');
  await tick(400);
  await settle();
  const second = controller.view(dateStr).confirmation;
  assert.notEqual(second.id, first.id);
  const focus = document.activeElement;
  await tick(800); // First deadline.
  assert.equal(region.textContent, '✓ Guardado');
  await tick(2199);
  assert.equal(region.textContent, '✓ Guardado');
  await tick(1);
  assert.equal(status(), region, 'Retain the live region when the content expires');
  assert.equal(region.childElementCount, 0);
  assert.equal(region.textContent, '');
  assert.equal(document.activeElement, focus);
  assert.equal(controller.view(dateStr).status, 'saved');
  assert.deepEqual([controller.view(dateStr).water, controller.view(dateStr).steps], [500, 500]);
  assert.equal(writes.length, 3);
});

for (const [failure, action] of [['ambiguous', 'Comprobar y reintentar'], ['conflict', 'Revisar borrador']]) {
  test(`expiring an earlier habit success cannot hide a pending write or its ${failure} recovery`, async t => {
    const { status, press, tick, settle, controller } = await mountHabitFeedback(t);
    await press(); await tick(400); await settle();
    assert.equal(status().textContent, '✓ Guardado');
    await tick(2200); await press(); await tick(400);
    if (failure === 'ambiguous') {
      await tick(400);
      assert.equal(status().textContent, 'Guardando…', 'The old deadline falls during this pending request');
    }
    await settle(failure);
    const alert = document.querySelector('.habit-feedback[role=alert]');
    await tick(3000);
    assert.equal(document.querySelector('[role=alert]'), alert);
    assert.equal(alert.querySelector('button').textContent, action);
    assert.equal(status().textContent, '');
    assert.equal(controller.view(dateStr).water, 500);
  });
}

test('habit success follows its date and owner and uses the original deadline after leaving and returning', async t => {
  const { controller, view, status, press, tick, settle } = await mountHabitFeedback(t);
  await press('Editar cantidad de agua');
  assert.equal(status().textContent, 'Editando');
  await act(() => document.activeElement.blur());
  assert.equal(status().textContent, '');
  await press(); await tick(400); await settle();
  assert.equal(status().textContent, '✓ Guardado');
  await tick(1000);
  await view.render({ dateStr: '2020-04-01' });
  assert.equal(status().textContent, '');
  await view.render({ dateStr });
  assert.equal(status().textContent, '✓ Guardado');
  await view.leave();
  await tick(1500);
  await view.render();
  assert.equal(status().textContent, '✓ Guardado');
  await tick(500);
  assert.equal(status().textContent, '');
  await view.leave(); await view.render();
  assert.equal(status().textContent, '', 'An expired acknowledgement cannot restart on remount');
  await press(); await tick(400); await settle();
  assert.equal(status().textContent, '✓ Guardado');
  await act(() => { controller.resetOwner(); controller.connect(); });
  await view.render({ profile: { ...profile, id: 'other-synthetic-account' } });
  assert.equal(status().textContent, '');
  assert.equal(controller.view(dateStr).confirmation, undefined);
});

test('journal disclosure keeps complete mixed chronological records and accessible controls at 0/1/2/3/4/5/8 entries', async t => {
  const view = await journalDOM(t);
  for (const count of [0, 1, 2, 3, 4, 5, 8]) {
    const record = journalRecord(count);
    const snapshot = structuredClone(record);
    await view.render({ record });
    const list = view.list();
    assert.equal(list.children.length, count);
    assert.equal(list.dataset.expanded, 'false');
    assert.deepEqual([...list.querySelectorAll('.daily-record-title')].map(element => element.textContent.trim()),
      Array.from({ length: count }, (_, index) => `${index % 2 ? 'Ejercicio' : 'Comida'} ${index}`));
    assert.deepEqual(record, snapshot, 'Sorting the combined list must not mutate source records');
    if (count <= 4) { assert.equal(view.toggle(), null); continue; }
    const toggle = view.toggle();
    assert.equal(toggle.getAttribute('aria-controls'), list.id);
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.match(toggle.textContent, new RegExp(`Ver todos los registros \\(${count}\\)`));
    toggle.focus();
    await act(() => toggle.click());
    assert.equal(view.list(), list, 'Expansion must retain the same record nodes');
    assert.equal(list.dataset.expanded, 'true');
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(toggle.textContent, 'Mostrar menos');
    await act(() => toggle.click());
    assert.equal(list.dataset.expanded, 'false');
    assert.equal(document.activeElement, toggle, 'Collapsing must retain focus on its disclosure control');
    assert.equal(list.children.length, count);
  }
  assert.equal(view.saves.length, 0, 'Disclosure is presentation only');
});

test('journal refresh and mobile resizing retain all records while only date/profile/group changes reset expansion', async t => {
  const view = await journalDOM(t);
  await act(() => view.toggle().click());
  const originalList = view.list();
  await view.render({ record: structuredClone(view.props.record) });
  assert.equal(view.list(), originalList);
  assert.equal(view.list().dataset.expanded, 'true');
  await view.resize(true);
  assert.equal(view.list().children.length, 8);
  assert.equal(view.list().dataset.expanded, 'true');
  assert.ok([...view.list().children].every(item => !item.hidden && !item.hasAttribute('aria-hidden') && !item.style.display),
    'An expanded list exposes every record after resizing');
  await view.resize(false);
  assert.equal(view.list().dataset.expanded, 'true');
  const add = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Agregar comida');
  await act(() => add.click());
  const draft = document.getElementById('add-meal-description');
  await act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(draft, 'Borrador que se conserva');
    draft.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  const nextDay = '2025-12-20';
  await view.render({ dateStr: nextDay, record: journalRecord(8, nextDay) });
  assert.notEqual(view.list(), originalList);
  assert.equal(view.list().dataset.expanded, 'false');
  assert.equal(document.getElementById('add-meal-description'), draft, 'A date change must not remount the entry form');
  assert.equal(draft.value, 'Borrador que se conserva');
  await act(() => view.toggle().click());
  await view.render({ profile: { ...profile, id: 'other-profile' } });
  assert.equal(view.list().dataset.expanded, 'false');
  await act(() => view.toggle().click());
  await view.render({ selectedGroup: { type: 'week', label: 'Semana', dates: [nextDay] } });
  assert.equal(view.list(), null);
  await view.render({ selectedGroup: { type: 'day', label: nextDay, dates: [nextDay] } });
  assert.equal(view.list().dataset.expanded, 'false');
  assert.equal(view.saves.length, 0);
});

test('journal expansion and collapse preserve an open meal form and its draft through real bubbling clicks', async t => {
  const view = await journalDOM(t);
  const add = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Agregar comida');
  await act(() => add.click());
  const draft = document.getElementById('add-meal-description');
  assert.ok(draft);
  await act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(draft, 'Comida todavía sin guardar');
    draft.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  const form = draft.closest('form');
  for (const expanded of ['true', 'false']) {
    await act(() => view.toggle().click());
    assert.equal(view.list().dataset.expanded, expanded);
    assert.equal(document.getElementById('add-meal-description'), draft, 'The disclosure click must not dismiss or remount the entry form');
    assert.equal(draft.closest('form'), form);
    assert.equal(draft.value, 'Comida todavía sin guardar');
  }
  assert.equal(view.saves.length, 0);
});

test('visible and expanded journal rows open the same edit dialog and save once without duplicates or collapsing', async t => {
  const view = await journalDOM(t);
  for (const index of [0, 5]) {
    if (index >= 4) await act(() => view.toggle().click());
    const list = view.list();
    const trigger = list.children[index].querySelector('.daily-record-open');
    assert.equal(trigger.tagName, 'BUTTON');
    assert.equal(trigger.type, 'button');
    trigger.focus();
    assert.equal(document.activeElement, trigger);
    await act(() => trigger.click());
    await act(() => document.querySelector('.record-detail-edit').click());
    const kind = index % 2 ? 'workout' : 'meal';
    const expectedName = `${index % 2 ? 'Ejercicio' : 'Comida'} ${index}`;
    assert.equal(document.querySelector('.record-detail-modal'), null);
    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog);
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    assert.equal(document.getElementById(`edit-${kind}-${kind === 'meal' ? 'description' : 'activity'}`).value, expectedName);
    assert.equal(document.getElementById(`edit-${kind}-notes`).value, `Detalle completo ${index}`);
    const notes = document.getElementById(`edit-${kind}-notes`);
    await act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(notes, `Nota editada ${index}`);
      notes.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await act(async () => { dialog.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); });
    assert.equal(view.saves.length, index === 0 ? 1 : 2);
    const saved = view.saves.at(-1).record;
    const all = [...saved.meals, ...saved.workouts];
    assert.equal(all.length, 8);
    assert.equal(new Set(all.map(item => item.id)).size, 8);
    assert.equal(all.filter(item => item.id === `${dateStr}-${index}`).length, 1);
    assert.equal(all.find(item => item.id === `${dateStr}-${index}`).details, `Nota editada ${index}`);
    assert.equal(document.querySelector('[role="dialog"]'), null);
    await view.render({ record: saved });
    assert.equal(view.list(), list);
    assert.equal(view.list().dataset.expanded, index >= 4 ? 'true' : 'false');
  }
});

test('missing meals qualify the visible balance without changing its number, expenditure or records', () => {
  const empty = render(base);
  assert.match(empty, /Sin datos de energía/);
  assert.match(empty, /Balance estimado: -1\.618 kcal/);
  assert.doesNotMatch(empty, /Balance provisional|Sin comidas registradas/);
  assert.match(empty, /-1\.618 kcal/);
  assert.doesNotMatch(empty, /Déficit Alto/);
  const activityOnly = render({ ...base, steps: 7000 });
  assert.match(activityOnly, /Balance provisional/);
  assert.match(activityOnly, /Sin comidas registradas/);
  assert.match(activityOnly, /-1\.898 kcal/);
  const recorded = render({ ...base, meals: [{ id: 'meal', name: 'Comida', calories: 400, type: 'Almuerzo', time: '12:00' }] });
  assert.match(recorded, /Balance energético/);
  assert.match(recorded, /-1\.218 kcal/);
  assert.doesNotMatch(recorded, /Balance provisional/);
  assert.equal(base.meals.length, 0);
});

for (const mobile of [false, true]) test(`record details preserve date, keyboard focus and the transition to editing (${mobile ? 'mobile' : 'desktop'})`, async t => {
  const day = '2026-11-11';
  const view = await journalDOM(t, { dateStr: day, record: journalRecord(2, day) });
  window.HTMLElement.prototype.getClientRects = () => [{ width: 100, height: 44 }];
  await view.resize(mobile);
  for (const index of [0, 1]) {
    const trigger = view.list().children[index].querySelector('.daily-record-open');
    trigger.focus();
    await act(() => trigger.click());
    let dialog = document.querySelector('[role="dialog"]');
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    assert.equal(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent, 'Detalle del registro');
    assert.equal(dialog.querySelector('time').dateTime, day);
    assert.equal(dialog.querySelector('.record-detail-main').textContent.trim(), `${index ? 'Ejercicio' : 'Comida'} ${index}`);
    const close = dialog.querySelector('[aria-label="Cerrar detalle"]');
    const remove = [...dialog.querySelectorAll('button')].find(button => button.textContent.includes('Eliminar'));
    assert.equal(document.activeElement, close);
    await act(() => close.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
    assert.equal(document.activeElement, remove);
    await act(() => remove.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
    assert.equal(document.activeElement, close);
    await act(() => close.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, trigger);

    await act(() => trigger.click());
    await act(() => document.querySelector('.record-detail-edit').click());
    dialog = document.querySelector('[role="dialog"]');
    assert.equal(document.querySelectorAll('[role="dialog"]').length, 1);
    assert.equal(document.querySelector('.record-detail-modal'), null);
    assert.equal(document.activeElement, dialog.querySelector('[aria-label="Cerrar formulario"]'));
    assert.equal(dialog.querySelector('time').dateTime, day);
    assert.equal(document.getElementById(`edit-${index ? 'workout-activity' : 'meal-description'}`).value, `${index ? 'Ejercicio' : 'Comida'} ${index}`);
    await act(() => document.activeElement.click());
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, trigger);
  }
  assert.equal(view.saves.length, 0);
});

for (const mobile of [false, true]) test(`weight dialog names its historical day, contains keyboard focus and submits once (${mobile ? 'mobile' : 'desktop'})`, async t => {
  const day = '2026-11-11';
  const record = { ...journalRecord(2, day), steps: 9200, water: 2300, weight: 71.2 };
  const view = await journalDOM(t, { dateStr: day, record, records: { [day]: record } });
  window.HTMLElement.prototype.getClientRects = () => [{ width: 100, height: 44 }];
  await view.resize(mobile);
  const trigger = document.querySelector('[aria-label="Editar peso"]');
  trigger.focus();
  await act(() => trigger.click());
  let dialog = document.querySelector('[role="dialog"]');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.equal(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent, 'Editar peso');
  assert.equal(dialog.querySelector('time').dateTime, day);
  assert.match(dialog.querySelector('.entry-date-context').textContent, /Día del registro.*11 nov 2026/);
  const input = dialog.querySelector('input[name="weight"]');
  assert.equal(dialog.querySelector('label').htmlFor, input.id);
  assert.equal(dialog.querySelector('label').textContent, 'Peso (kg)');
  const close = dialog.querySelector('[aria-label="Cerrar formulario"]');
  const save = dialog.querySelector('[type="submit"]');
  assert.equal(document.activeElement, close);
  await act(() => close.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
  assert.equal(document.activeElement, save);
  await act(() => save.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
  assert.equal(document.activeElement, close);
  await act(() => input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(document.activeElement, trigger);
  assert.equal(view.saves.length, 0);

  await act(() => trigger.click());
  dialog = document.querySelector('[role="dialog"]');
  const edited = dialog.querySelector('input[name="weight"]');
  await act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(edited, '72,5');
    edited.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  assert.equal(edited.value, '72.5');
  // JSDOM does not perform implicit Enter submission. Send the key, then invoke
  // that native form action: only onSubmit may write, never an extra key handler.
  await act(() => edited.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
  assert.equal(view.saves.length, 0);
  await act(async () => { dialog.querySelector('form').requestSubmit(); });
  assert.equal(view.saves.length, 1);
  assert.equal(view.saves[0].day, day);
  assert.equal(view.saves[0].record.weight, 72.5);
  assert.equal(view.saves[0].record.steps, 9200);
  assert.equal(view.saves[0].record.water, 2300);
  assert.deepEqual(view.saves[0].record.meals, record.meals);
  assert.deepEqual(view.saves[0].record.workouts, record.workouts);
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(document.activeElement, trigger);
});

function dialogMethodsForDeletion() {
  const prototype = window.HTMLDialogElement.prototype;
  prototype.showModal ??= function () { this.setAttribute('open', ''); };
  prototype.close ??= function () { this.removeAttribute('open'); };
}

const deleteDialog = () => document.querySelector('dialog[data-record-delete][open]');
const deleteAction = () => deleteDialog().querySelector('button.profile-button-danger');

async function requestRecordDeletion(view, kind) {
  await act(() => view.list().querySelector(`[data-entry-kind="${kind}"]`).click());
  await act(() => document.querySelector('.record-detail-delete').click());
}

test('meal deletion preserves the selected kind, latest day data, and focus through cancellation, failure and a double tap', async t => {
  const day = '2026-11-12';
  const record = { ...journalRecord(2, day), version: '1', generation: 'a' };
  record.meals[0].photo_path = 'fixture-photo.jpg';
  record.workouts[0].id = record.meals[0].id;
  const attempts = [];
  const view = await journalDOM(t, { record, dateStr: day, onUpdateRecord: (date, candidate, options) =>
    new Promise(resolve => attempts.push({ date, candidate, options, resolve })),
  });
  dialogMethodsForDeletion();

  await requestRecordDeletion(view, 'meal');
  assert.match(deleteDialog().textContent, /¿Eliminar comida\?Comida 0.*12 nov 2026.*08:00.*100 kcal/);
  const cancel = deleteDialog().querySelector('button.profile-button-neutral');
  assert.equal(document.activeElement, cancel);
  await act(() => cancel.click());
  await act(() => new Promise(done => window.requestAnimationFrame(done)));
  assert.equal(deleteDialog(), null);
  assert.equal(document.activeElement, document.querySelector('.record-detail-delete'));
  assert.equal(attempts.length, 0);

  await act(() => document.querySelector('.record-detail-delete').click());
  const recent = { ...record, version: '2', steps: 6400, water: 1750, weight: 72.5 };
  await view.render({ record: recent });
  await act(() => {
    const action = deleteAction();
    action.click();
    action.click();
  });
  assert.equal(attempts.length, 1);
  assert.equal(deleteAction().disabled, true);
  assert.match(deleteDialog().textContent, /Eliminando/);
  assert.equal(document.querySelector('.record-delete-notice'), null);
  assert.equal(attempts[0].date, day);
  assert.deepEqual(attempts[0].candidate, { ...recent, meals: [] });
  assert.equal(attempts[0].options.feedback, 'contextual');

  await act(async () => {
    attempts[0].options.onFailure({ kind: 'conflict', message: 'Conflicto de prueba' });
    attempts[0].resolve(false);
  });
  assert.match(deleteDialog().querySelector('[role="alert"]').textContent, /Los registros se actualizaron/);
  assert.equal(deleteAction().disabled, false);
  assert.equal(view.list().querySelectorAll('[data-entry-kind="meal"]').length, 1);
  await act(() => deleteAction().click());
  assert.equal(attempts.length, 2);
  await act(async () => attempts[1].resolve(true));
  await view.render({ record: attempts[1].candidate });

  assert.equal(deleteDialog(), null);
  assert.equal(document.querySelector('.record-detail-modal'), null);
  assert.equal(document.activeElement, document.getElementById('fitness-daily-entries'));
  assert.match(document.querySelector('.record-delete-notice').textContent, /Comida eliminada.*limpieza de la foto/);
  await act(() => view.list().querySelector('[data-entry-kind="workout"]').click());
  assert.equal(document.querySelector('.record-delete-notice'), null);
  assert.match(document.querySelector('.record-detail-main').textContent, /Ejercicio 1/);
});

test('deletion ignores stale selections and late confirmations after a day or account change', async t => {
  const day = '2026-11-12';
  const record = journalRecord(2, day);
  const attempts = [];
  const view = await journalDOM(t, {
    profile: { ...profile, user_id: 'account-a' }, record, dateStr: day,
    onUpdateRecord: (date, candidate) => new Promise(resolve => attempts.push({ date, candidate, resolve })),
  });
  dialogMethodsForDeletion();
  await requestRecordDeletion(view, 'workout');
  const otherDay = '2026-11-13';
  await view.render({ record: { ...record, dateStr: otherDay }, dateStr: otherDay });
  assert.equal(deleteDialog(), null);
  await view.render({ record, dateStr: day });
  assert.equal(document.querySelector('.record-detail-modal'), null);
  assert.equal(attempts.length, 0);
  await requestRecordDeletion(view, 'workout');
  await act(() => deleteAction().click());
  assert.equal(attempts[0].date, day);
  assert.deepEqual(attempts[0].candidate.workouts, []);
  assert.deepEqual(attempts[0].candidate.meals, record.meals);
  await view.render({ profile: { ...profile, user_id: 'account-b' } });
  await requestRecordDeletion(view, 'workout');
  await act(async () => attempts[0].resolve(true));
  assert.ok(deleteDialog(), 'A selection from the new account remains open');
  assert.equal(document.querySelector('.record-delete-notice'), null);
});

test('a record removed elsewhere cannot be deleted from a pending confirmation', async t => {
  const day = '2026-11-12';
  const record = journalRecord(2, day);
  const view = await journalDOM(t, { record, dateStr: day });
  dialogMethodsForDeletion();
  await requestRecordDeletion(view, 'workout');
  await view.render({ record: { ...record, workouts: [] } });
  assert.match(deleteDialog().querySelector('[role="status"]').textContent, /ya no está en este día/);
  assert.equal(deleteAction().disabled, true);
  await act(() => deleteAction().click());
  assert.equal(view.saves.length, 0);
  await act(() => deleteDialog().dispatchEvent(new window.Event('cancel', { cancelable: true })));
  assert.equal(deleteDialog(), null);
  assert.match(document.querySelector('.record-detail-modal [role="status"]').textContent, /ya no está en este día/);
});

for (const [kind, addLabel, draftFields, receiptLabel] of [
  ['meal', 'Agregar comida', { 'add-meal-description': 'Ensalada de prueba', 'add-meal-calories': '180' }, 'Comida guardada'],
  ['workout', 'Agregar ejercicio', { 'add-workout-activity': 'Caminata de prueba', 'add-workout-duration': '30', 'add-workout-calories': '100' }, 'Ejercicio guardado'],
]) {
  test(`starting a new ${kind} clears the deletion notice through cancellation and save`, async t => {
    const view = await journalDOM(t, { record: journalRecord(4) });
    dialogMethodsForDeletion();
    const notice = () => document.querySelector('.record-delete-notice');
    const add = () => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === addLabel);
    const deleteRecord = async () => {
      await requestRecordDeletion(view, kind);
      await act(async () => deleteAction().click());
      await view.render({ record: view.saves.at(-1).record });
      assert.ok(notice(), 'A successful deletion shows its notice');
    };

    await deleteRecord();
    await act(() => add().click());
    await act(() => document.querySelector('form.entry-form .entry-cancel').click());
    assert.equal(document.querySelector('form.entry-form'), null);
    assert.ok(!notice(), 'Canceling a new draft must not restore the deletion notice');

    await deleteRecord();
    await act(() => add().click());
    await act(() => {
      for (const [id, value] of Object.entries(draftFields)) {
        const field = document.getElementById(id);
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value').set.call(field, value);
        field.dispatchEvent(new window.Event('input', { bubbles: true }));
      }
    });
    await act(async () => document.querySelector('form.entry-form')
      .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
    await view.render({ record: view.saves.at(-1).record });
    assert.equal(document.querySelector('.meal-saved-label')?.textContent.trim(), receiptLabel);
    assert.ok(!notice(), 'A new save receipt must not share space with the deletion notice');
    assert.equal(view.saves.length, 3);
  });
}

test('a confirmed meal receipt focuses its stable row among namesakes only on request', async t => {
  const day = '2026-11-12';
  const record = journalRecord(8, day);
  for (const meal of record.meals) meal.name = 'Arroz';
  const view = await journalDOM(t, { record, dateStr: day });
  const target = view.list().querySelectorAll('[data-meal-id]')[2];
  const id = target.dataset.mealId;
  const scrolls = [];
  window.HTMLElement.prototype.scrollIntoView = function () { scrolls.push(this); };
  await act(() => target.click());
  await act(() => document.querySelector('.record-detail-edit').click());
  const form = document.querySelector('[role="dialog"] form');
  await act(() => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
  await view.render({record:view.saves.at(-1).record});
  const receipt = document.querySelector('.meal-saved');
  assert.match(receipt.textContent, /Comida guardada.*Arroz.*kcal.*12 nov 2026/);
  assert.deepEqual(scrolls, []);
  await act(() => receipt.querySelector('.meal-saved-open').click());
  assert.equal(view.list().dataset.expanded, 'true');
  assert.equal(document.activeElement.dataset.mealId, id);
  assert.equal(document.activeElement.dataset.justSaved, 'true');
  assert.deepEqual(scrolls, [target]);
  assert.equal(document.querySelector('.meal-saved'), null);
});

test('exercise receipt opens the correct typed record even with shared names and a meal ID collision', async t => {
  const day = '2026-11-12';
  const record = journalRecord(8, day);
  for (const workout of record.workouts) workout.activity = 'Caminata';
  const id = record.meals[0].id;
  record.workouts.find(workout => workout.time === '09:00').id = id;
  const view = await journalDOM(t, { record, dateStr: day });
  const target = view.list().querySelector('[data-entry-kind="workout"][data-entry-id="' + id + '"]');
  window.HTMLElement.prototype.scrollIntoView = () => {};
  await act(() => target.click());
  await act(() => document.querySelector('.record-detail-edit').click());
  await act(() => document.querySelector('form.entry-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
  await view.render({ record: view.saves.at(-1).record });
  assert.equal(view.saves.at(-1).record.workouts.length, record.workouts.length);
  assert.match(document.querySelector('.meal-saved').textContent, /Ejercicio guardado.*Caminata.*30 min.*kcal.*12 nov 2026/);
  await act(() => document.querySelector('.meal-saved-open').click());
  assert.equal(document.activeElement, target);
  assert.equal(view.list().dataset.expanded, 'false', 'A receipt inside the first four rows leaves the compact list intact');
  await act(() => target.click());
  await act(() => document.querySelector('.record-detail-edit').click());
  assert.equal(document.getElementById('edit-workout-activity').value, 'Caminata');
});
