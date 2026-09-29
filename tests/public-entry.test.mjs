import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import postcss from 'postcss';

const stub = code => `data:text/javascript,${encodeURIComponent(code)}`;
globalThis.__entryHarness = { auth: {}, db: {}, toast: { success() {} } };
// Event-handler tests exercise the real components with hook state and service boundaries.
// Effects and DOM focus are left to browser verification.
globalThis.HTMLElement ??= class HTMLElement {};
const imports = {
  react: stub(`export const useState = (...args) => globalThis.__entryHarness.hooks.useState(...args);
    export const useRef = (...args) => globalThis.__entryHarness.hooks.useRef(...args);
    export const useEffect = () => {};`),
  '../lib/supabase': stub('export const supabase = { auth: globalThis.__entryHarness.auth };'),
  '../lib/db': stub('export const completeOnboarding = (...args) => globalThis.__entryHarness.db.completeOnboarding(...args);'),
  'react-hot-toast': stub('export default globalThis.__entryHarness.toast;'),
  './ThemeToggle': stub('export default () => null;'),
  '../utils/helpers': new URL('../src/utils/helpers.ts', import.meta.url).href,
};

async function loadModule(path) {
  const source = (await readFile(new URL(path, import.meta.url), 'utf8'))
    .replace(/import ['"][^'"]+\.css['"];?/g, '')
    .replace(/import\s+\{([^}]+)\}\s+from ['"]@phosphor-icons\/react['"];?/g, (_, names) =>
      names.split(',').map(name => name.trim()).filter(Boolean).map(name => `const ${name} = () => null;`).join('\n'));
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023,
  } }).outputText.replace(/from ["']([^"']+)["']/g,
    (_, specifier) => `from ${JSON.stringify(imports[specifier] || import.meta.resolve(specifier))}`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const { resolveEntryRoute } = await loadModule('../src/utils/entryRoute.ts');
const { default: AuthModal } = await loadModule('../src/components/AuthModal.tsx');
const { default: Onboarding } = await loadModule('../src/components/Onboarding.tsx');
const { default: LandingPage } = await loadModule('../src/components/LandingPage.tsx');
const { useAppStore } = await loadModule('../src/hooks/useAppStore.ts');

function mount(component, props, initial = []) {
  let cursor = 0;
  const slots = [...initial];
  const hooks = {
    useState(value) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = typeof value === 'function' ? value() : value;
      return [slots[slot], next => { slots[slot] = typeof next === 'function' ? next(slots[slot]) : next; }];
    },
    useRef(value) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = { current: value };
      return slots[slot];
    },
  };
  return { slots, render() { cursor = 0; globalThis.__entryHarness.hooks = hooks; return component(props); } };
}

function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  if (!React.isValidElement(tree)) return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props.children, predicate)];
}
function node(tree, predicate) {
  const found = nodes(tree, predicate)[0];
  assert.ok(found, 'Expected UI element was rendered');
  return found;
}
const submit = tree => node(tree, element => element.type === 'form').props.onSubmit({ preventDefault() {} });
const markup = tree => renderToStaticMarkup(tree);
const details = { name: 'Ana', age: 32, sex: 'Femenino', height: 167.5, weight: 63.2 };
const profile = { id: 'profile-a', user_id: 'user-a', ...details, onboarding_completed: false,
  activity: 'Activo', goal: 'Mantenimiento', avatar_path: 'avatar.jpg', records: { today: { meals: [1] } } };

test('anonymous visitors keep public routes and cannot open protected screens', () => {
  for (const [path, expected] of [['/', '/'], ['/login', '/login'], ['/register', '/register'],
    ['/app', '/'], ['/onboarding', '/'], ['/unknown', '/']]) {
    assert.equal(resolveEntryRoute(path, false), expected);
  }
});

test('authenticated routing handles new, completed, and legacy profiles without redirect loops', () => {
  for (const completed of [false, true, undefined]) {
    const expected = completed === false ? '/onboarding' : '/app';
    for (const path of ['/', '/login', '/register', '/onboarding', '/app', '/unknown']) {
      const destination = resolveEntryRoute(path, true, completed);
      assert.equal(destination, expected);
      assert.equal(resolveEntryRoute(destination, true, completed), destination);
    }
  }
});

test('landing renders visible content and working account links before reveal effects run', () => {
  const destinations = [];
  const view = mount(LandingPage, { onNavigate(path) { destinations.push(path); } });
  const tree = view.render();
  const html = markup(tree);
  assert.match(html, /<h1[^>]*>Tu alimentación y entrenamiento,/);
  assert.match(html, /href="\/register"/);
  assert.match(html, /href="\/login"/);
  assert.doesNotMatch(html, /lp-reveal-pending/);
  assert.match(html, /Vista de ejemplo/);
  const links = nodes(tree, element => typeof element.type === 'function' && ['/login', '/register'].includes(element.props.path));
  assert.ok(links.some(link => link.props.path === '/login'));
  assert.ok(links.some(link => link.props.path === '/register'));
  for (const link of links) {
    const anchor = link.type(link.props);
    assert.equal(anchor.type, 'a');
    assert.equal(anchor.props.href, link.props.path);
    let prevented = false;
    anchor.props.onClick({ button: 0, preventDefault() { prevented = true; } });
    assert.ok(prevented);
    assert.equal(destinations.at(-1), link.props.path);
    const count = destinations.length;
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      anchor.props.onClick({ button: 0, ...modifier, preventDefault() { assert.fail('Native modified links must remain available'); } });
    }
    assert.equal(destinations.length, count);
  }
});

function fillCredentials(view) {
  const tree = view.render();
  for (const [id, value] of [['auth-email', 'ana@example.com'], ['auth-password', 'secret123']]) {
    node(tree, element => element.props.id === id).props.onChange({ target: { value } });
  }
  return view.render();
}

test('login uses password authentication, prevents duplicate submits, and closes after success', async () => {
  const calls = [];
  let resolve;
  let closed = 0;
  globalThis.__entryHarness.auth.signInWithPassword = credentials => {
    calls.push(credentials);
    return new Promise(done => { resolve = done; });
  };
  const view = mount(AuthModal, { initialMode: 'login', presentation: 'page', onClose() { closed++; } });
  const tree = fillCredentials(view);
  const pending = submit(tree);
  await submit(tree);
  assert.deepEqual(calls, [{ email: 'ana@example.com', password: 'secret123' }]);
  assert.equal(closed, 0);
  assert.ok(nodes(view.render(), element => element.type === 'input').every(input => input.props.disabled));
  resolve({ error: null });
  await pending;
  assert.equal(closed, 1);
});

test('signup submits credentials only and supports both confirmation-email and immediate-session outcomes', async () => {
  for (const session of [null, { user: { id: 'new-user' } }]) {
    let closed = 0;
    const calls = [];
    globalThis.__entryHarness.auth.signUp = async credentials => {
      calls.push(credentials);
      return { data: { session }, error: null };
    };
    const view = mount(AuthModal, { initialMode: 'register', presentation: 'page', onClose() { closed++; } });
    const tree = fillCredentials(view);
    assert.deepEqual(nodes(tree, element => element.type === 'input').map(input => input.props.type), ['email', 'password']);
    await submit(tree);
    assert.deepEqual(calls, [{ email: 'ana@example.com', password: 'secret123' }]);
    assert.equal(closed, session ? 1 : 0);
    if (!session) {
      assert.match(markup(view.render()), /Revisá tu email/);
      assert.equal(nodes(view.render(), element => element.type === 'form').length, 0);
    }
  }
});

test('authentication failures keep credentials available for retry and expose an accessible error', async () => {
  globalThis.__entryHarness.auth.signInWithPassword = async () => ({ error: new Error('Credenciales inválidas') });
  const view = mount(AuthModal, { onClose() { assert.fail('Failed authentication must not close'); } });
  await submit(fillCredentials(view));
  const tree = view.render();
  assert.match(markup(node(tree, element => element.props.role === 'alert')), /Credenciales inválidas/);
  assert.equal(node(tree, element => element.props.id === 'auth-email').props.value, 'ana@example.com');
  assert.equal(node(tree, element => element.props.type === 'submit').props.disabled, false);
});

test('authentication mode changes use the public route callback', () => {
  const modes = [];
  const view = mount(AuthModal, { initialMode: 'login', onClose() {}, onModeChange(mode) { modes.push(mode); } });
  node(view.render(), element => element.type === 'button' && element.props.children === 'Crear cuenta').props.onClick();
  assert.deepEqual(modes, ['register']);
});

test('onboarding validates all personal fields before allowing progress', async () => {
  const view = mount(Onboarding, { profile: { ...profile, name: '', age: 0, sex: '', height: 0, weight: 0 },
    onComplete() { assert.fail('Invalid data must not be saved'); }, onSignOut() {} });
  await submit(view.render());
  const tree = view.render();
  assert.equal(nodes(tree, element => element.props['aria-invalid'] === true).length, 5);
  assert.match(markup(tree), /Paso 1 de 4/);
  assert.match(markup(node(tree, element => element.props.role === 'alert')), /Revisá los campos/);
});

test('onboarding saves only from the final step, blocks duplicate saves, and preserves data after failure', async () => {
  let resolve;
  let reject;
  const saved = [];
  const view = mount(Onboarding, { profile, onSignOut() {}, onComplete(value) {
    saved.push(value);
    return new Promise((done, fail) => { resolve = done; reject = fail; });
  } });
  for (let step = 0; step < 3; step++) await submit(view.render());
  assert.deepEqual(saved, []);
  assert.match(markup(view.render()), /Entrar a Calori/);
  let pending = submit(view.render());
  await submit(view.render());
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0], details);
  reject(new Error('Offline'));
  await pending;
  assert.match(markup(view.render()), /Tus datos siguen acá/);
  assert.equal(node(view.render(), element => element.props.type === 'submit').props.disabled, false);
  pending = submit(view.render());
  assert.deepEqual(saved, [details, details]);
  resolve();
  await pending;
  assert.match(markup(view.render()), /Perfil listo/);
  await submit(view.render());
  assert.equal(saved.length, 2);
});

test('the store completes onboarding only after persistence and preserves unrelated profile data', async () => {
  let resolve;
  const calls = [];
  globalThis.__entryHarness.db.completeOnboarding = (...args) => {
    calls.push(args);
    return new Promise(done => { resolve = done; });
  };
  const view = mount(useAppStore, {}, [{ id: 'user-a' }, profile, false, 0]);
  const pending = view.render().completeOnboarding({ ...details, name: ' Ana ' });
  assert.equal(view.slots[1], profile);
  assert.deepEqual(calls, [['user-a', { ...details, name: ' Ana ' }]]);
  resolve();
  await pending;
  assert.deepEqual(view.slots[1], { ...profile, onboarding_completed: true });
  assert.equal(view.slots[1].records, profile.records);
});

test('failed onboarding saves and account changes cannot incorrectly complete a local profile', async () => {
  globalThis.__entryHarness.db.completeOnboarding = async () => { throw new Error('Offline'); };
  let view = mount(useAppStore, {}, [{ id: 'user-a' }, profile, false, 0]);
  await assert.rejects(view.render().completeOnboarding(details), /Offline/);
  assert.equal(view.slots[1], profile);
  let resolve;
  globalThis.__entryHarness.db.completeOnboarding = () => new Promise(done => { resolve = done; });
  for (const nextProfile of [null, { ...profile, id: 'profile-b', user_id: 'user-b' }]) {
    view = mount(useAppStore, {}, [{ id: 'user-a' }, profile, false, 0]);
    const pending = view.render().completeOnboarding(details);
    view.slots[1] = nextProfile;
    resolve();
    await pending;
    assert.equal(view.slots[1], nextProfile);
  }
});

test('entry and onboarding respect reduced motion without hiding content', async () => {
  for (const path of ['../src/components/AuthEntry.css', '../src/components/Onboarding.css']) {
    const css = postcss.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
    const reducedRules = [];
    css.walkAtRules('media', rule => {
      if (/prefers-reduced-motion:\s*reduce/.test(rule.params)) reducedRules.push(rule);
    });
    assert.ok(reducedRules.length, `${path} supports reduced motion`);
    const declarations = reducedRules.flatMap(rule => {
      const result = [];
      rule.walkDecls(declaration => result.push([declaration.prop, declaration.value]));
      return result;
    });
    assert.ok(declarations.some(([prop, value]) => prop === 'animation' && value === 'none'));
    assert.ok(declarations.some(([prop, value]) => prop === 'transition' && value === 'none'));
    assert.ok(!declarations.some(([prop, value]) => prop === 'display' && value === 'none' || prop === 'visibility' && value === 'hidden'));
  }
});

test('reduced-motion landing content stays visible even with a pending reveal class', async () => {
  const css = postcss.parse(await readFile(new URL('../src/components/LandingPage.css', import.meta.url), 'utf8'));
  const declarations = {};
  css.walkAtRules('media', media => {
    if (!/prefers-reduced-motion:\s*reduce/.test(media.params)) return;
    media.walkRules(rule => {
      if (!rule.selector.includes('.lp-reveal-pending')) return;
      rule.walkDecls(declaration => { declarations[declaration.prop] = declaration.value; });
    });
  });
  assert.equal(declarations.opacity, '1');
  assert.equal(declarations.transform, 'none');
});
