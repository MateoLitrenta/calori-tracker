import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';


import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { formatDateStr } from '../src/utils/helpers.ts';


const source = await readFile(new URL('../src/components/DailyPanel.tsx', import.meta.url), 'utf8');
const stub = code => `data:text/javascript,${encodeURIComponent(code)}`;
const shellSource = await readFile(new URL('../src/components/EntryFormShell.tsx', import.meta.url), 'utf8');
const shellCode = ts.transpileModule(shellSource, { compilerOptions: { module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 } }).outputText
  .replace(/from ["']([^"']+)["']/g, (_, specifier) => `from ${JSON.stringify(specifier === 'react-dom'
    ? stub('export const createPortal = children => children;') : import.meta.resolve(specifier))}`);
const shellUrl = `data:text/javascript;base64,${Buffer.from(shellCode).toString('base64')}`;
globalThis.__entryServices = { estimateMeal: async () => ({}), estimateWorkout: async () => ({}), toast: { error() {} } };
const imports = {
  '../utils/helpers': new URL('../src/utils/helpers.ts', import.meta.url).href,
  '../services/aiService': stub('export const estimateMeal = (...args) => globalThis.__entryServices.estimateMeal(...args); export const estimateWorkout = (...args) => globalThis.__entryServices.estimateWorkout(...args);'),
  '../lib/supabase': stub('export const supabase = { storage: { from: () => globalThis.__entryServices.storage } };'),
  'react-hot-toast': stub('export default globalThis.__entryServices.toast;'),
  './MealPhoto': stub('export function MealPhotoPicker() { return null; } export const MealThumbnail = () => null;'),
  './EntryFormShell': shellUrl,
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
const hookUrl = stub(`
  export default {};
  export const useState = value => globalThis.__dailyHooks.useState(value);
  export const useRef = value => globalThis.__dailyHooks.useRef(value);
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
  open(view, 'Pasos/Agua');
  assert.equal(nodes(view(), element => element.type.name === 'EntryFormShell').length, 0);
  assert.match(renderToStaticMarkup(view()), /Pasos del Día/);
});

test('close and backdrop reset drafts and temporary photos; sheet contents do not dismiss it', t => {
  mobileEnvironment(t);
  const view = entryView();
  for (const method of ['close', 'backdrop']) {
    open(view, '+ Comida');
    fill(view, 'Descripción (ej: Ensalada)', 'Borrador');
    node(view(), element => element.type.name === 'MealPhotoPicker').props.onChange(new Blob(['photo']));
    const tree = sheet(view);
    if (method === 'close') node(tree, element => element.props['aria-label'] === 'Cerrar formulario').props.onClick();
    else {
      const backdrop = node(tree, element => element.props.className === 'entry-sheet-backdrop');
      backdrop.props.onClick({ target: {}, currentTarget: backdrop });
      assert.equal(field(view, 'Descripción (ej: Ensalada)').props.value, 'Borrador');
      backdrop.props.onClick({ target: backdrop, currentTarget: backdrop });
    }
    assert.equal(nodes(view(), element => element.type === 'form').length, 0);
    open(view, '+ Comida');
    assert.equal(field(view, 'Descripción (ej: Ensalada)').props.value, '');
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
  open(view, 'Pasos/Agua');
  assert.equal(nodes(view(), element => element.type === 'form').length, 0);
});

for (const [action, nameField, name, collection] of [
  ['+ Comida', 'Descripción (ej: Ensalada)', 'Ensalada', 'meals'],
  ['+ Ejercicio', 'Actividad (ej: Running)', 'Correr', 'workouts'],
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
  fill(view, 'Descripción (ej: Ensalada)', 'Ensalada');
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
  await node(view(), element => element.type === 'button' && element.props.children === 'Estimar con IA').props.onClick();
  // The UI deliberately starts this async handler without returning its promise.
  await Promise.resolve();
  assert.equal(calls[0].name, 'Ensalada');
  assert.equal(field(view, 'Kcal').props.value, 400);
  assert.match(renderToStaticMarkup(view()), /Estimado por IA/);
  assert.ok(shell(view));
});

test('editing closes the record detail and opens the same responsive shell with existing field values', t => {
  mobileEnvironment(t);
  const meal = { id: 'm1', name: 'Pizza', type: 'Cena', calories: 600, details: 'Dos porciones', time: '20:00', photo_path: 'existing.jpg' };
  const workout = { id: 'w1', activity: 'Correr', duration: 40, calories: 300, details: 'Suave', distance: 5, pace: '8:00', time: '18:00' };
  for (const [record, expected] of [[{ ...base, meals: [meal] }, 'Pizza'], [{ ...base, workouts: [workout] }, 'Correr']]) {
    const view = entryView(undefined, record);
    node(view(), element => element.type === 'li').props.onClick();
    node(view(), element => element.props.className?.includes('record-detail-edit')).props.onClick({ stopPropagation() {} });
    assert.equal(nodes(view(), element => element.props.className?.includes('record-detail-modal')).length, 0);
    assert.ok(node(sheet(view), element => element.props.role === 'dialog'));
    assert.ok(nodes(view(), element => element.type === 'input').some(input => input.props.value === expected));
    if (expected === 'Pizza') assert.equal(node(view(), element => element.type.name === 'MealPhotoPicker').props.path, 'existing.jpg');
    else for (const value of [40, 300, 5, '8:00']) assert.ok(nodes(view(), element => element.type === 'input').some(input => input.props.value === value));
  }
});

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
  fill(view, 'Actividad (ej: Running)', 'Correr');
  fill(view, 'Minutos', '30');
  await node(view(), element => element.type === 'button' && element.props.children === 'Estimar con IA').props.onClick();
  await Promise.resolve();
  assert.equal(calls[0].duration, 30);
  assert.equal(field(view, 'Kcal').props.value, 280);
  assert.ok(field(view, 'Distancia (km) opc.'));
  assert.ok(field(view, 'Ritmo (ej: 5:30) opc.'));
  assert.match(renderToStaticMarkup(view()), /Estimado por IA/);
});

test('photo upload failures keep the meal draft and image available for retry', async t => {
  mobileEnvironment(t);
  const errors = [];
  const uploads = [];
  globalThis.__entryServices.toast.error = message => errors.push(message);
  globalThis.__entryServices.storage = { upload: async (...args) => { uploads.push(args); return { error: new Error('Offline') }; }, remove: async () => ({ error: null }) };
  const view = entryView(() => { assert.fail('A failed upload must not write the record'); });
  open(view, '+ Comida');
  fill(view, 'Descripción (ej: Ensalada)', 'Almuerzo');
  fill(view, 'Kcal', '450');
  const image = new Blob(['jpeg'], { type: 'image/jpeg' });
  node(view(), element => element.type.name === 'MealPhotoPicker').props.onChange(image);
  await submit(view);
  assert.equal(uploads[0][1], image);
  assert.equal(uploads[0][2].contentType, 'image/jpeg');
  assert.equal(errors.length, 1);
  assert.equal(field(view, 'Descripción (ej: Ensalada)').props.value, 'Almuerzo');
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
  node(tree, element => element.props.ref && element.props.className === 'flex flex-col gap-4').props.ref.current = { contains: () => false };
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

