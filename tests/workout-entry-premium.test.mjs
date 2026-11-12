import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
import { formatDateStr } from '../src/utils/helpers.ts';
import { AIRequestError } from '../src/services/aiTransport.ts';

// Compile actual UI components, replacing only remote boundaries. JSDOM does not
// prove textarea geometry or native mobile keyboards; those need browser checks.
const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const modules = new Map();
const boundaries = {
  'lib/supabase.ts': 'export const supabase = { storage: { from: () => globalThis.__workoutEntryServices.storage } };',
  'services/aiService.ts': 'export const estimateMeal = (...args) => globalThis.__workoutEntryServices.meal(...args); export const estimateWorkout = (...args) => globalThis.__workoutEntryServices.workout(...args);',
  'components/MealPhoto.tsx': 'export const MealPhotoPicker = props => { globalThis.__workoutEntryServices.photoProps = props; return null; }; export const MealThumbnail = () => null;',
};
async function compile(file) {
  if (modules.has(file)) return modules.get(file);
  const relative = path.relative(sourceRoot, file).replaceAll('\\', '/');
  if (relative === 'services/aiTransport.ts') return new URL('../src/services/aiTransport.ts', import.meta.url).href;
  if (boundaries[relative]) return moduleUrl(boundaries[relative]);
  const source = (await readFile(file, 'utf8')).replace(/import ['"][^'"]+\.css['"];?/g, '')
    .replace(/import\s+\{([^}]+)\}\s+from ['"]@phosphor-icons\/react['"];?/g, (_, names) =>
      names.split(',').map(name => 'const ' + name.trim() + ' = () => null;').join('\n'));
  let code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 } }).outputText;
  const specifiers = new Set([...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]));
  for (const specifier of specifiers) {
    let target;
    if (specifier === 'react-hot-toast') target = moduleUrl('const toast = (...args) => globalThis.__workoutEntryServices.toast(...args); toast.error = (...args) => globalThis.__workoutEntryServices.error(...args); toast.success = (...args) => globalThis.__workoutEntryServices.success(...args); export default toast;');
    else if (specifier.startsWith('.')) {
      let dependency = path.resolve(path.dirname(file), specifier);
      if (!path.extname(dependency)) {
        try { await readFile(dependency + '.ts'); dependency += '.ts'; } catch { dependency += '.tsx'; }
      }
      target = await compile(dependency);
    } else target = import.meta.resolve(specifier);
    code = code.replaceAll("'" + specifier + "'", JSON.stringify(target)).replaceAll('"' + specifier + '"', JSON.stringify(target));
  }
  const result = moduleUrl(code); modules.set(file, result); return result;
}
const { default: DailyPanel } = await import(await compile(path.join(sourceRoot, 'components/DailyPanel.tsx')));
const dateStr = formatDateStr(new Date());
const profile = { id: 'local-fixture', user_id: 'local-user', name: 'Fixture', age: 30,
  sex: 'Masculino', weight: 70, height: 170, goal: 'Mantenimiento', activity: 'Moderado' };
const emptyRecord = () => ({ dateStr, date: new Date(dateStr + 'T12:00:00'), meals: [], workouts: [], steps: 7000, water: 1500, weight: 70 });
const categories = ['Gimnasio', 'Fútbol', 'Correr', 'Natación', 'Caminata'];
const longActivity = 'Hoy jugué un partido de fútbol 8 durante aproximadamente 50 minutos, con una intensidad media-alta, realizando varios sprints y cambios de ritmo.';
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };

async function mount(t, options = {}) {
  const dom = new JSDOM('<main class="app-main"><div class="home-variants" id="root"></div></main>', { pretendToBeVisual: true });
  const previous = {};
  for (const name of ['window', 'document', 'HTMLElement', 'getComputedStyle', 'IS_REACT_ACT_ENVIRONMENT', '__workoutEntryServices']) previous[name] = globalThis[name];
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement; globalThis.getComputedStyle = dom.window.getComputedStyle;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = () => ({ matches: !!options.mobile, addEventListener() {}, removeEventListener() {} });
  // Scroll geometry is intentionally not simulated in this integration suite.
  const errors = [], toasts = [], successes = [], requests = [], saves = [];
  globalThis.__workoutEntryServices = {
    storage: options.storage ?? { upload: async () => ({ error: null }), remove: async () => ({ error: null }) },
    toast: (...args) => toasts.push(args), error: message => errors.push(message), success: (...args) => successes.push(args),
    meal: async input => { requests.push({ kind: 'meal', input }); return options.estimateMeal ? options.estimateMeal(input) : { calories: 400, description: 'Comida', assumptions: [] }; },
    workout: async input => { requests.push({ kind: 'workout', input }); return options.estimateWorkout ? options.estimateWorkout(input) : { calories: 485, assumptions: [] }; },
  };
  let record = structuredClone(options.record || emptyRecord());
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  let refresh;
  function App() {
    const [current, setCurrent] = React.useState(record);
    const [user, setUser] = React.useState({ ...profile, ...options.profile });
    React.useEffect(() => {
      refresh = (next, generation = user.recordGeneration) => { record = next; setCurrent(next); setUser(previous => ({ ...previous, recordGeneration: generation })); };
    }, [user.recordGeneration]);
    return React.createElement(DailyPanel, { profile: user, dateStr, record: current, records: { [dateStr]: current },
      onUpdateRecord: async (date, next) => {
        saves.push({ date, record: structuredClone(next) });
        const success = options.save ? await options.save(date, next) : true;
        if (success) { record = next; setCurrent(next); }
        return success;
      } });
  }
  await act(() => root.render(React.createElement(App)));
  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true; await act(() => root.unmount()); dom.window.close();
    for (const [name, value] of Object.entries(previous)) globalThis[name] = value;
  };
  t.after(dispose);
  const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
  const fill = async (id, value, inputType = 'insertText') => {
    const field = document.getElementById(id); assert.ok(field, `Missing ${id}`);
    const prototype = field.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
      : field.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    await act(() => { Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
      field.dispatchEvent(field.tagName === 'SELECT' ? new window.Event('change', { bubbles: true })
        : new window.InputEvent('input', { bubbles: true, inputType })); });
    return field;
  };
  const click = async node => { assert.ok(node, 'Missing button'); await act(async () => { node.click(); await new Promise(setImmediate); }); };
  const submit = async () => act(async () => {
    document.querySelector('form.entry-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(setImmediate);
  });
  const edit = async () => {
    const activity = record.workouts[0]?.activity;
    await click([...document.querySelectorAll('.daily-record-open')].find(node => node.textContent.includes(activity)));
    await click(document.querySelector('.record-detail-edit'));
  };
  return { button, fill, click, submit, edit, dispose, requests, saves, errors, toasts, successes, record: () => record,
    open: () => click(button('+ Ejercicio')),
    openMeal: () => click(button('+ Comida')),
    choosePhoto: blob => act(() => globalThis.__workoutEntryServices.photoProps.onChange(blob)),
    removePhoto: () => act(() => globalThis.__workoutEntryServices.photoProps.onRemove()),
    editMeal: async () => { await click([...document.querySelectorAll('.daily-record-open')].find(node => node.textContent.includes(record.meals[0]?.name))); await click(document.querySelector('.record-detail-edit')); },
    refresh: (next, generation) => act(() => refresh(next, generation)),
    estimate: () => click([...document.querySelectorAll('button')].find(node => node.textContent.includes('Estimar con IA'))),
    settle: callback => act(async () => { callback(); await new Promise(setImmediate); }) };
}

test('failed meal/workout saves keep long drafts and reuse their original entry IDs on explicit retry', async t => {
  for (const kind of ['meal', 'workout']) {
    let attempts = 0;
    const view = await mount(t, { save: () => ++attempts > 1 });
    const description = ('Texto largo sin perder el contenido\n' + 'sinEspacios'.repeat(40) + '\n').repeat(30);
    if (kind === 'meal') {
      await view.openMeal(); await view.fill('add-meal-description', description); await view.fill('add-meal-calories', '400'); await view.fill('add-meal-notes', description);
    } else {
      await view.open(); await view.fill('add-workout-activity', description); await view.fill('add-workout-duration', '30'); await view.fill('add-workout-calories', '200'); await view.fill('add-workout-notes', description);
    }
    await view.submit();
    assert.equal(document.getElementById(kind === 'meal' ? 'add-meal-description' : 'add-workout-activity').value, description);
    assert.equal(view.record()[kind === 'meal' ? 'meals' : 'workouts'].length, 0);
    await view.submit();
    const key = kind === 'meal' ? 'meals' : 'workouts';
    assert.equal(view.saves.length, 2); assert.equal(view.saves[0].record[key][0].id, view.saves[1].record[key][0].id);
    assert.equal(view.record()[key].length, 1); assert.equal(view.record()[key][0].details, description);
    assert.equal(document.querySelector('form.entry-form'), null);
    await view.dispose();
  }
});

test('an ambiguous meal DB response retains the uploaded object and reuses its exact path/blob on retry', async t => {
  const uploads = [], removals = []; let attempts = 0;
  const view = await mount(t, { save: () => ++attempts > 1, storage: {
    upload: async (...args) => { uploads.push(args); return { error: null }; },
    remove: async paths => { removals.push(paths); return { error: null }; },
  } });
  const photo = new Blob(['synthetic JPEG bytes'], { type: 'image/jpeg' });
  await view.openMeal(); await view.fill('add-meal-description', 'Comida con\nnotas largas'); await view.fill('add-meal-calories', '400'); await view.choosePhoto(photo);
  await view.submit(); assert.equal(uploads.length, 1); assert.equal(removals.length, 0);
  assert.equal(document.getElementById('add-meal-description').value, 'Comida con\nnotas largas');
  await view.submit(); assert.equal(uploads.length, 1); assert.equal(uploads[0][1], photo);
  assert.deepEqual(uploads[0][2], { contentType: 'image/jpeg' });
  assert.equal(view.saves[0].record.meals[0].photo_path, view.saves[1].record.meals[0].photo_path);
  assert.equal(view.saves[0].record.meals[0].id, view.saves[1].record.meals[0].id); assert.equal(removals.length, 0);
});

test('upload failure makes no DB write, and explicit retry confirms a previously uploaded object without overwriting it', async t => {
  const uploads = [], removals = []; const photo = new Blob(['original synthetic photo']);
  const view = await mount(t, { storage: {
    upload: async (...args) => { uploads.push(args); return { error: new Error(uploads.length === 1 ? 'Lost response' : 'Already exists') }; },
    download: async () => ({ data: photo, error: null }), remove: async paths => { removals.push(paths); return { error: null }; },
  } });
  await view.openMeal(); await view.fill('add-meal-description', 'Borrador conservado'); await view.fill('add-meal-calories', '400'); await view.choosePhoto(photo);
  await view.submit(); assert.equal(view.saves.length, 0); assert.equal(document.getElementById('add-meal-description').value, 'Borrador conservado');
  await view.submit(); assert.equal(view.saves.length, 1); assert.equal(uploads.length, 2); assert.equal(uploads[0][0], uploads[1][0]); assert.equal(removals.length, 0);
});

test('replacing a shared meal photo preserves its other reference and leaves Storage cleanup pending', async t => {
  const shared = 'local-user/shared.jpg', removals = [];
  const first = { id: 'first', name: 'Comida editada', type: 'Almuerzo', calories: 400, time: '12:00', photo_path: shared };
  const second = { ...first, id: 'second', name: 'Otra comida' };
  const view = await mount(t, { record: { ...emptyRecord(), meals: [first, second] }, storage: {
    upload: async () => ({ error: null }), remove: async paths => { removals.push(paths); return { error: null }; },
  } });
  await view.editMeal(); await view.removePhoto(); await view.fill('edit-meal-notes', 'Notas editadas\nque se conservan'); await view.submit();
  assert.equal(view.record().meals[0].id, first.id); assert.equal(view.record().meals[0].photo_path, null);
  assert.equal(view.record().meals[1].photo_path, shared); assert.equal(removals.length, 0);
  assert.ok(view.toasts.some(args => String(args[0]).includes('limpieza de la foto anterior queda pendiente')));
});

test('a refreshed conflict keeps the draft frozen until explicit review, then rebases only that entry', async t => {
  let attempts = 0; const initial = { ...emptyRecord(), version: '1', generation: 'generation-one' };
  const view = await mount(t, { record: initial, profile: { recordGeneration: 'generation-one' }, save: () => ++attempts > 1 });
  await view.openMeal(); await view.fill('add-meal-description', 'Borrador\npendiente'); await view.fill('add-meal-calories', '400'); await view.submit();
  const id = view.saves[0].record.meals[0].id;
  const remote = { id: 'remote-meal', name: 'Registrado en otro dispositivo', type: 'Cena', calories: 300 };
  await view.refresh({ ...initial, version: '2', meals: [remote] });
  let prompts = 0; window.confirm = () => { prompts++; return false; };
  await view.submit(); assert.equal(view.saves.length, 1); assert.equal(document.getElementById('add-meal-description').value, 'Borrador\npendiente');
  window.confirm = () => { prompts++; return true; };
  await view.submit(); assert.equal(prompts, 2); assert.equal(view.saves.length, 2);
  assert.equal(view.saves[0].record.version, '1'); assert.equal(view.saves[1].record.version, '2');
  assert.equal(view.record().meals.length, 2); assert.deepEqual(view.record().meals[0], remote); assert.equal(view.record().meals[1].id, id);
});

test('reviewing a recovered committed entry replaces its stable ID instead of appending a duplicate', async t => {
  let attempts = 0; const initial = { ...emptyRecord(), version: '1', generation: 'generation-one' };
  const view = await mount(t, { record: initial, profile: { recordGeneration: 'generation-one' }, save: () => ++attempts > 1 });
  await view.open(); await view.fill('add-workout-activity', longActivity); await view.fill('add-workout-duration', '30'); await view.fill('add-workout-calories', '200'); await view.submit();
  const recovered = view.saves[0].record.workouts[0];
  await view.refresh({ ...initial, version: '2', workouts: [recovered] }); window.confirm = () => true;
  await view.submit(); assert.equal(view.record().workouts.length, 1); assert.equal(view.record().workouts[0].id, recovered.id);
});

test('a deleted edit target stays a draft after conflict review instead of being recreated', async t => {
  const meal = { id: 'deleted-meal', name: 'Antes de editar', type: 'Cena', calories: 400 };
  const initial = { ...emptyRecord(), meals: [meal], version: '1', generation: 'generation-one' };
  const view = await mount(t, { record: initial, profile: { recordGeneration: 'generation-one' } });
  await view.editMeal(); await view.fill('edit-meal-description', 'Edición pendiente');
  await view.refresh({ ...initial, version: '2', meals: [] }); window.confirm = () => true;
  await view.submit(); assert.equal(view.saves.length, 0); assert.equal(document.getElementById('edit-meal-description').value, 'Edición pendiente');
  assert.ok(view.errors.some(message => message.includes('ya no está')));
});

test('weight save keeps the modal and entered value until persistence returns true', async t => {
  const pending = deferred(); let attempts = 0;
  const view = await mount(t, { save: () => ++attempts === 1 ? pending.promise : true });
  await view.click(document.querySelector('[title="Registrar peso"]'));
  const input = document.querySelector('input[inputmode="decimal"]'); assert.ok(input);
  await act(() => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '73.5'); input.dispatchEvent(new window.InputEvent('input', { bubbles: true })); });
  const save = () => [...document.querySelectorAll('button')].find(button => button.className.includes('bg-pink-600') && button.textContent.includes('Guardar'));
  await view.click(save()); assert.equal(input.isConnected, true); assert.equal(input.value, '73.5');
  await view.settle(() => pending.resolve(false)); assert.equal(input.isConnected, true); assert.equal(input.value, '73.5'); assert.equal(view.record().weight, 70);
  await view.click(save()); assert.equal(document.querySelector('input[inputmode="decimal"]'), null); assert.equal(view.record().weight, 73.5);
});

test('Enter in weight retains a failed draft and requires review before saving it over refreshed data', async t => {
  let attempts = 0; const initial = { ...emptyRecord(), version: '1', generation: 'generation-one' };
  const view = await mount(t, { record: initial, profile: { recordGeneration: 'generation-one' }, save: () => ++attempts > 1 });
  await view.click(document.querySelector('[title="Registrar peso"]'));
  const input = document.querySelector('input[inputmode="decimal"]');
  await act(() => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '73.5'); input.dispatchEvent(new window.InputEvent('input', { bubbles: true })); });
  const enter = () => act(async () => { input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await new Promise(setImmediate); });
  await enter(); assert.equal(input.isConnected, true); assert.equal(input.value, '73.5');
  await view.refresh({ ...initial, version: '2', weight: 71, water: 999 }); window.confirm = () => false;
  await enter(); assert.equal(view.saves.length, 1); assert.equal(input.value, '73.5');
  window.confirm = () => true; await enter(); assert.equal(view.saves.length, 2); assert.equal(view.record().weight, 73.5); assert.equal(view.record().water, 999); assert.equal(view.saves[1].record.version, '2'); assert.equal(input.isConnected, false);
});

for (const kind of ['water', 'steps']) test(`${kind} conflict refresh retains the dirty value and retries only after explicit accepted review`, async t => {
  let attempts = 0; const initial = { ...emptyRecord(), version: '1', generation: 'generation-one' };
  const view = await mount(t, { record: initial, profile: { recordGeneration: 'generation-one' }, save: () => ++attempts > 1 });
  const waitForSave = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 450)); });
  const addLabel = kind === 'water' ? 'Sumar 250 ml de agua' : 'Sumar 500 pasos';
  const editLabel = kind === 'water' ? 'Editar cantidad de agua' : 'Editar total de pasos';
  const desired = kind === 'water' ? 1750 : 7500;
  const editor = () => document.querySelector(`[aria-label="${editLabel}"]`);
  await view.click(document.querySelector(`[aria-label="${addLabel}"]`)); await waitForSave();
  assert.equal(view.saves.length, 1);
  const fresh = { ...initial, water: 999, steps: 8000, version: '2', generation: 'generation-two' };
  await view.refresh(fresh, 'generation-two');
  assert.equal(editor().textContent.trim(), desired.toLocaleString('es-AR'));
  let prompts = 0, reviewText = ''; window.confirm = text => { prompts++; reviewText = text; return false; };
  await view.click(editor());
  let input = document.querySelector('.daily-habits input'); assert.equal(input.value, String(desired));
  await act(async () => { input.blur(); await new Promise(setImmediate); }); await waitForSave();
  assert.equal(prompts, 1); assert.equal(view.saves.length, 1); assert.equal(editor().textContent.trim(), desired.toLocaleString('es-AR'));
  assert.ok(reviewText.includes(fresh[kind === 'water' ? 'water' : 'steps'].toLocaleString('es-AR'))); assert.ok(reviewText.includes(desired.toLocaleString('es-AR'))); assert.match(reviewText, /propone el total/);
  window.confirm = () => { prompts++; return true; };
  await view.click(editor()); input = document.querySelector('.daily-habits input'); assert.equal(input.value, String(desired));
  await act(async () => { input.blur(); await new Promise(setImmediate); }); await waitForSave();
  assert.equal(prompts, 2); assert.equal(view.saves.length, 2);
  assert.equal(view.saves[1].record.version, '2'); assert.equal(view.saves[1].record.generation, 'generation-two');
  assert.equal(view.record()[kind === 'water' ? 'water' : 'steps'], desired);
  assert.equal(view.record()[kind === 'water' ? 'steps' : 'water'], fresh[kind === 'water' ? 'steps' : 'water']);
  await view.refresh({ ...fresh, water: 2222, steps: 10000, version: '3', generation: 'generation-three' }, 'generation-three');
  assert.equal(editor().textContent.trim(), (kind === 'water' ? 2222 : 10000).toLocaleString('es-AR'), 'only a confirmed save releases the dirty draft for canonical refreshes');
});

test('add workout uses the shared multiline textarea, preserves long activity/notes, saves once and reopens for editing', async t => {
  const view = await mount(t, { mobile: true });
  await view.open();
  const field = document.getElementById('add-workout-activity');
  assert.equal(field.tagName, 'TEXTAREA'); assert.equal(field.rows, 1); assert.equal(field.wrap, 'soft'); assert.equal(field.required, true);
  assert.equal(field.style.overflowY, 'hidden'); assert.equal(field.style.maxHeight, 'none'); assert.equal(field.style.overflowWrap, 'anywhere');
  field.focus();
  for (const lines of [7, 16, 31]) {
    const content = Array.from({ length: lines }, (_, index) => `${index}: ${longActivity} 🏃`).join('\n');
    await view.fill('add-workout-activity', content, 'insertFromPaste');
    assert.equal(field.value, content); assert.equal(document.activeElement, field);
    assert.equal(field.selectionStart, content.length); assert.equal(field.selectionEnd, content.length);
  }
  const content = `${longActivity}\n\nSegundo párrafo con detalles y una palabra ${'sinEspacios'.repeat(40)}.`;
  await view.fill('add-workout-activity', content);
  const enter = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  assert.equal(field.dispatchEvent(enter), true, 'Enter keeps multiline editing');
  await view.fill('add-workout-duration', '50'); await view.fill('add-workout-calories', '485');
  await view.fill('add-workout-notes', 'Primera nota\nSegunda nota\n日本語');
  await view.fill('add-workout-time', '18:30');
  await view.submit();
  assert.equal(view.saves.length, 1); assert.equal(view.record().workouts.length, 1);
  const saved = view.record().workouts[0];
  assert.equal(saved.activity, content); assert.equal(saved.details, 'Primera nota\nSegunda nota\n日本語');
  assert.equal(saved.duration, 50); assert.equal(saved.calories, 485); assert.equal(saved.time, '18:30');
  assert.equal(document.querySelector('.entry-form'), null);
  await view.edit();
  const edit = document.getElementById('edit-workout-activity');
  assert.equal(edit.tagName, 'TEXTAREA'); assert.equal(edit.value, content);
  await view.fill('edit-workout-activity', 'Corto'); assert.equal(edit.value, 'Corto');
  await view.submit();
  assert.equal(view.saves.length, 2); assert.equal(view.record().workouts.length, 1);
  assert.equal(view.record().workouts[0].id, saved.id); assert.equal(view.record().workouts[0].activity, 'Corto');
});

test('editing unknown legacy activity keeps exact saved data and existing distance/pace without inventing a category', async t => {
  const legacy = { id: 'legacy', activity: `  Entrenamiento personal\n${longActivity}  `,
    duration: 50, calories: 480, details: 'Rutina anterior\nSin cambios', distance: 7.25, pace: '6:54',
    time: '17:15', muscles: ['Piernas'], equipment: 'Conservar campo legado' };
  const record = { ...emptyRecord(), workouts: [legacy], meals: [{ id: 'meal', name: 'Comida intacta', type: 'Cena', calories: 600, details: 'Nota' }] };
  const view = await mount(t, { record });
  await view.edit();
  assert.equal(document.getElementById('edit-workout-activity').value, legacy.activity);
  assert.equal(document.getElementById('edit-workout-notes').value, legacy.details);
  assert.equal(document.getElementById('edit-workout-distance').value, '7.25');
  assert.equal(document.getElementById('edit-workout-pace').value, '6:54');
  assert.equal(document.querySelectorAll('.entry-activity-chips [aria-pressed="true"]').length, 0);
  assert.equal(view.saves.length, 0, 'Opening edit must not silently save or normalize activity');
  await view.submit();
  assert.equal(view.saves.length, 1); assert.deepEqual(view.record().workouts, [legacy]);
  assert.deepEqual(view.record().meals, record.meals);
  assert.equal(view.record().water, record.water); assert.equal(view.record().steps, record.steps);
});

test('all quick categories survive free descriptions; switching categories preserves user text and existing values', async t => {
  const view = await mount(t);
  await view.open();
  await view.click(view.button('Gimnasio'));
  assert.equal(document.getElementById('add-workout-activity').value, 'Gimnasio');
  await view.click(view.button('Correr'));
  assert.equal(document.getElementById('add-workout-activity').value, 'Correr', 'Untouched quick labels remain convenient to switch');
  const description = `Entrenamiento libre\n${longActivity}`;
  await view.fill('add-workout-activity', description);
  await view.fill('add-workout-duration', '50'); await view.fill('add-workout-calories', '475');
  await view.fill('add-workout-notes', 'Notas que no se pierden');
  for (const category of categories) {
    await view.click(view.button(category));
    assert.equal(document.getElementById('add-workout-activity').value, description);
    assert.equal(view.button(category).getAttribute('aria-pressed'), 'true');
    assert.equal(document.querySelectorAll('.entry-activity-chips [aria-pressed="true"]').length, 1);
    assert.equal(document.getElementById('add-workout-duration').value, '50');
    assert.equal(document.getElementById('add-workout-calories').value, '475');
    assert.equal(document.getElementById('add-workout-notes').value, 'Notas que no se pierden');
    assert.equal(!!document.getElementById('add-workout-distance'), ['Correr', 'Natación', 'Caminata'].includes(category));
    assert.equal(!!document.getElementById('add-workout-pace'), ['Correr', 'Natación', 'Caminata'].includes(category));
    const label = document.querySelector('[for="add-workout-notes"]').textContent;
    assert.equal(label.includes('Detalle de la rutina'), category === 'Gimnasio');
  }
  await view.submit();
  const saved = view.record().workouts[0];
  assert.equal(saved.activity, description); assert.equal(Object.hasOwn(saved, 'category'), false);
});

test('exact legacy categories initialize editing without rewriting activity; edited descriptions keep selected category', async t => {
  for (const category of categories) {
    const view = await mount(t, { record: { ...emptyRecord(), workouts: [{ id: 'w', activity: category,
      calories: 300, duration: 40, muscles: [], time: '16:00' }] } });
    await view.edit();
    assert.equal(view.button(category).getAttribute('aria-pressed'), 'true');
    await view.fill('edit-workout-activity', `${category}\nDetalles de mi entrenamiento`);
    assert.equal(view.button(category).getAttribute('aria-pressed'), 'true');
    if (['Correr', 'Natación', 'Caminata'].includes(category)) {
      assert.ok(document.getElementById('edit-workout-distance')); assert.ok(document.getElementById('edit-workout-pace'));
    }
    await view.click(document.querySelector('[aria-label="Cerrar formulario"]'));
    assert.equal(view.saves.length, 0);
    await view.dispose();
  }
});

test('workout estimate renders original long assumptions in expandable secondary content without a success toast or saving', async t => {
  const assumption = `Assumed a moderate-to-vigorous MET value based on the supplied duration. ${'Original explanation without translation. '.repeat(60)} <script>not executable</script>`;
  const view = await mount(t, { estimateWorkout: async () => ({ calories: 485, assumptions: [assumption] }) });
  await view.open(); await view.click(view.button('Fútbol'));
  await view.fill('add-workout-activity', longActivity); await view.fill('add-workout-duration', '50');
  await view.fill('add-workout-notes', 'Cancha de 8\nVarios cambios de ritmo');
  await view.estimate();
  assert.equal(view.requests.length, 1); assert.equal(view.saves.length, 0); assert.equal(view.toasts.length, 0);
  const request = view.requests[0].input;
  assert.equal(request.activity, longActivity); assert.equal(request.duration, 50);
  assert.ok(request.details.includes('Cancha de 8\nVarios cambios de ritmo'));
  assert.ok(request.details.includes('Fútbol'), 'The selected category reaches the existing estimator alongside free activity and notes');
  assert.deepEqual(request.profile, { sex: profile.sex, age: profile.age, weight: profile.weight, height: profile.height });
  assert.equal(document.getElementById('add-workout-calories').value, '485');
  const form = document.querySelector('form.entry-form');
  assert.match(form.textContent, /Estimación con IA/); assert.match(form.textContent, /485 kcal/);
  const details = [...form.querySelectorAll('details')].find(node => node.querySelector('summary')?.textContent === '¿Cómo se calculó?');
  assert.ok(details); assert.equal(details.open, false); assert.ok(details.textContent.includes(assumption));
  assert.match(details.textContent, /original|idioma/i); assert.equal(details.querySelector('script'), null);
  details.open = true; assert.ok(details.textContent.includes(assumption)); details.open = false;
  assert.equal(document.getElementById('add-workout-activity').value, longActivity);
  await view.fill('add-workout-calories', '510');
  assert.equal(document.getElementById('add-workout-calories').value, '510');
  assert.match(form.textContent, /Valor ajustado/); assert.match(form.textContent, /485 kcal/);
  await view.submit(); assert.equal(view.saves.length, 1); assert.equal(view.record().workouts[0].calories, 510);
});

test('in-flight duplicate clicks make one provider request and a manual calorie edit wins over the late response', async t => {
  const pending = deferred();
  const view = await mount(t, { estimateWorkout: () => pending.promise });
  await view.open(); await view.fill('add-workout-activity', 'Correr'); await view.fill('add-workout-duration', '30');
  const estimate = [...document.querySelectorAll('button')].find(node => node.textContent.includes('Estimar con IA'));
  await act(() => { estimate.click(); estimate.click(); estimate.click(); });
  assert.equal(view.requests.length, 1); assert.equal(estimate.disabled, true);
  assert.match(document.querySelector('form').textContent, /Estimando gasto energético…/);
  await view.fill('add-workout-calories', '333');
  await view.settle(() => pending.resolve({ calories: 485, assumptions: ['Original assumption'] }));
  assert.equal(document.getElementById('add-workout-calories').value, '333');
  assert.match(document.querySelector('form').textContent, /Valor ajustado/);
  assert.equal(view.requests.length, 1); assert.equal(view.saves.length, 0); assert.equal(view.toasts.length, 0);
});

test('changing the workout while estimating does not apply an obsolete response to its calories', async t => {
  const pending = deferred(); const view = await mount(t, { estimateWorkout: () => pending.promise });
  await view.open(); await view.fill('add-workout-activity', 'Correr'); await view.fill('add-workout-duration', '30');
  await view.fill('add-workout-calories', '200'); await view.estimate();
  await view.fill('add-workout-duration', '60');
  await view.settle(() => pending.resolve({ calories: 485, assumptions: ['For the old 30 minute session'] }));
  assert.equal(document.getElementById('add-workout-duration').value, '60');
  assert.equal(document.getElementById('add-workout-calories').value, '200');
  assert.equal(view.requests.length, 1); assert.equal(view.saves.length, 0);
});

test('closing and reopening the form isolates pending estimates from the next workout', async t => {
  const pending = deferred(); const view = await mount(t, { mobile: true, estimateWorkout: () => pending.promise });
  await view.open(); await view.fill('add-workout-activity', longActivity); await view.fill('add-workout-duration', '50'); await view.estimate();
  await view.click(document.querySelector('[aria-label="Cerrar formulario"]'));
  await view.open(); await view.fill('add-workout-activity', 'Nuevo borrador'); await view.fill('add-workout-duration', '10');
  await view.fill('add-workout-calories', '100');
  await view.settle(() => pending.resolve({ calories: 485, assumptions: ['Previous draft only'] }));
  assert.equal(document.getElementById('add-workout-activity').value, 'Nuevo borrador');
  assert.equal(document.getElementById('add-workout-calories').value, '100');
  assert.doesNotMatch(document.querySelector('form').textContent, /Previous draft only|Estimación con IA/);
  assert.equal(view.requests.length, 1); assert.equal(view.saves.length, 0);
});

test('session, quota and provider errors retain drafts, preserve public error copy and never retry or expose internal details', async t => {
  const errors = [
    new AIRequestError('Tu sesión expiró. Volvé a iniciar sesión.', 401, 'unauthorized'),
    new AIRequestError('Alcanzaste el límite de consultas por hoy para esta modalidad.', 429, 'quota_exceeded', 60),
    new AIRequestError('No pudimos conectar con el asistente. Intentá nuevamente.', 502, 'provider_invalid_response'),
    new Error('private-provider-token-or-content'),
  ];
  for (const error of errors) {
    const view = await mount(t, { estimateWorkout: async () => { throw error; } });
    await view.open(); await view.fill('add-workout-activity', longActivity); await view.fill('add-workout-duration', '50');
    await view.fill('add-workout-calories', '450'); await view.estimate();
    assert.equal(view.requests.length, 1); assert.equal(view.saves.length, 0); assert.equal(view.errors.length, 1);
    if (error instanceof AIRequestError) assert.equal(view.errors[0], error.message);
    else assert.equal(view.errors[0].includes('private-provider-token-or-content'), false);
    assert.equal(document.getElementById('add-workout-activity').value, longActivity);
    assert.equal(document.getElementById('add-workout-calories').value, '450');
    assert.equal([...document.querySelectorAll('button')].find(node => node.textContent.includes('Estimar con IA')).disabled, false);
    await view.click(document.querySelector('[aria-label="Cerrar formulario"]') || view.button('+ Ejercicio'));
    await view.dispose();
  }
});

test('rapid workout submissions save one record and a failed save leaves the full draft available', async t => {
  const pending = deferred(); const view = await mount(t, { save: () => pending.promise });
  await view.open(); await view.fill('add-workout-activity', `${longActivity}\nSegundo párrafo`);
  await view.fill('add-workout-duration', '50'); await view.fill('add-workout-calories', '485');
  await act(() => {
    const form = document.querySelector('form');
    for (let index = 0; index < 3; index++) form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  });
  assert.equal(view.saves.length, 1); assert.equal(view.record().workouts.length, 0);
  await view.settle(() => pending.resolve(false));
  assert.equal(document.getElementById('add-workout-activity').value, `${longActivity}\nSegundo párrafo`);
  assert.equal(document.getElementById('add-workout-calories').value, '485');
  assert.equal(view.record().workouts.length, 0); assert.equal(view.successes.length, 0);
});

test('meal description and notes retain their shared textarea and exact multiline save behavior', async t => {
  const view = await mount(t);
  await view.click(view.button('+ Comida'));
  const description = `Almuerzo con verduras\n${'detalle '.repeat(80)}`;
  const notes = 'Primera línea\nSegunda línea\nTercera línea';
  await view.fill('add-meal-description', description); await view.fill('add-meal-notes', notes);
  await view.fill('add-meal-calories', '600');
  assert.equal(document.getElementById('add-meal-description').tagName, 'TEXTAREA');
  assert.equal(document.getElementById('add-meal-notes').tagName, 'TEXTAREA');
  await view.submit();
  assert.equal(view.saves.length, 1); assert.equal(view.record().meals.length, 1);
  assert.equal(view.record().meals[0].name, description); assert.equal(view.record().meals[0].details, notes);
  assert.equal(view.record().workouts.length, 0);
});

test('meal estimates use the same integrated secondary explanation and preserve manual calories and stored notes', async t => {
  const assumption = 'Original service explanation. '.repeat(80);
  const pending = deferred(); const view = await mount(t, { estimateMeal: () => pending.promise });
  await view.click(view.button('+ Comida'));
  await view.fill('add-meal-description', 'Pollo\nArroz y verduras');
  await view.fill('add-meal-notes', 'Porción mediana\nSin salsa');
  await view.estimate();
  await view.fill('add-meal-calories', '650');
  await view.settle(() => pending.resolve({ calories: 600, description: 'Otra descripción del proveedor', assumptions: [assumption] }));
  assert.equal(view.requests.length, 1); assert.equal(view.requests[0].kind, 'meal');
  assert.equal(view.requests[0].input.name, 'Pollo\nArroz y verduras');
  assert.equal(view.requests[0].input.details, 'Porción mediana\nSin salsa');
  assert.equal(document.getElementById('add-meal-calories').value, '650');
  assert.equal(document.getElementById('add-meal-description').value, 'Pollo\nArroz y verduras');
  assert.equal(view.toasts.length, 0); assert.equal(view.saves.length, 0);
  const form = document.querySelector('form');
  assert.ok(form.querySelector('section[aria-label="Estimación con IA"]'));
  assert.match(form.textContent, /Valor ajustado/);
  assert.ok(form.querySelector('details').textContent.includes(assumption));
  assert.equal(form.querySelector('details').open, false);
  await view.submit();
  assert.equal(view.record().meals[0].calories, 650);
  assert.equal(view.record().meals[0].details, 'Porción mediana\nSin salsa');
});

for (const editing of [false, true]) {
  test(`${editing ? 'edit' : 'add'} meal type change invalidates a pending estimate without labeling unchanged calories as manually adjusted`, async t => {
    const pending = deferred();
    const meal = { id: 'existing-meal', name: 'Comida existente', type: 'Almuerzo', calories: 600,
      details: 'Notas existentes', time: '12:30' };
    const view = await mount(t, { record: { ...emptyRecord(), meals: editing ? [meal] : [] }, estimateMeal: () => pending.promise });
    const prefix = editing ? 'edit' : 'add';
    if (editing) {
      await view.click(document.querySelector('.daily-record-open'));
      await view.click(document.querySelector('.record-detail-edit'));
    } else {
      await view.click(view.button('+ Comida'));
      await view.fill('add-meal-description', 'Nueva comida'); await view.fill('add-meal-calories', '600');
    }
    await view.estimate();
    await view.fill(`${prefix}-meal-type`, 'Cena');
    await view.settle(() => pending.resolve({ calories: 485, description: 'Resultado anterior', assumptions: ['Original assumption'] }));
    assert.equal(document.getElementById(`${prefix}-meal-calories`).value, '600');
    assert.equal(document.getElementById(`${prefix}-meal-type`).value, 'Cena');
    const panel = document.querySelector('section[aria-label="Estimación con IA"]');
    assert.ok(panel); assert.match(panel.textContent, /Datos modificados/); assert.doesNotMatch(panel.textContent, /Valor ajustado/);
    assert.equal(view.requests.length, 1); assert.equal(view.saves.length, 0);
  });
}
