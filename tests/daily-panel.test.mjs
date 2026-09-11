import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';


import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { formatDateStr } from '../src/utils/helpers.ts';


const source = await readFile(new URL('../src/components/DailyPanel.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 } }).outputText
  .replace(/from ["']([^"']+)["']/g, (_, specifier) => `from ${JSON.stringify(specifier === '../utils/helpers'
    ? new URL('../src/utils/helpers.ts', import.meta.url).href : import.meta.resolve(specifier))}`);
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

test('DailyPanel renders updated targets after steps and workout add/edit/delete', () => {
  for (const [record, target] of [[base, '1.618'], [{ ...base, steps: 7000 }, '1.898'],
    [{ ...base, steps: 7000, workouts: [{ id: 'w', activity: 'Correr', calories: 450, duration: 45, muscles: [] }] }, '2.348'],
    [{ ...base, steps: 7000, workouts: [{ id: 'w', activity: 'Correr', calories: 600, duration: 45, muscles: [] }] }, '2.498'],
    [{ ...base, steps: 7000, workouts: [] }, '1.898']]) {
    const text = render(record);
    assert.ok(text.includes(`Meta de hoy${target} kcal`), text);
    assert.ok(text.includes(`Gasto estimado hoy: ${target} kcal`));
    assert.ok(text.includes('Consumidas0 kcal'));
  }
});

test('DailyPanel shows historical Sin datos and today full baseline remaining', () => {
  assert.ok(render({ ...base, dateStr: '2000-01-01' }).includes('Sin datos'));
  assert.ok(render(base).includes('Restantes1.618 kcal'));
});

test('DailyPanel displays exact-target and excess states', () => {
  for (const [calories, label] of [[1618, 'Meta alcanzada'], [1800, 'Exceso']]) {
    const text = render({ ...base, meals: [{ id: 'm', name: 'Comida', type: 'Almuerzo', calories }] });
    assert.ok(text.includes(label));
  }
});

