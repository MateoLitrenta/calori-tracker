import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import React, { act, useState } from 'react';
import { JSDOM } from 'jsdom';
import ts from 'typescript';

async function load(name) {
  const source = (await readFile(new URL(`../src/components/${name}.tsx`, import.meta.url), 'utf8'))
    .replace("import { X } from '@phosphor-icons/react';", 'const X = () => null;');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 } }).outputText
    .replace(/from ["']([^"']+)["']/g, (_, specifier) => `from ${JSON.stringify(import.meta.resolve(specifier))}`);
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default;
}
const AutoResizeTextarea = await load('AutoResizeTextarea');

async function environment(t, mobile = false) {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  const previous = {};
  for (const name of ['window', 'document', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT']) previous[name] = globalThis[name];
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = () => ({ matches: mobile, addEventListener() {}, removeEventListener() {} });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  // JSDOM has no layout engine: simulate only wrapping geometry, use real React and DOM events.
  let columns = 30;
  const observers = new Set();
  window.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.add(this); }
    observe() {}
    disconnect() { observers.delete(this); }
  };
  Object.defineProperty(window.HTMLTextAreaElement.prototype, 'scrollHeight', { get() {
    return this.value.split('\n').reduce((lines, line) => lines + Math.max(1, Math.ceil(line.length / columns)), 0) * 20 + 16;
  } });
  window.HTMLTextAreaElement.prototype.getBoundingClientRect = function () {
    return { width: columns * 8, top: 300, bottom: 300 + parseFloat(this.style.height) };
  };
  t.after(async () => {
    await act(() => root.unmount());
    assert.equal(observers.size, 0, 'ResizeObserver is cleaned up');
    dom.window.close();
    for (const [name, value] of Object.entries(previous)) globalThis[name] = value;
  });
  const style = { lineHeight: '20px', fontSize: '16px', padding: '8px 12px', border: '1px solid', minHeight: mobile ? '48px' : '42px' };
  const render = async (value, extra = {}) => act(() => root.render(React.createElement(AutoResizeTextarea,
    { value, onChange() {}, style, 'aria-label': 'Descripción', ...extra })));
  return { root, style, render, observers,
    resize: async width => act(() => { columns = width; observers.forEach(observer => observer.callback()); }) };
}

test('typing and pasting long content grows to six lines, scrolls internally and shrinks on deletion', async t => {
  const env = await environment(t);
  let currentValue = '';
  function Form() {
    const [value, setValue] = useState('');
    return React.createElement(AutoResizeTextarea, { value, style: env.style, required: true,
      'aria-label': 'Descripción', onChange: event => { currentValue = event.target.value; setValue(currentValue); } });
  }
  await act(() => env.root.render(React.createElement(Form)));
  const field = document.querySelector('textarea');
  assert.equal(field.rows, 1); assert.equal(field.wrap, 'soft'); assert.equal(field.required, true);
  assert.equal(field.style.height, '42px'); assert.equal(field.style.resize, 'none');
  assert.equal(field.style.overflowWrap, 'anywhere');
  const input = async value => act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(field, value);
    field.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await input('Uno\nDos\nTres');
  assert.equal(field.style.height, '78px'); assert.equal(field.style.overflowY, 'hidden');
  const long = 'Una descripción extensa con acentos y emojis 🌱. '.repeat(30) + '\nFinal sin truncar';
  await input(long);
  assert.equal(currentValue, long); assert.equal(field.value, long);
  assert.equal(field.style.height, '138px'); assert.equal(field.style.overflowY, 'auto');
  assert.equal(field.maxLength, -1);
  const enter = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  assert.equal(field.dispatchEvent(enter), true, 'Enter retains native multiline behavior');
  await input('Corto');
  assert.equal(field.style.height, '42px'); assert.equal(field.style.overflowY, 'hidden');
  await input(''); assert.equal(field.style.height, '42px');
});

test('existing values and width changes recalculate wrapping without losing focus, selection or text', async t => {
  const env = await environment(t);
  const value = 'Una descripción existente con varias palabras y contenido completo.'.repeat(2);
  await env.render(value);
  const field = document.querySelector('textarea');
  assert.equal(field.style.height, '118px');
  field.focus(); field.setSelectionRange(10, 25);
  await env.resize(10);
  assert.equal(field.style.height, '138px'); assert.equal(field.style.overflowY, 'auto');
  await env.resize(100);
  assert.equal(field.style.height, '58px'); assert.equal(field.style.overflowY, 'hidden');
  assert.equal(document.activeElement, field); assert.equal(field.selectionStart, 10); assert.equal(field.selectionEnd, 25);
  assert.equal(field.value, value);
  await env.render('Editado\nSegunda línea');
  assert.equal(field.value, 'Editado\nSegunda línea'); assert.equal(field.style.height, '58px');
});

test('mobile bottom sheet keeps its viewport handling and focused multiline content during simulated keyboard resize', async t => {
  const env = await environment(t, true);
  const viewport = new window.EventTarget();
  viewport.height = window.innerHeight; viewport.offsetTop = 0;
  Object.defineProperty(window, 'visualViewport', { value: viewport });
  const EntryFormShell = await load('EntryFormShell');
  await act(() => env.root.render(React.createElement(EntryFormShell, { title: 'Agregar comida', onClose() {} },
    React.createElement('form', { className: 'entry-form' }, React.createElement('div', { className: 'entry-form-content' },
      React.createElement(AutoResizeTextarea, { value: 'Texto largo\n'.repeat(10), onChange() {}, style: env.style, 'aria-label': 'Descripción' }))))));
  const field = document.querySelector('textarea');
  const content = document.querySelector('.entry-form-content');
  content.getBoundingClientRect = () => ({ top: 150, bottom: 400 });
  field.focus();
  viewport.height = 360;
  await act(() => viewport.dispatchEvent(new window.Event('resize')));
  const dialog = document.querySelector('[role="dialog"]');
  assert.equal(dialog.style.getPropertyValue('--entry-viewport-height'), '360px');
  assert.equal(dialog.style.getPropertyValue('--entry-keyboard-offset'), `${window.innerHeight - 360}px`);
  assert.equal(field.style.height, '138px'); assert.equal(field.style.overflowY, 'auto');
  assert.ok(content.scrollTop > 0); assert.equal(document.activeElement, field);
  assert.equal(document.body.style.overflow, 'hidden');
  await env.resize(15);
  assert.equal(field.value, 'Texto largo\n'.repeat(10)); assert.equal(document.activeElement, field);
  await act(() => env.root.unmount());
  assert.equal(document.body.style.overflow, '');
});
