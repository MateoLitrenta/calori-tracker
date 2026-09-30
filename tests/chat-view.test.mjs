import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const stub = code => `data:text/javascript,${encodeURIComponent(code)}`;
const profile = { id: 'profile-a', user_id: 'user-a', name: 'Ana', age: 32,
  sex: 'Femenino', height: 167.5, weight: 63.2, activity: 'Moderado', goal: 'Mantenimiento', records: {} };
globalThis.__chatViewHarness = { profile };
const imports = {
  react: stub(`export const useState = (...args) => globalThis.__chatViewHarness.hooks.useState(...args);
    export const useRef = (...args) => globalThis.__chatViewHarness.hooks.useRef(...args);
    export const useCallback = callback => callback;
    export const useEffect = () => {};`),
  '../hooks/useAppStore': stub(`export const useAppStore = () => ({
    user: { id: 'user-a' }, activeProfile: globalThis.__chatViewHarness.profile,
    avatarRevision: 0, updateRecord: async () => true
  });`),
  './UserAvatar': stub('export default () => null;'),
  'react-hot-toast': stub('export default { error() {}, success() {} };'),
};
const source = (await readFile(new URL('../src/components/ChatView.tsx', import.meta.url), 'utf8'))
  .replace(/import ['"][^'"]+\.css['"];?/g, '')
  .replace(/import\s+\{([^}]+)\}\s+from ['"]@phosphor-icons\/react['"];?/g, (_, names) =>
    names.split(',').map(name => name.trim()).filter(Boolean).map(name => `const ${name} = () => null;`).join('\n'));
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023,
} }).outputText.replace(/from ["']([^"']+)["']/g, (_, specifier) => {
  const target = imports[specifier] || (specifier.startsWith('../')
    ? new URL(`../src/${specifier.slice(3)}.ts`, import.meta.url).href : import.meta.resolve(specifier));
  return `from ${JSON.stringify(target)}`;
});
const { default: ChatView } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

function mount(component, props) {
  let cursor = 0;
  const slots = [];
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
  };
  return { render() { cursor = 0; globalThis.__chatViewHarness.hooks = hooks; return component(props); } };
}
function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  if (!React.isValidElement(tree)) return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props.children, predicate)];
}
const hasClass = (element, name) => element.props.className?.split(' ').includes(name);
function render(messages = []) {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
  };
  const outer = mount(ChatView, { scrollContainer: { current: null } }).render();
  storage.set(`calori:assistant:messages:user-a:${outer.props.today}`, JSON.stringify(messages));
  storage.set('calori:assistant:messages:user-a:migrated', outer.props.today);
  return mount(outer.type, outer.props).render();
}

test('Coach empty state contains at most three suggestions and disappears with stored messages', () => {
  const empty = render();
  const emptyState = nodes(empty, element => hasClass(element, 'chat-empty'))[0];
  assert.ok(emptyState);
  assert.match(renderToStaticMarkup(emptyState), /¿En qué te puedo ayudar\?/);
  const suggestions = nodes(emptyState, element => hasClass(element, 'chat-empty-suggestions'))[0];
  assert.ok(suggestions);
  assert.equal(nodes(suggestions, element => element.type === 'button').length, 3);
  const conversation = render([
    { id: 'user-message', role: 'user', text: '¿Cómo estuvo mi día?' },
    { id: 'coach-message', role: 'bot', text: 'Revisemos tus registros de hoy.' },
  ]);
  assert.equal(nodes(conversation, element => hasClass(element, 'chat-empty')).length, 0);
  const markup = renderToStaticMarkup(conversation);
  assert.match(markup, /¿Cómo estuvo mi día\?/);
  assert.match(markup, /Revisemos tus registros de hoy\./);
});

test('Coach keeps header, accessible message area and composer in layout order', () => {
  const tree = render();
  const layout = React.Children.toArray(tree.props.children).filter(child => React.isValidElement(child));
  const header = layout.findIndex(element => element.type === 'header' && hasClass(element, 'chat-heading'));
  const messages = layout.findIndex(element => hasClass(element, 'chat-messages'));
  const composer = layout.findIndex(element => element.type === 'footer' && hasClass(element, 'chat-composer'));
  assert.ok(header >= 0 && messages > header && composer > messages);
  assert.equal(layout[messages].props.role, 'log');
  assert.equal(layout[messages].props['aria-label'], 'Conversación con Coach');
  for (const label of ['Historial', 'Nueva conversación', 'Adjuntar foto de comida',
    'Iniciar dictado por voz', 'Enviar mensaje']) {
    assert.equal(nodes(tree, element => element.type === 'button' && element.props['aria-label'] === label).length, 1);
  }
  const textarea = nodes(layout[composer], element => element.type === 'textarea')[0];
  assert.ok(textarea);
  assert.ok(textarea.props['aria-label']);
});
