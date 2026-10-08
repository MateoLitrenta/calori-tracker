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
  const hero = nodes(tree, element => element.props.className === 'charts-summary-balance')[0];
  const metrics = nodes(tree, element => element.props.className === 'charts-summary-metrics')[0];
  return [
    { label: nodes(hero, element => element.type === 'h4')[0].props.children,
      value: nodes(hero, element => element.props.className?.split(' ').includes('charts-balance-value'))[0].props.children },
    ...nodes(metrics, element => element.type === 'div').map(element => ({
      label: nodes(element, child => child.type === 'dt')[0].props.children,
      value: nodes(element, child => child.type === 'dd')[0].props.children[0],
    })),
  ];
}

test('visible KPIs belong to the selected period with clear meal and activity denominators', () => {
  const records = { ...weeklyRecords,
    '2026-09-01': record('2026-09-01', { meals: [meal(1000)] }),
    '2026-08-31': record('2026-08-31', { meals: [meal(10000)] }),
    '2025-09-30': record('2025-09-30', { meals: [meal(20000)] }),
  };
  const week = render(records);
  assert.deepEqual(kpis(week.tree), [
    { label: 'Balance promedio', value: '+290' },
    { label: 'Consumidas', value: '2.250' },
    { label: 'Gasto estimado', value: '2.000' },
  ]);
  assert.match(week.html, /2 días con comidas/);
  assert.match(week.html, /3 días con datos/);
  assert.match(week.html, /Balance y consumidas usan días con comidas/);
  assert.match(week.html, /Gasto usa días con cualquier registro energético/);
  assert.doesNotMatch(week.html, /Promedio Diario|Meta|TDEE/);

  const month = render(records, 'Mes');
  assert.deepEqual(kpis(month.tree), [
    { label: 'Balance promedio', value: '-67' },
    { label: 'Consumidas', value: '1.833' },
    { label: 'Gasto estimado', value: '1.945' },
  ]);
  assert.equal(nodes(month.tree, element => element.props.role === 'listitem').length, 5);
  assert.match(month.html, /1 sep – 30 sep 2026/);

  const year = render(records, 'Año');
  assert.equal(nodes(year.tree, element => element.props.role === 'listitem').length, 12);
  assert.deepEqual(kpis(year.tree)[1], { label: 'Consumidas', value: '3.875' });
  assert.match(year.html, /5 días con datos · 4 días con comidas/);
});

test('workout-only data show expenditure without invented consumption or balance', () => {
  const { tree, html: markup } = render({ '2026-09-29': weeklyRecords['2026-09-29'] });
  assert.deepEqual(kpis(tree), [
    { label: 'Balance promedio', value: 'Sin datos' },
    { label: 'Consumidas', value: 'Sin datos' },
    { label: 'Gasto estimado', value: '2.080' },
  ]);
  assert.match(markup, /1 día con datos · 0 días con comidas/);
  const hero = nodes(tree, element => element.props.className === 'charts-summary-balance')[0];
  assert.match(html(hero), /Registrá comidas para calcular tu balance\./);
  assert.doesNotMatch(html(hero), /0 kcal|Mantenimiento|charts-balance-label/);
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
  assert.equal(nodes(view.tree, element => element.props.id === 'charts-bucket-detail').length, 0);
  assert.match(view.html, /Tocá un período para ver el detalle/);
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
  const year = render(weeklyRecords, globalThis.__chartsHarness.period);
  const selector = nodes(year.tree, element => element.props['aria-label'] === 'Período')[0];
  assert.equal(selector.props.style['--active-index'], 2);
  assert.equal(nodes(selector, element => element.props.className === 'charts-period-indicator').length, 1);
  const active = nodes(selector, element => element.props['aria-pressed'] === true);
  assert.equal(active.length, 1);
  assert.equal(active[0].props.children, 'Año');
  const energy = nodes(year.tree, element => element.props.className === 'charts-panel charts-energy')[0];
  assert.equal(energy.key, null);
  assert.equal(nodes(energy, element => element.props.className === 'charts-plot-scroll')[0].key, 'plot-Año');
  const summary = nodes(year.tree, element => element.props.className === 'charts-panel charts-summary')[0];
  assert.equal(summary.key, null); // Keep native methodology disclosure mounted across periods.
  assert.equal(nodes(summary, element => element.type === 'details').length, 1);
  assert.equal(nodes(summary, element => element.props.className === 'charts-kpis')[0].key, 'summary-Año');
});

test('one summary surface places balance first, two secondary averages and coverage metadata', () => {
  const { tree } = render(weeklyRecords);
  const summaries = nodes(tree, element => element.props.className === 'charts-panel charts-summary');
  assert.equal(summaries.length, 1);
  const summary = summaries[0];
  assert.ok(summary);
  assert.deepEqual(kpis(summary).map(metric => metric.label), ['Balance promedio', 'Consumidas', 'Gasto estimado']);
  const body = nodes(summary, element => element.props.className === 'charts-summary-body')[0];
  assert.equal(body.props.children[0].props.className, 'charts-summary-balance');
  const coverage = nodes(summary, element => element.props.className === 'charts-coverage')[0];
  assert.match(html(coverage), /3 días con datos · 2 días con comidas/);
  assert.doesNotMatch(html(summary), /charts-kpi[ "-]|charts-registered/);
});

test('activity metrics and previous comparison stay visible only for real recorded periods', () => {
  const records = { ...weeklyRecords,
    '2026-09-21': record('2026-09-21', { meals: [meal(1800)] }),
    '2026-09-22': record('2026-09-22', { meals: [meal(1800)] }),
  };
  const { tree, html: markup } = render(records);
  const activity = nodes(tree, element => element.props['aria-labelledby'] === 'charts-activity-heading')[0];
  assert.match(html(activity).replace(/<[^>]+>/g, ''), /Pasos promedio/);
  assert.match(html(activity), />2\.000<\/p>/);
  assert.match(html(activity), /500 kcal/);
  assert.match(html(activity), /Entrenamientos registrados/);
  assert.match(html(activity), /kcal registradas en entrenamientos/);
  assert.match(html(activity), /Racha de comidas · 1 día/);
  assert.match(markup, /Comparado con el período anterior/);
  assert.doesNotMatch(markup, /Mejor|Peor/);
  const sparse = render({ ...weeklyRecords, '2026-09-21': records['2026-09-21'] });
  assert.doesNotMatch(sparse.html, /Comparado con el período anterior/);
});

for (const [period, intro, subtitle, count] of [
  ['Semana', 'Esta semana', 'Valores diarios.', 7],
  ['Mes', 'Este mes', 'Promedios diarios por semana.', 5],
  ['Año', 'Este año', 'Promedios diarios por mes.', 12],
]) {
  test(`${period} insight describes the actual average and keeps its chart buckets`, () => {
    const { tree, html: markup } = render(weeklyRecords, period);
    const insight = nodes(tree, element => element.props.className === 'charts-insight')[0];
    assert.equal(insight.props.children, `${intro} tu balance promedio fue de +290 kcal/día · Superávit Moderado.`);
    assert.equal(nodes(tree, element => element.props.role === 'listitem').length, count);
    assert.match(markup, /Consumidas vs gasto/);
    assert.ok(markup.includes(subtitle));
    assert.doesNotMatch(html(insight), /deberías|mejor|empeor|meta|ideal/i);
  });
}

for (const [calories, balance, label, tone] of [
  [1279, '-501', 'Déficit Alto', 'charts-deficit'],
  [1407, '-373', 'Déficit Moderado', 'charts-deficit'],
  [1711, '-69', 'Déficit Leve', 'charts-deficit'],
  [1780, '0', 'Mantenimiento', 'charts-neutral'],
  [1865, '+85', 'Superávit Leve', 'charts-surplus'],
  [2100, '+320', 'Superávit Moderado', 'charts-surplus'],
  [2400, '+620', 'Superávit Alto', 'charts-surplus'],
]) {
  test(`${label} hero and insight preserve signed balance semantics`, () => {
    const { tree } = render({ '2026-09-30': record('2026-09-30', { meals: [meal(calories)] }) });
    const hero = nodes(tree, element => element.props.className === 'charts-summary-balance')[0];
    assert.equal(kpis(tree)[0].value, balance);
    assert.match(html(hero), new RegExp(tone));
    assert.ok(html(hero).includes(label));
    const insight = nodes(tree, element => element.props.className === 'charts-insight')[0];
    assert.equal(insight.props.children, `Esta semana tu balance promedio fue de ${balance} kcal/día · ${label}.`);
  });
}

test('no meals yields an honest insight for empty, steps-only and workout-only periods', () => {
  for (const records of [{}, { '2026-09-30': record('2026-09-30', { steps: 7000 }) },
    { '2026-09-30': record('2026-09-30', { workouts: [workout(300)] }) }]) {
    const { tree } = render(records);
    const insight = nodes(tree, element => element.props.className === 'charts-insight')[0];
    assert.equal(insight.props.children, 'Todavía no hay comidas registradas para calcular el balance de este período.');
    assert.doesNotMatch(html(insight), /0 kcal|Mantenimiento|Déficit|Superávit/);
  }
});

test('comparison needs two meal days in both periods and future data never enter coverage', () => {
  const current = { '2026-09-30': weeklyRecords['2026-09-30'] };
  const previous = {
    '2026-09-21': record('2026-09-21', { meals: [meal(1800)] }),
    '2026-09-22': record('2026-09-22', { meals: [meal(1800)] }),
  };
  const records = { ...weeklyRecords, ...previous,
    '2026-10-01': record('2026-10-01', { meals: [meal(9999)], steps: 99999 }),
  };
  const complete = render(records);
  assert.match(complete.html, /Comparado con el período anterior/);
  const coverage = nodes(complete.tree, element => element.props.className === 'charts-coverage')[0];
  assert.match(html(coverage), /3 días con datos · 2 días con comidas/);
  assert.equal(kpis(complete.tree)[0].value, '+290');
  assert.doesNotMatch(render({ ...current, ...previous }).html, /Comparado con el período anterior/);
  assert.doesNotMatch(render({ ...weeklyRecords, '2026-09-21': previous['2026-09-21'] }).html, /Comparado con el período anterior/);
});

test('desktop and mobile navigation use Datos and Coach while preserving destinations', () => {
  globalThis.__chartsHarness.profile = profile;
  for (const component of [Sidebar, BottomNav]) {
    const destinations = [];
    const tree = component({ activeTab: 'chat', onTabChange(tab) { destinations.push(tab); }, onAuthOpen() {} });
    const coachButton = nodes(tree, element => element.type === 'button' &&
      renderToStaticMarkup(element).includes('Coach'))[0];
    assert.ok(coachButton);
    coachButton.props.onClick();
    const dataButton = nodes(tree, element => element.type === 'button' &&
      renderToStaticMarkup(element).includes('Datos'))[0];
    assert.ok(dataButton);
    dataButton.props.onClick();
    assert.deepEqual(destinations, ['chat', 'charts']);
    assert.doesNotMatch(renderToStaticMarkup(tree), /Asistente|Gráficos/);
  }
});
