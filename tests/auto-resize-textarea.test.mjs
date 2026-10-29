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
  const frames = new Map();
  let frameId = 0;
  window.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
  window.cancelAnimationFrame = id => frames.delete(id);
  window.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.add(this); }
    observe() {}
    disconnect() { observers.delete(this); }
  };
  Object.defineProperty(window.HTMLTextAreaElement.prototype, 'scrollHeight', { get() {
    assert.notEqual(document.querySelector('textarea:not([aria-hidden])')?.style.height, '0px',
      'Measuring must not temporarily collapse the visible field and its scroll container');
    return this.value.split('\n').reduce((lines, line) => lines + Math.max(1, Math.ceil(line.length / columns)), 0) * 20 + 16;
  } });
  window.HTMLTextAreaElement.prototype.getBoundingClientRect = function () {
    const top = 300 - (this.closest('.entry-form-content')?.scrollTop || 0);
    return { width: columns * 8, top, bottom: top + parseFloat(this.style.height) };
  };
  Object.defineProperty(window.HTMLSpanElement.prototype, 'offsetTop', { get() {
    const prefix = this.previousSibling?.textContent || '';
    const lines = prefix.split('\n');
    const row = lines.slice(0, -1).reduce((total, line) => total + Math.max(1, Math.ceil(line.length / columns)), 0)
      + Math.max(0, Math.ceil(lines.at(-1).length / columns) - 1);
    return 8 + row * 20;
  } });
  t.after(async () => {
    await act(() => root.unmount());
    assert.equal(observers.size, 0, 'ResizeObserver is cleaned up');
    assert.equal(frames.size, 0, 'Pending caret scroll is cancelled');
    dom.window.close();
    for (const [name, value] of Object.entries(previous)) globalThis[name] = value;
  });
  const style = { lineHeight: '20px', fontSize: '16px', padding: '8px 12px', border: '1px solid', minHeight: mobile ? '48px' : '42px' };
  const render = async (value, extra = {}) => act(() => root.render(React.createElement(AutoResizeTextarea,
    { value, onChange() {}, style, 'aria-label': 'Descripción', ...extra })));
  return { root, style, render, observers,
    flushFrames: async () => act(() => { for (const [id, callback] of [...frames]) if (frames.delete(id)) callback(); }),
    resize: async width => act(() => { columns = width; observers.forEach(observer => observer.callback()); }) };
}

test('typing and pasting more than 6, 15 and 30 lines grows to the entire value and shrinks on deletion', async t => {
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
  field.focus();
  const input = async (value, inputType = 'insertText') => act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(field, value);
    field.dispatchEvent(new window.InputEvent('input', { bubbles: true, inputType,
      isComposing: inputType === 'insertCompositionText' }));
  });
  await input('Uno\nDos\nTres');
  assert.equal(field.style.height, '78px'); assert.equal(field.style.overflowY, 'hidden');
  for (const lines of [7, 16, 31]) {
    const long = Array.from({ length: lines }, (_, i) => `Línea ${i} 🌱`).join('\n');
    await input(long, 'insertFromPaste');
    assert.equal(currentValue, long); assert.equal(field.value, long);
    assert.equal(field.style.height, `${lines * 20 + 18}px`);
    assert.equal(field.style.overflowY, 'hidden'); assert.equal(field.scrollTop, 0);
    assert.equal(field.style.maxHeight, 'none'); assert.equal(field.style.flex, '0 0 auto');
    assert.equal(document.activeElement, field);
    assert.equal(field.selectionStart, long.length); assert.equal(field.selectionEnd, long.length);
  }
  assert.equal(field.maxLength, -1);
  const enter = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  assert.equal(field.dispatchEvent(enter), true, 'Enter retains native multiline behavior');
  await input('Nota con 日本語', 'insertCompositionText');
  assert.equal(currentValue, 'Nota con 日本語'); assert.equal(document.activeElement, field);
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
  assert.equal(field.style.height, `${Math.ceil(value.length / 10) * 20 + 18}px`); assert.equal(field.style.overflowY, 'hidden');
  await env.resize(100);
  assert.equal(field.style.height, '58px'); assert.equal(field.style.overflowY, 'hidden');
  assert.equal(document.activeElement, field); assert.equal(field.selectionStart, 10); assert.equal(field.selectionEnd, 25);
  assert.equal(field.value, value);
  await env.render('Editado\nSegunda línea');
  assert.equal(field.value, 'Editado\nSegunda línea'); assert.equal(field.style.height, '58px');
});

test('unbroken words wrap and expand without horizontal or vertical internal scrolling', async t => {
  const env = await environment(t);
  const word = 'abcdefghij'.repeat(60);
  await env.render(word);
  const field = document.querySelector('textarea');
  assert.equal(field.value, word); assert.equal(field.style.height, '418px');
  assert.equal(field.style.overflowWrap, 'anywhere');
  assert.equal(field.style.overflowX, 'hidden'); assert.equal(field.style.overflowY, 'hidden');
  field.focus(); field.setSelectionRange(125, 125);
  await env.resize(10);
  assert.equal(field.style.height, '1218px'); assert.equal(field.scrollTop, 0);
  assert.equal(field.selectionStart, 125); assert.equal(field.selectionEnd, 125);
  await env.render('Corto'); assert.equal(field.style.height, '42px');
  assert.equal(document.querySelectorAll('textarea').length, 1, 'Measurement copies are removed');
});

test('mobile form scrolls to the caret after paste, selection and keyboard resize while Guardar stays outside its scrollport', async t => {
  const env = await environment(t, true);
  const viewport = new window.EventTarget();
  viewport.height = window.innerHeight; viewport.offsetTop = 0;
  Object.defineProperty(window, 'visualViewport', { value: viewport });
  const EntryFormShell = await load('EntryFormShell');
  let saves = 0;
  function Form() {
    const [value, setValue] = useState('');
    return React.createElement(EntryFormShell, { title: 'Agregar comida', onClose() {} },
      React.createElement('form', { className: 'entry-form', onSubmit: event => { event.preventDefault(); saves++; } },
        React.createElement('div', { className: 'entry-form-content' },
          React.createElement('div', { className: 'entry-field' }, React.createElement(AutoResizeTextarea,
            { value, onChange: event => setValue(event.target.value), style: env.style, 'aria-label': 'Descripción' }))),
        React.createElement('div', { className: 'entry-form-footer' }, React.createElement('button', { type: 'submit' }, 'Guardar'))));
  }
  await act(() => env.root.render(React.createElement(Form)));
  const field = document.querySelector('textarea');
  const content = document.querySelector('.entry-form-content');
  content.getBoundingClientRect = () => ({ top: 100, bottom: viewport.height - 80 });
  const assertCaretVisible = () => {
    const position = field.selectionDirection === 'backward' ? field.selectionStart : field.selectionEnd;
    const prefix = field.value.slice(0, position).split('\n');
    const row = prefix.slice(0, -1).reduce((total, line) => total + Math.max(1, Math.ceil(line.length / 30)), 0)
      + Math.max(0, Math.ceil(prefix.at(-1).length / 30) - 1);
    const top = field.getBoundingClientRect().top + 8 + row * 20;
    const visible = content.getBoundingClientRect();
    assert.ok(top >= visible.top, `Caret top ${top} must stay below scrollport top ${visible.top}`);
    assert.ok(top + 20 <= visible.bottom, `Caret bottom ${top + 20} must stay above scrollport bottom ${visible.bottom}`);
  };
  field.focus();
  viewport.height = 360;
  await act(() => viewport.dispatchEvent(new window.Event('resize')));
  const dialog = document.querySelector('[role="dialog"]');
  assert.equal(dialog.style.getPropertyValue('--entry-viewport-height'), '360px');
  assert.equal(dialog.style.getPropertyValue('--entry-keyboard-offset'), `${window.innerHeight - 360}px`);
  const text = Array.from({ length: 31 }, (_, i) => `Línea ${i}`).join('\n');
  await act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(field, text);
    field.dispatchEvent(new window.InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
  });
  await env.flushFrames();
  assert.equal(field.style.height, '638px'); assert.equal(field.style.overflowY, 'hidden');
  assert.ok(content.scrollTop > 0); assert.equal(field.scrollTop, 0);
  assert.equal(document.activeElement, field); assert.equal(field.selectionEnd, text.length);
  assertCaretVisible();
  const atEnd = content.scrollTop;
  // Opening/resizing the keyboard with the cursor at the beginning must not jump to line 31.
  field.setSelectionRange(0, 0);
  viewport.height = 320; viewport.offsetTop = 10;
  await act(() => viewport.dispatchEvent(new window.Event('resize')));
  assert.ok(content.scrollTop < atEnd);
  assert.equal(field.selectionStart, 0); assert.equal(document.activeElement, field);
  assertCaretVisible();
  assert.equal(dialog.style.getPropertyValue('--entry-keyboard-offset'), `${window.innerHeight - 330}px`);
  field.setSelectionRange(text.length, text.length);
  await act(() => field.dispatchEvent(new window.Event('select', { bubbles: true })));
  await env.flushFrames(); assert.ok(content.scrollTop > atEnd);
  assertCaretVisible();
  field.setSelectionRange(0, text.length, 'backward');
  await act(() => document.dispatchEvent(new window.Event('selectionchange')));
  await env.flushFrames(); assert.ok(content.scrollTop < atEnd);
  assert.equal(field.selectionDirection, 'backward');
  assertCaretVisible();
  assert.equal(document.body.style.overflow, 'hidden');
  await env.resize(15);
  assert.equal(field.value, text); assert.equal(document.activeElement, field);
  const save = document.querySelector('.entry-form-footer button');
  assert.equal(content.contains(save), false);
  save.focus(); await act(() => save.click()); assert.equal(saves, 1);
  await act(() => env.root.unmount());
  assert.equal(document.body.style.overflow, '');
});

test('bottom sheet gives scrolling to the content, prevents field compression and keeps the save footer fixed in its flex layout', async () => {
  const css = await readFile(new URL('../src/components/HomeVariants.css', import.meta.url), 'utf8');
  assert.match(css, /\.entry-form-content\s*\{[^}]*min-height: 0;[^}]*overflow-y: auto/);
  assert.match(css, /\.entry-field\s*\{[^}]*flex-shrink: 0/);
  assert.match(css, /\.entry-form-footer\s*\{[^}]*flex: none/);
  assert.match(css, /\.entry-bottom-sheet\s*\{[^}]*max-height: calc\(var\(--entry-viewport-height/);
});
