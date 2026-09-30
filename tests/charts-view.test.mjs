import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const stub = code => `data:text/javascript,${encodeURIComponent(code)}`;
globalThis.__chartsHarness = { profile: null, period: 'Semana' };
const imports = {
  react: stub(`import { useMemo } from ${JSON.stringify(import.meta.resolve('react'))};
    export const useState = initial => {
      const field = initial === null ? 'selectedBucket' : 'period';
      const harness = globalThis.__chartsHarness;
      return [harness[field] ?? initial, next => { harness[field] = typeof next === 'function' ? next(harness[field]) : next; }];
    };
    export { useMemo };`),
  '../hooks/useAppStore': stub(`export const useAppStore = () => ({
    activeProfile: globalThis.__chartsHarness.profile,
    user: { id: 'test-user' }, avatarRevision: 0, signOut() {}
  });`),
  './ThemeToggle': stub('export default () => null;'),
  './UserAvatar': stub('export default () => null;'),
};

async function loadModule(path) {
  const source = (await readFile(new URL(path, import.meta.url), 'utf8'))
    .replace(/import ['"][^'"]+\.css['"];?/g, '')
    .replace(/import\s+\{([^}]+)\}\s+from ['"]@phosphor-icons\/react['"];?/g, (_, names) =>
      names.split(',').map(name => name.trim()).filter(Boolean).map(name => `const ${name} = () => null;`).join('\n'));
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023,
  } }).outputText.replace(/from ["']([^"']+)["']/g, (_, specifier) => {
    const target = imports[specifier] || (specifier.startsWith('../utils/')
      ? new URL(`../src/utils/${specifier.slice('../utils/'.length)}.ts`, import.meta.url).href
      : import.meta.resolve(specifier));
    return `from ${JSON.stringify(target)}`;
  });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const { default: ChartsView } = await loadModule('../src/components/ChartsView.tsx');
const { default: Sidebar } = await loadModule('../src/components/Sidebar.tsx');
const { default: BottomNav } = await loadModule('../src/components/BottomNav.tsx');

const NativeDate = Date;
const today = '2026-09-30';
const profile = { id: 'profile-a', user_id: 'test-user', name: 'Ana', age: 30,
  sex: 'Masculino', height: 180, weight: 80, goal: 'Mantenimiento', activity: 'Moderado', records: {} };
const meal = calories => ({ id: 'meal-a', name: 'Almuerzo', type: 'Almuerzo', calories });
const workout = calories => ({ id: 'workout-a', activity: 'Correr', duration: 30, calories, muscles: [] });
const record = (dateStr, options = {}) => ({ dateStr, date: new NativeDate(`${dateStr}T12:00:00`),
  meals: [], workouts: [], steps: 0, water: 0, ...options });

function render(records = {}, period = 'Semana', selectedBucket = null) {
  globalThis.__chartsHarness = { profile: { ...profile, records }, period, selectedBucket };
  globalThis.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [`${today}T12:00:00`])); }
    static now() { return new NativeDate(`${today}T12:00:00`).getTime(); }
  };
  let tree;
  function Capture() { tree = ChartsView(); return tree; }
  try { return { html: renderToStaticMarkup(React.createElement(Capture)), tree }; }
  finally { globalThis.Date = NativeDate; }
}

function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  if (!React.isValidElement(tree)) return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props.children, predicate)];
}

const html = element => renderToStaticMarkup(element);
const weeklyRecords = {
  '2026-09-28': record('2026-09-28', { meals: [meal(2000)], steps: 1000 }),
  '2026-09-29': record('2026-09-29', { workouts: [workout(300)] }),
  '2026-09-30': record('2026-09-30', { meals: [meal(2500)], steps: 3000, workouts: [workout(200)] }),
};
function kpis(tree) {
  return nodes(tree, element => element.props.className === 'charts-kpi').map(element => ({
    label: nodes(element, child => child.type === 'h3')[0].props.children,
    value: nodes(element, child => typeof child.props.className === 'string' &&
      child.props.className.split(' ').includes('charts-value'))[0].props.children,
  }));
}

test('visible KPIs belong to the selected period with clear meal and activity denominators', () => {
  const records = { ...weeklyRecords,
    '2026-09-01': record('2026-09-01', { meals: [meal(1000)] }),
    '2026-08-31': record('2026-08-31', { meals: [meal(10000)] }),
    '2025-09-30': record('2025-09-30', { meals: [meal(20000)] }),
  };
  const week = render(records);
  assert.deepEqual(kpis(week.tree), [
    { label: 'Consumidas promedio', value: '2.250' },
    { label: 'Gasto promedio', value: '2.000' },
    { label: 'Balance promedio', value: '+290' },
    { label: 'Días registrados', value: '3' },
  ]);
  assert.match(week.html, /2 días con comidas/);
  assert.match(week.html, /3 días con datos/);
  assert.match(week.html, /kcal\/día · con comidas/);
  assert.doesNotMatch(week.html, /Promedio Diario|Meta|TDEE/);

  const month = render(records, 'Mes');
  assert.deepEqual(kpis(month.tree), [
    { label: 'Consumidas promedio', value: '1.833' },
    { label: 'Gasto promedio', value: '1.945' },
    { label: 'Balance promedio', value: '-67' },
    { label: 'Días registrados', value: '4' },
  ]);
  assert.equal(nodes(month.tree, element => element.props.role === 'listitem').length, 5);
  assert.match(month.html, /1 sep – 30 sep 2026/);

  const year = render(records, 'Año');
  assert.equal(nodes(year.tree, element => element.props.role === 'listitem').length, 12);
  assert.deepEqual(kpis(year.tree)[0], { label: 'Consumidas promedio', value: '3.875' });
  assert.deepEqual(kpis(year.tree)[3], { label: 'Días registrados', value: '5' });
});

test('workout-only data show expenditure without invented consumption or balance', () => {
  const { tree, html: markup } = render({ '2026-09-29': weeklyRecords['2026-09-29'] });
  assert.deepEqual(kpis(tree), [
    { label: 'Consumidas promedio', value: 'Sin datos' },
    { label: 'Gasto promedio', value: '2.080' },
    { label: 'Balance promedio', value: 'Sin datos' },
    { label: 'Días registrados', value: '1' },
  ]);
  const tuesday = nodes(tree, element => element.type === 'button' &&
    element.props['aria-label']?.startsWith('Martes.'))[0];
  assert.ok(tuesday);
  assert.match(tuesday.props['aria-label'], /Consumidas: Sin comidas registradas/);
  assert.match(tuesday.props['aria-label'], /Gasto estimado: 2\.080 kcal/);
  assert.match(tuesday.props['aria-label'], /Balance: Sin datos/);
  assert.match(html(tuesday), /charts-bar-expenditure/);
  assert.doesNotMatch(html(tuesday), /charts-bar-consumed/);
  assert.doesNotMatch(markup, /Comparado con el período anterior/);
});

test('empty periods expose an honest accessible empty state without fake calorie values', () => {
  const { tree, html: markup } = render({ '2026-09-30': record('2026-09-30', { water: 500, weight: 80 }) });
  assert.deepEqual(kpis(tree).slice(0, 3).map(item => item.value), ['Sin datos', 'Sin datos', 'Sin datos']);
  assert.match(markup, /No hay suficientes registros para este período\./);
  assert.match(markup, /Registrá comidas y actividad para ver tu evolución\./);
  assert.equal(nodes(tree, element => element.props.role === 'status').length, 1);
  assert.equal(nodes(tree, element => element.props.role === 'listitem').length, 0);
  assert.doesNotMatch(markup, />0 kcal</);
});

test('keyboard focus and pointer selection expose exact expenditure and balance in the detail', () => {
  const view = render(weeklyRecords);
  const monday = nodes(view.tree, element => element.type === 'button' &&
    element.props['aria-label']?.startsWith('Lunes.'))[0];
  assert.ok(monday);
  assert.equal(typeof monday.props.onFocus, 'function');
  assert.equal(typeof monday.props.onMouseEnter, 'function');
  assert.equal(typeof monday.props.onClick, 'function');
  assert.equal(monday.props.disabled, undefined);
  monday.props.onFocus();
  const selected = render(weeklyRecords, 'Semana', globalThis.__chartsHarness.selectedBucket);
  const detail = nodes(selected.tree, element => element.props.role === 'tooltip')[0];
  assert.ok(detail);
  assert.match(html(detail), /Consumidas<\/dt><dd>2\.000 kcal/);
  assert.match(html(detail), /Gasto estimado<\/dt><dd>1\.820 kcal/);
  assert.match(html(detail), /\+180 kcal/);
  assert.match(html(detail), /Superávit Leve/);
  const focused = nodes(selected.tree, element => element.type === 'button' &&
    element.props['aria-label']?.startsWith('Lunes.'))[0];
  assert.equal(focused.props['aria-describedby'], detail.props.id);
  assert.equal(focused.props['aria-pressed'], true);

  const month = render(weeklyRecords, 'Mes', '2026-09-29');
  const monthDetail = nodes(month.tree, element => element.props.role === 'tooltip')[0];
  assert.match(html(monthDetail), /Consumidas promedio/);
  assert.match(html(monthDetail), /Gasto promedio/);
  assert.match(html(monthDetail), /Balance promedio/);
  assert.match(html(monthDetail), /2\.090 kcal/);
  const periodButton = nodes(month.tree, element => element.type === 'button' && element.props.children === 'Año')[0];
  periodButton.props.onClick();
  assert.equal(globalThis.__chartsHarness.period, 'Año');
  assert.equal(globalThis.__chartsHarness.selectedBucket, null);
});

test('activity metrics and previous comparison stay visible only for real recorded periods', () => {
  const records = { ...weeklyRecords,
    '2026-09-21': record('2026-09-21', { meals: [meal(1800)] }),
    '2026-09-22': record('2026-09-22', { meals: [meal(1800)] }),
  };
  const { tree, html: markup } = render(records);
  const activity = nodes(tree, element => element.props['aria-labelledby'] === 'charts-activity-heading')[0];
  assert.match(html(activity), /Pasos promedio/);
  assert.match(html(activity), />2\.000<\/p>/);
  assert.match(html(activity), /500 kcal/);
  assert.match(html(activity), /Entrenamientos registrados/);
  assert.match(html(activity), /kcal registradas en entrenamientos/);
  assert.match(markup, /Comparado con el período anterior/);
  assert.doesNotMatch(markup, /Mejor|Peor/);
  const sparse = render({ ...weeklyRecords, '2026-09-21': records['2026-09-21'] });
  assert.doesNotMatch(sparse.html, /Comparado con el período anterior/);
});

test('desktop and mobile navigation use Coach while preserving the chat destination', () => {
  globalThis.__chartsHarness.profile = profile;
  for (const component of [Sidebar, BottomNav]) {
    const destinations = [];
    const tree = component({ activeTab: 'chat', onTabChange(tab) { destinations.push(tab); }, onAuthOpen() {} });
    const coachButton = nodes(tree, element => element.type === 'button' &&
      renderToStaticMarkup(element).includes('Coach'))[0];
    assert.ok(coachButton);
    coachButton.props.onClick();
    assert.deepEqual(destinations, ['chat']);
    assert.doesNotMatch(renderToStaticMarkup(tree), /Asistente/);
  }
});
