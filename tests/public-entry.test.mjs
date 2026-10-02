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
    export const useEffect = (...args) => globalThis.__entryHarness.hooks.useEffect?.(...args);
    export const lazy = () => () => null;
    export const Suspense = () => null;`),
  '../lib/supabase': stub('export const supabase = { auth: globalThis.__entryHarness.auth };'),
  '../lib/db': stub('export const completeOnboarding = (...args) => globalThis.__entryHarness.db.completeOnboarding(...args);'),
  'react-hot-toast': stub('export default globalThis.__entryHarness.toast; export const Toaster = () => null;'),
  './ThemeToggle': stub('export default () => null;'),
  '../hooks/useAppStore': stub('export const useAppStore = () => globalThis.__entryHarness.profileStore;'),
  '../lib/avatar': stub('export const prepareAvatar = () => {};'),
  './UserAvatar': stub('export default () => null;'),
  '../utils/helpers': new URL('../src/utils/helpers.ts', import.meta.url).href,
  './hooks/useAppStore': stub('export const useAppStore = () => globalThis.__entryHarness.profileStore;'),
  './utils/entryRoute': new URL('../src/utils/entryRoute.ts', import.meta.url).href,
  ...Object.fromEntries(['Sidebar', 'BottomNav', 'AuthModal', 'ThemeToggle', 'LandingPage', 'Onboarding']
    .map(name => [`./components/${name}`, stub(`export default function ${name}() { return null; }`)])),
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
const { default: ProfileView } = await loadModule('../src/components/ProfileView.tsx');
const { default: App } = await loadModule('../src/App.tsx');

function mount(component, props, initial = [], runEffects = false) {
  let cursor = 0;
  let effectCursor = 0;
  let pendingEffects = [];
  const effectDeps = [];
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
    useEffect(callback, deps) {
      if (!runEffects) return;
      const index = effectCursor++;
      if (!effectDeps[index] || deps.some((value, i) => !Object.is(value, effectDeps[index][i]))) {
        effectDeps[index] = deps;
        pendingEffects.push(callback);
      }
    },
  };
  return { slots, render() {
    cursor = 0; effectCursor = 0; pendingEffects = [];
    globalThis.__entryHarness.hooks = hooks;
    const tree = component(props);
    pendingEffects.forEach(callback => callback());
    return tree;
  } };
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

function profileDialog(view) {
  const tree = view.render();
  const element = node(tree, item => item.type === 'dialog');
  const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  element.props.ref.current = dialog;
  node(element, item => item.type === 'button' && item.props.children === 'Cancelar').props.ref.current = { focus() {} };
  return { dialog, element, open: () => node(view.render(), item => item.type === 'button' &&
    item.props.children?.includes('Cerrar sesión')).props.onClick(),
    buttons: () => nodes(node(view.render(), item => item.type === 'dialog'), item => item.type === 'button') };
}

test('profile sign-out opens an accessible confirmation and cancel does not sign out', () => {
  let calls = 0;
  globalThis.__entryHarness.profileStore = {
    user: { id: 'user-a' }, activeProfile: profile, signOut: () => { calls++; },
  };
  const confirmation = profileDialog(mount(ProfileView, {}));
  confirmation.open();
  assert.equal(confirmation.dialog.open, true);
  assert.equal(calls, 0);
  assert.equal(confirmation.element.props.role, 'dialog');
  assert.equal(confirmation.element.props['aria-modal'], 'true');
  assert.match(markup(confirmation.element), /¿Cerrar sesión\?/);
  assert.match(markup(confirmation.element), /Vas a salir de tu cuenta en este dispositivo\./);
  confirmation.buttons()[0].props.onClick();
  assert.equal(confirmation.dialog.open, false);
  assert.equal(calls, 0);
});

test('profile confirmation signs out once and disables actions and dismissal while pending', async () => {
  let finish;
  let calls = 0;
  globalThis.__entryHarness.profileStore = {
    user: { id: 'user-a', email: 'ana@example.com' }, activeProfile: profile,
    signOut: () => { calls++; return new Promise(resolve => { finish = resolve; }); },
  };
  const view = mount(ProfileView, {});
  const confirmation = profileDialog(view);
  const initial = view.render();
  assert.ok(markup(initial).indexOf('Cuenta y seguridad') < markup(initial).indexOf('Zona de peligro'));
  confirmation.open();
  assert.equal(calls, 0);
  const pending = confirmation.buttons()[1].props.onClick();
  const [cancelButton, busyButton] = confirmation.buttons();
  assert.equal(cancelButton.props.disabled, true);
  assert.equal(busyButton.props.disabled, true);
  assert.equal(busyButton.props['aria-busy'], true);
  assert.equal(busyButton.props.children, 'Cerrando sesión…');
  const busyDialog = node(view.render(), item => item.type === 'dialog');
  let prevented = false;
  busyDialog.props.onCancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  busyDialog.props.onClick({ target: confirmation.dialog, currentTarget: confirmation.dialog });
  assert.equal(confirmation.dialog.open, true);
  await busyButton.props.onClick();
  assert.equal(calls, 1);
  finish();
  await pending;
  assert.equal(confirmation.dialog.open, false);
  assert.equal(confirmation.buttons()[1].props.disabled, false);
});

test('failed profile sign-out shows an error and allows retry without changing profile data', async () => {
  const errors = [];
  globalThis.__entryHarness.toast.error = message => errors.push(message);
  const store = {
    user: { id: 'user-a' }, activeProfile: profile,
    signOut: async () => { throw new Error('Offline'); },
  };
  globalThis.__entryHarness.profileStore = store;
  const view = mount(ProfileView, {});
  const confirmation = profileDialog(view);
  confirmation.open();
  await confirmation.buttons()[1].props.onClick();
  assert.deepEqual(errors, ['No pudimos cerrar la sesión. Intentá nuevamente.']);
  assert.equal(confirmation.buttons()[1].props.disabled, false);
  assert.equal(confirmation.dialog.open, false);
  assert.equal(store.activeProfile, profile);
  assert.equal(store.user.id, 'user-a');
  store.signOut = async () => {};
  confirmation.open();
  await confirmation.buttons()[1].props.onClick();
  assert.equal(confirmation.dialog.open, false);
});

test('profile v2 keeps edit fields, validation, cancel and save within the personal section', async () => {
  const saved = [];
  globalThis.__entryHarness.profileStore = {
    user: { id: 'user-a' }, activeProfile: profile, updateProfile: async value => saved.push(value),
  };
  const view = mount(ProfileView, {});
  const edit = () => node(view.render(), element => element.type === 'button' && markup(element).includes('Editar perfil')).props.onClick();
  edit();
  const fields = () => nodes(node(view.render(), element => element.type === 'form'), element => ['input', 'select'].includes(element.type));
  assert.deepEqual(fields().map(field => field.props.type || field.type), ['text', 'select', 'number', 'number', 'number']);
  assert.deepEqual(fields().slice(2).map(field => [field.props.min, field.props.max]), [['1', '120'], ['20', '300'], ['50', '250']]);
  assert.equal(fields()[3].props.step, '0.1');
  fields()[0].props.onChange({ target: { value: 'Draft name' } });
  node(node(view.render(), element => element.type === 'form'), element => element.type === 'button' && element.props.children === 'Cancelar').props.onClick();
  assert.equal(nodes(view.render(), element => element.type === 'form').length, 0);
  assert.equal(saved.length, 0);
  edit();
  assert.equal(fields()[0].props.value, profile.name);
  fields()[0].props.onChange({ target: { value: 'Ana actualizada' } });
  fields()[2].props.onChange({ target: { value: '33' } });
  await submit(view.render());
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, 'Ana actualizada');
  assert.equal(saved[0].age, 33);
  assert.equal(saved[0].activity, profile.activity);
  assert.equal(saved[0].goal, profile.goal);
  assert.equal(saved[0].avatar_path, profile.avatar_path);
  assert.equal(saved[0].records, profile.records);
  assert.equal(nodes(view.render(), element => element.type === 'form').length, 0);
});

test('profile v2 password form preserves validation, loading and cancel behavior', async () => {
  const errors = [];
  const calls = [];
  let finish;
  globalThis.__entryHarness.toast.error = message => errors.push(message);
  globalThis.__entryHarness.auth.updateUser = value => {
    calls.push(value); return new Promise(resolve => { finish = resolve; });
  };
  globalThis.__entryHarness.profileStore = { user: { id: 'user-a' }, activeProfile: profile };
  const view = mount(ProfileView, {});
  const open = () => node(view.render(), element => element.props['aria-label'] === 'Cambiar contraseña').props.onClick();
  const form = () => node(view.render(), element => element.type === 'form');
  const setPasswords = (first, second) => {
    const inputs = nodes(form(), element => element.type === 'input');
    assert.ok(inputs.every(input => input.props.minLength === 8 && input.props.required));
    inputs[0].props.onChange({ target: { value: first } });
    inputs[1].props.onChange({ target: { value: second } });
  };
  open();
  setPasswords('short', 'short');
  await submit(view.render());
  setPasswords('preview-password', 'other-password');
  await submit(view.render());
  assert.equal(calls.length, 0);
  assert.equal(errors.length, 2);
  setPasswords('preview-password', 'preview-password');
  const pending = submit(view.render());
  assert.ok(nodes(form(), element => element.type === 'button').every(button => button.props.disabled));
  await submit(view.render());
  assert.deepEqual(calls, [{ password: 'preview-password' }]);
  finish({ error: null });
  await pending;
  assert.equal(nodes(view.render(), element => element.type === 'form').length, 0);
  open();
  assert.ok(nodes(form(), element => element.type === 'input').every(input => input.props.value === ''));
  setPasswords('another-password', 'another-password');
  node(form(), element => element.type === 'button' && element.props.children === 'Cancelar').props.onClick();
  open();
  assert.ok(nodes(form(), element => element.type === 'input').every(input => input.props.value === ''));
});

test('profile v2 expands energy information and preserves the record deletion confirmation', async () => {
  let calls = 0;
  let finish;
  globalThis.__entryHarness.profileStore = {
    user: { id: 'user-a' }, activeProfile: profile,
    resetData: () => { calls++; return new Promise(resolve => { finish = resolve; }); },
  };
  const view = mount(ProfileView, {});
  const toggle = () => node(view.render(), element => element.props['aria-controls'] === 'profile-energy-details');
  assert.equal(toggle().props['aria-expanded'], false);
  toggle().props.onClick();
  assert.equal(toggle().props['aria-expanded'], true);
  assert.match(markup(view.render()), /Pasos y ejercicio pueden solaparse/);
  toggle().props.onClick();
  assert.equal(toggle().props['aria-expanded'], false);
  assert.equal(nodes(view.render(), element => element.props.id === 'profile-energy-details').length, 0);
  const danger = () => node(view.render(), element => element.props.className === 'profile-danger profile-v2-danger');
  const deleteButton = () => node(danger(), element => element.type === 'button' && element.props.children === 'Borrar todos los registros');
  deleteButton().props.onClick();
  assert.equal(calls, 0);
  node(danger(), element => element.type === 'button' && element.props.children === 'Cancelar').props.onClick();
  assert.equal(calls, 0);
  deleteButton().props.onClick();
  const pending = node(danger(), element => element.type === 'button' && element.props.children === 'Confirmar').props.onClick();
  assert.ok(nodes(danger(), element => element.type === 'button').every(button => button.props.disabled));
  assert.equal(calls, 1);
  finish();
  await pending;
  assert.ok(deleteButton());
});

test('App renders the mobile Calori header only on Home and preserves tab navigation and scroll reset', () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    location: { pathname: '/app' },
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  try {
    globalThis.__entryHarness.profileStore = {
      user: { id: 'user-a' }, activeProfile: { ...profile, onboarding_completed: true }, loading: false,
    };
    const view = mount(App, {}, [], true);
    const initial = view.render();
    const scrolls = [];
    node(initial, element => element.type === 'main').props.ref.current = { scrollTo: options => scrolls.push(options) };
    for (const tab of ['home', 'chat', 'charts', 'profile', 'home']) {
      node(view.render(), element => !!element.props.onTabChange).props.onTabChange(tab);
      const tree = view.render();
      assert.equal(view.slots[0], tab);
      const headers = nodes(tree, element => element.type === 'header' && element.props.className.includes('home-header'));
      assert.equal(headers.length, tab === 'home' ? 1 : 0);
      if (headers.length) assert.match(markup(headers[0]), />Calori<\/h1>/);
      const shell = node(tree, element => element.props.className?.startsWith('app-shell '));
      assert.equal(shell.props.className.includes('app-shell-coach'), tab === 'chat');
    }
    assert.deepEqual(scrolls, Array.from({ length: 3 }, () => ({ top: 0, behavior: 'instant' })));
  } finally {
    globalThis.window = previousWindow;
  }
});

test('App starts each new session on Home and preserves tabs for the same user', () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    location: { pathname: '/' },
    history: { replaceState(_state, _title, path) { globalThis.window.location.pathname = path; } },
    addEventListener() {}, removeEventListener() {}, scrollTo() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  try {
    const store = { user: null, activeProfile: null, loading: false };
    globalThis.__entryHarness.profileStore = store;
    const view = mount(App, {}, [], true);
    view.render();
    assert.equal(view.slots[0], 'home');
    store.user = { id: 'user-a' };
    store.activeProfile = { ...profile, onboarding_completed: true };
    view.render();
    assert.equal(view.slots[0], 'home');
    const navigation = () => node(view.render(), element => !!element.props.onTabChange);
    navigation().props.onTabChange('profile');
    view.render();
    assert.equal(view.slots[0], 'profile');
    store.user = { id: 'user-a', refreshed: true };
    store.activeProfile = { ...store.activeProfile, avatar_path: 'new-avatar.jpg', name: 'Updated' };
    view.render();
    assert.equal(view.slots[0], 'profile');
    store.user = null;
    store.activeProfile = null;
    view.render();
    assert.equal(globalThis.window.location.pathname, '/');
    store.user = { id: 'user-a' };
    store.activeProfile = { ...profile, onboarding_completed: true };
    view.render();
    assert.equal(view.slots[0], 'home');
    navigation().props.onTabChange('charts');
    store.user = { id: 'user-b' };
    store.activeProfile = { ...profile, user_id: 'user-b', onboarding_completed: false };
    view.render();
    assert.equal(view.slots[0], 'home');
    assert.equal(globalThis.window.location.pathname, '/onboarding');
    store.activeProfile = { ...store.activeProfile, onboarding_completed: true };
    view.render();
    assert.equal(globalThis.window.location.pathname, '/app');
    assert.equal(view.slots[0], 'home');
  } finally {
    globalThis.window = previousWindow;
  }
});
