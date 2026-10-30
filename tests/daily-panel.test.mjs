import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';


import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
import { formatDateStr } from '../src/utils/helpers.ts';
import { AIRequestError } from '../src/services/aiTransport.ts';


const source = await readFile(new URL('../src/components/DailyPanel.tsx', import.meta.url), 'utf8');
const stub = code => `data:text/javascript,${encodeURIComponent(code)}`;
const shellSource = await readFile(new URL('../src/components/EntryFormShell.tsx', import.meta.url), 'utf8');
const shellCode = ts.transpileModule(shellSource, { compilerOptions: { module: ts.ModuleKind.ESNext,
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
const estimateResultCode = ts.transpileModule(estimateResultSource, { compilerOptions: { module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 } }).outputText
  .replace(/from ["']([^"']+)["']/g, (_, specifier) => `from ${JSON.stringify(import.meta.resolve(specifier))}`);
const estimateResultUrl = `data:text/javascript;base64,${Buffer.from(estimateResultCode).toString('base64')}`;
globalThis.__entryServices = { estimateMeal: async () => ({}), estimateWorkout: async () => ({}), toast: { error() {} } };
const imports = {
  '../utils/helpers': new URL('../src/utils/helpers.ts', import.meta.url).href,
  '../services/aiService': stub('export const estimateMeal = (...args) => globalThis.__entryServices.estimateMeal(...args); export const estimateWorkout = (...args) => globalThis.__entryServices.estimateWorkout(...args);'),
  '../services/aiTransport': new URL('../src/services/aiTransport.ts', import.meta.url).href,
  '../lib/supabase': stub('export const supabase = { storage: { from: () => globalThis.__entryServices.storage } };'),
  'react-hot-toast': stub('export default globalThis.__entryServices.toast;'),
  './MealPhoto': stub('export function MealPhotoPicker() { return null; } export const MealThumbnail = () => null;'),
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
    assert.equal(html.includes('daily-records--columns'), count >= 2);
    for (let index = 0; index < count; index++) {
      assert.ok(html.includes(records[index].name), 'Long descriptions must remain complete');
      assert.ok(html.includes(`+${records[index].calories} kcal`));
      if (index) assert.ok(html.indexOf(records[index - 1].name) < html.indexOf(records[index].name));
    }
    assert.ok(html.indexOf('+ Comida') < html.indexOf('Registros del día'), 'Keep the existing mobile reading order');
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
  for (const label of ['2.500', '18.500', '105', '+ Comida', '+ Ejercicio', 'Editar']) {
    assert.ok(html.includes(label));
  }
  assert.doesNotMatch(html,/Pasos\/Agua|habit-adjustments/);
  assert.match(html,/aria-label="Editar cantidad de agua"/);
  assert.match(html,/aria-label="Editar total de pasos"/);
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
const hookUrl = stub(`
  export default {};
  export const useState = value => globalThis.__dailyHooks.useState(value);
  export const useRef = value => globalThis.__dailyHooks.useRef(value);
  export const useId = () => globalThis.__dailyHooks.useRef('daily-records-test').current;
  export const useEffect = (...args) => globalThis.__dailyHooks.useEffect(...args);
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
  for (const [label, content] of [['+ Comida', 'Agregar Comida'], ['+ Ejercicio', 'Agregar Entrenamiento']]) {
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
  for (const [action, title] of [['+ Comida', 'Agregar comida'], ['+ Ejercicio', 'Agregar ejercicio']]) {
    open(view, action);
    const dialog = node(sheet(view), element => element.props.role === 'dialog');
    assert.equal(dialog.props['aria-modal'], 'true');
    assert.equal(node(dialog, element => element.props.id === dialog.props['aria-labelledby']).props.children, title);
    assert.equal(nodes(dialog, element => element.type === 'form').length, 1);
    assert.ok(node(dialog, element => element.props.className?.includes('entry-form-footer')));
  }
  shell(view).props.onClose();
  node(view(), e => e.props.title === 'Editar pasos').props.onClick();
  assert.equal(nodes(view(), element => element.type.name === 'EntryFormShell').length, 0);
  assert.ok(node(view(), element => element.type === 'input' && element.props.autoFocus));
});

test('close and backdrop reset drafts and temporary photos; sheet contents do not dismiss it', t => {
  mobileEnvironment(t);
  const view = entryView();
  for (const method of ['close', 'backdrop']) {
    open(view, '+ Comida');
    fill(view, 'Ej. pollo con arroz y verduras', 'Borrador');
    node(view(), element => element.type.name === 'MealPhotoPicker').props.onChange(new Blob(['photo']));
    const tree = sheet(view);
    if (method === 'close') node(tree, element => element.props['aria-label'] === 'Cerrar formulario').props.onClick();
    else {
      const backdrop = node(tree, element => element.props.className === 'entry-sheet-backdrop');
      backdrop.props.onClick({ target: {}, currentTarget: backdrop });
      assert.equal(field(view, 'Ej. pollo con arroz y verduras').props.value, 'Borrador');
      backdrop.props.onClick({ target: backdrop, currentTarget: backdrop });
    }
    assert.equal(nodes(view(), element => element.type === 'form').length, 0);
    open(view, '+ Comida');
    assert.equal(field(view, 'Ej. pollo con arroz y verduras').props.value, '');
    assert.equal(node(view(), element => element.type.name === 'MealPhotoPicker').props.blob, null);
    shell(view).props.onClose();
  }
});

test('desktop actions keep the same single inline forms and steps-water panel', t => {
  mobileEnvironment(t, false);
  const view = entryView();
  for (const action of ['+ Comida', '+ Ejercicio']) {
    open(view, action);
    const inline = sheet(view);
    assert.equal(inline.type, 'form');
    assert.equal(nodes(inline, element => element.props.role === 'dialog').length, 0);
  }
  shell(view).props.onClose();
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

test('upper cards retain manual totals and the former double increments without another panel',t=>{
  const timers=new Map();let next=0;
  t.mock.method(globalThis,'setTimeout',callback=>{timers.set(++next,callback);return next;});
  t.mock.method(globalThis,'clearTimeout',id=>timers.delete(id));
  const saves=[];const view=entryView(async(date,record)=>{saves.push({date,record});return true;});
  const flush=()=>{for(const [id,callback] of [...timers])if(timers.delete(id))callback();};
  for(const label of ['Sumar 500 pasos','Sumar 500 pasos','Sumar 250 ml de agua','Sumar 250 ml de agua'])
    node(view(),e=>e.props['aria-label']===label).props.onClick();
  flush();
  assert.equal(saves.length,1);
  assert.equal(saves.at(-1).record.steps,1000);assert.equal(saves.at(-1).record.water,500);
  for(const [title,value,field] of [['Editar pasos','25000','steps'],['Editar cantidad','3000','water']]) {
    node(view(),e=>e.props.title===title).props.onClick();
    const input=node(view(),e=>e.type==='input'&&e.props.autoFocus);
    input.props.onChange({target:{value}});
    node(view(),e=>e.type==='input'&&e.props.autoFocus).props.onBlur();
    flush();
    assert.equal(saves.at(-1).record[field],Number(value));
  }
});

for (const [action, nameField, name, collection] of [
  ['+ Comida', 'Ej. pollo con arroz y verduras', 'Ensalada', 'meals'],
  ['+ Ejercicio', 'Ej. running, fútbol, gimnasio', 'Correr', 'workouts'],
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
  open(view, '+ Comida');
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
  assert.ok(shell(view));
});

test('editing closes the record detail and opens the same responsive shell with existing field values', t => {
  mobileEnvironment(t);
  const meal = { id: 'm1', name: 'Pizza', type: 'Cena', calories: 600, details: 'Dos porciones', time: '20:00', photo_path: 'existing.jpg' };
  const workout = { id: 'w1', activity: 'Correr', duration: 40, calories: 300, details: 'Suave', distance: 5, pace: '8:00', time: '18:00' };
  for (const [record, expected] of [[{ ...base, meals: [meal] }, 'Pizza'], [{ ...base, workouts: [workout] }, 'Correr']]) {
    const view = entryView(undefined, record);
    node(view(), element => element.props.className?.split(' ').includes('daily-record-open')).props.onClick();
    node(view(), element => element.props.className?.includes('record-detail-edit')).props.onClick({ stopPropagation() {} });
    assert.equal(nodes(view(), element => element.props.className?.includes('record-detail-modal')).length, 0);
    assert.ok(node(sheet(view), element => element.props.role === 'dialog'));
    assert.ok(nodes(view(), element => element.props.value === expected).length);
    if (expected === 'Pizza') assert.equal(node(view(), element => element.type.name === 'MealPhotoPicker').props.path, 'existing.jpg');
    else for (const value of [40, 300, 5, '8:00']) assert.ok(nodes(view(), element => element.type === 'input').some(input => input.props.value === value));
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
      node(view(), e => e.props.className?.split(' ').includes('daily-record-open')).props.onClick();
      node(view(), e => e.props.className?.includes('record-detail-edit')).props.onClick({ stopPropagation() {} });
      return view;
    };
    const view = entryView(persist);
    open(view, kind === 'meal' ? '+ Comida' : '+ Ejercicio');
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
    querySelector: () => main, querySelectorAll: () => [main, nav],
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
  assert.equal(dialog.style['--entry-keyboard-offset'], '394px');
  assert.equal(dialog.style['--entry-viewport-height'], '450px');
  assert.equal(content.scrollTop, 62);
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
  open(view, '+ Ejercicio');
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
  assert.ok(field(view, 'Distancia (km) opc.'));
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
      open(view, meal ? '+ Comida' : '+ Ejercicio');
      fill(view, description, name);
      const image = new Blob(['synthetic image'], { type: 'image/jpeg' });
      if (meal) node(view(), element => element.type.name === 'MealPhotoPicker').props.onChange(image);
      else fill(view, 'Minutos', '30');
      const before = requests.length;
      node(view(), element => element.type === 'button' && element.props.children?.includes?.('Estimar con IA')).props.onClick();
      await new Promise(setImmediate);
      assert.equal(requests.length, before + 1);
      if (error instanceof AIRequestError) assert.equal(errors.at(-1), error.message);
      else assert.ok(!errors.at(-1).includes('private_provider_detail'));
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

test('photo upload failures keep the meal draft and image available for retry', async t => {
  mobileEnvironment(t);
  const errors = [];
  const uploads = [];
  globalThis.__entryServices.toast.error = message => errors.push(message);
  globalThis.__entryServices.storage = { upload: async (...args) => { uploads.push(args); return { error: new Error('Offline') }; }, remove: async () => ({ error: null }) };
  const view = entryView(() => { assert.fail('A failed upload must not write the record'); });
  open(view, '+ Comida');
  fill(view, 'Ej. pollo con arroz y verduras', 'Almuerzo');
  fill(view, 'Kcal', '450');
  const image = new Blob(['jpeg'], { type: 'image/jpeg' });
  node(view(), element => element.type.name === 'MealPhotoPicker').props.onChange(image);
  await submit(view);
  assert.equal(uploads[0][1], image);
  assert.equal(uploads[0][2].contentType, 'image/jpeg');
  assert.equal(errors.length, 1);
  assert.equal(field(view, 'Ej. pollo con arroz y verduras').props.value, 'Almuerzo');
  assert.equal(node(view(), element => element.type.name === 'MealPhotoPicker').props.blob, image);
  assert.ok(shell(view));
});

test('global outside-click behavior leaves mobile sheets to their backdrop and still closes desktop inline forms', t => {
  mobileEnvironment(t);
  const handlers = new Map();
  globalThis.document.contains = () => true;
  globalThis.document.addEventListener = (type, handler) => handlers.set(type, handler);
  globalThis.document.removeEventListener = type => handlers.delete(type);
  globalThis.window.matchMedia = () => ({ matches: true });
  const view = mount({ profile, record: base, dateStr, records: {}, onUpdateRecord: async () => true }, InteractiveDailyPanel, true);
  let tree = view();
  node(tree, element => element.props.ref && element.props.className?.split(' ').includes('daily-entry')).props.ref.current = { contains: () => false };
  view.flushEffects();
  open(view, '+ Comida');
  tree = view();
  view.flushEffects();
  const event = { target: { closest: () => null } };
  handlers.get('click')(event);
  assert.ok(shell(view));
  globalThis.window.matchMedia = () => ({ matches: false });
  handlers.get('click')(event);
  assert.equal(nodes(view(), element => element.type === 'form').length, 0);
  view.unmount();
});


test('all four entry modes associate labels, retain mobile CTAs and use accessible time actions', t => {
  mobileEnvironment(t);
  const meal = { id: 'm1', name: 'Pizza', type: 'Cena', calories: 600, details: 'Dos porciones', time: '20:00' };
  const workout = { id: 'w1', activity: 'Correr', duration: 40, calories: 300, details: 'Suave', distance: 5, pace: '8:00', time: '18:00' };
  for (const [action, record, title, cta] of [
    ['+ Comida', base, 'Agregar comida', 'Guardar comida'],
    ['+ Ejercicio', base, 'Agregar ejercicio', 'Guardar ejercicio'],
    [null, { ...base, meals: [meal] }, 'Editar comida', 'Guardar cambios'],
    [null, { ...base, workouts: [workout] }, 'Editar ejercicio', 'Guardar cambios'],
  ]) {
    const view = entryView(undefined, record);
    if (action) open(view, action);
    else {
      node(view(), e => e.props.className?.split(' ').includes('daily-record-open')).props.onClick();
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
    assert.ok(node(form, e => e.props['aria-label'] === 'Usar hora actual'));
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
  open(view, '+ Ejercicio');
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
  return { saves, render, get props() { return props; },
    list: () => document.querySelector('.daily-records'),
    toggle: () => document.querySelector('.daily-records-toggle'),
    resize: async value => act(() => { mobile = value; mediaListeners.forEach(handler => handler()); window.dispatchEvent(new window.Event('resize')); }),
  };
}

test('journal disclosure keeps complete mixed chronological records and accessible controls at 0/1/2/3/4/5/8 entries', async t => {
  const view = await journalDOM(t);
  for (const count of [0, 1, 2, 3, 4, 5, 8]) {
    const record = journalRecord(count);
    const snapshot = structuredClone(record);
    await view.render({ record });
    const list = view.list();
    assert.equal(list.children.length, count);
    assert.equal(list.dataset.expanded, 'false');
    assert.equal(list.classList.contains('daily-records--columns'), count >= 2);
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
    'Desktop disclosure must not set attributes or inline styles that also hide mobile records');
  await view.resize(false);
  assert.equal(view.list().dataset.expanded, 'true');
  const add = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === '+ Comida');
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
  const add = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === '+ Comida');
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
  assert.match(empty, /Balance provisional/);
  assert.match(empty, /Sin comidas registradas/);
  assert.match(empty, /-1\.618 kcal/);
  assert.doesNotMatch(empty, /Déficit Alto/);
  const activityOnly = render({ ...base, steps: 7000 });
  assert.match(activityOnly, /Balance provisional/);
  assert.match(activityOnly, /-1\.898 kcal/);
  const recorded = render({ ...base, meals: [{ id: 'meal', name: 'Comida', calories: 400, type: 'Almuerzo', time: '12:00' }] });
  assert.match(recorded, /Balance energético/);
  assert.match(recorded, /-1\.218 kcal/);
  assert.doesNotMatch(recorded, /Balance provisional/);
  assert.equal(base.meals.length, 0);
});

test('workout deletion reports success only after persistence confirms it', async t => {
  const successes = [], errors = [];
  const toast = globalThis.__entryServices.toast;
  const oldSuccess = toast.success, oldError = toast.error;
  toast.success = message => successes.push(message); toast.error = message => errors.push(message);
  t.after(() => { toast.success = oldSuccess; toast.error = oldError; });
  for (const outcome of [false, true, 'reject']) {
    let resolve;
    const gate = new Promise(done => { resolve = done; });
    const view = mount({ profile, record: { ...base, workouts: [{ id: 'delete-test', activity: 'Correr', duration: 30, calories: 300 }] }, dateStr, records: {},
      onUpdateRecord: async () => { await gate; if (outcome === 'reject') throw Error('offline'); return outcome; } });
    node(view(), e => e.props.className === 'daily-record-open').props.onClick();
    node(view(), e => e.type === 'button' && e.props.children?.some?.(part => typeof part === 'string' && part.includes('Eliminar'))).props.onClick({ stopPropagation() {} });
    const count = successes.length;
    assert.equal(count, outcome === false ? 0 : outcome === true ? 0 : 1);
    resolve(); await new Promise(setImmediate);
    assert.equal(successes.length, count + (outcome === true ? 1 : 0));
  }
  assert.equal(errors.length, 1);
});
