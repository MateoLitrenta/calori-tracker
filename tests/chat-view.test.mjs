import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { buildCoachCard } from '../src/utils/coachPresentation.ts';
import { buildCoachContext } from '../src/utils/coachContext.ts';
import chatHandler from '../api/ai/chat.ts';

const stub = code => `data:text/javascript,${encodeURIComponent(code)}`;
const profile = { id: 'profile-a', user_id: 'user-a', name: 'Ana', age: 32,
  sex: 'Femenino', height: 167.5, weight: 63.2, activity: 'Moderado', goal: 'Mantenimiento', records: {} };
globalThis.__chatViewHarness = { profile };
const insightSource = await readFile(new URL('../src/components/CoachInsightCard.tsx', import.meta.url), 'utf8');
const insightCode = ts.transpileModule(insightSource, { compilerOptions: {
  module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023,
} }).outputText.replace(/from ["']([^"']+)["']/g, (_, name) => 'from ' + JSON.stringify(
  name === '../utils/helpers' ? new URL('../src/utils/helpers.ts', import.meta.url).href : import.meta.resolve(name)));
const imports = {
  './CoachInsightCard': 'data:text/javascript;base64,' + Buffer.from(insightCode).toString('base64'),
  react: stub(`export const useState = (...args) => globalThis.__chatViewHarness.hooks.useState(...args);
    export const useRef = (...args) => globalThis.__chatViewHarness.hooks.useRef(...args);
    export const useCallback = callback => callback;
    export const useEffect = (...args) => globalThis.__chatViewHarness.hooks.useEffect(...args);`),
  '../hooks/useAppStore': stub(`export const useAppStore = () => ({
    user: { id: 'user-a' }, activeProfile: globalThis.__chatViewHarness.profile,
    avatarRevision: 0, updateRecord: (...args) => globalThis.__chatViewHarness.updateRecord?.(...args) ?? true
  });`),
  '../services/aiService': stub(`export * from ${JSON.stringify(new URL('../src/services/aiService.ts', import.meta.url).href)};
    export const generateAIResponse = (...args) => globalThis.__chatViewHarness.generateAIResponse(...args);`),
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
  let effects = [];
  const hooks = {
    useState(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof value === 'function' ? value() : value;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useEffect(callback, deps) { effects.push({ callback, deps }); },
    useRef(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: value };
      return slots[index];
    },
  };
  return {
    render() { cursor = 0; effects = []; globalThis.__chatViewHarness.hooks = hooks; return component(props); },
    flushAnchor() { effects.find(effect => effect.deps?.length === 5 && Array.isArray(effect.deps[0]))?.callback(); },
    flushPersistence() { effects.find(effect => typeof effect.deps?.[1] === 'string' && effect.deps[1].startsWith('calori:assistant:messages:'))?.callback(); },
  };
}
function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  if (!React.isValidElement(tree)) return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props.children, predicate)];
}
const hasClass = (element, name) => element.props.className?.split(' ').includes(name);
function conversation(messages = []) {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
  };
  const outer = mount(ChatView, { scrollContainer: { current: null } }).render();
  storage.set(`calori:assistant:messages:user-a:${outer.props.today}`, JSON.stringify(messages));
  storage.set('calori:assistant:messages:user-a:migrated', outer.props.today);
  return mount(outer.type, outer.props);
}
const render = (messages = []) => conversation(messages).render();

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
  assert.equal(nodes(conversation, element => hasClass(element, 'chat-message-new')).length, 0);
});

test('only new interaction messages animate, while confirmation still edits and persists after approval', async () => {
  const view = conversation([{ id: 'stored-message', role: 'bot', text: 'Mensaje anterior.' }]);
  const get = predicate => nodes(view.render(), predicate)[0];
  let finish;
  const saved = [];
  const today = new Date().toLocaleDateString('en-CA');
  globalThis.__chatViewHarness.generateAIResponse = () => new Promise(resolve => { finish = resolve; });
  globalThis.__chatViewHarness.updateRecord = async (...args) => { saved.push(args); return true; };
  get(element => element.type === 'textarea' && element.props['aria-label'] === 'Mensaje para Coach')
    .props.onChange({ target: { value: 'Comí una manzana.' } });
  get(element => element.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(nodes(view.render(), element => hasClass(element, 'chat-message-new')).length, 1);
  const typing = get(element => element.props['aria-label'] === 'Coach está respondiendo');
  assert.equal(nodes(typing, element => hasClass(element, 'chat-typing-dot')).length, 3);
  assert.equal(saved.length, 0);
  finish({ presentation: 'today_summary', reply: 'Revisá esta estimación.', actions: [{ type: 'add_meal', estimated: true,
    payload: { dateStr: today, name: 'Manzana', type: 'Snack', calories: 80, time: '12:30' } }] });
  await new Promise(setImmediate);
  assert.equal(nodes(view.render(), element => hasClass(element, 'chat-message-new')).length, 2);
  assert.ok(get(element => hasClass(element, 'chat-confirmation')));
  assert.equal(nodes(view.render(), element => element.type.name === 'CoachInsightCard').length, 0);
  assert.equal(saved.length, 0);
  get(element => element.type === 'button' && element.props.children === 'Editar').props.onClick();
  assert.ok(get(element => hasClass(element, 'chat-proposal-edit')));
  get(element => element.type === 'input' && element.props.value === '80').props.onChange({ target: { value: '90' } });
  await get(element => element.type === 'button' && element.props.children === 'Confirmar').props.onClick();
  assert.equal(saved.length, 1);
  assert.equal(saved[0][1].meals.at(-1).calories, 90);
  assert.equal(nodes(view.render(), element => hasClass(element, 'chat-confirmation')).length, 0);
  assert.match(renderToStaticMarkup(view.render()), /Registrado hoy/);
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

test('pending proposals neutralize automatic future save claims without changing confirmation', async () => {
  const today = new Date().toLocaleDateString('en-CA');
  for (const reply of ['Registraré un café negro solo.', 'Lo registraré.', 'Voy a registrar un café.', 'Lo voy a registrar.', 'Voy a cargarlo.']) {
    const view = conversation();
    const get = predicate => nodes(view.render(), predicate)[0];
    let writes = 0;
    globalThis.__chatViewHarness.updateRecord = async () => { writes++; return true; };
    globalThis.__chatViewHarness.generateAIResponse = async () => ({ reply, presentation: 'none', actions: [
      { type: 'add_meal', estimated: true, payload: { dateStr: today, name: 'Café negro', type: 'Snack', calories: 3, time: '10:15' } },
    ] });
    get(e => e.type === 'textarea').props.onChange({ target: { value: 'recién tomé un café negro' } });
    await get(e => e.type === 'form').props.onSubmit({ preventDefault() {} });
    const html = renderToStaticMarkup(view.render());
    assert.match(html, /Preparé este registro para que lo confirmes\./);
    assert.ok(!html.includes(reply));
    assert.ok(get(e => hasClass(e, 'chat-confirmation')));
    assert.equal(writes, 0);
    assert.equal(nodes(view.render(), e => e.type.name === 'CoachInsightCard').length, 0);
  }
});

test('coffee sequence asks preparation, proposes with first message time, and saves only on Confirmar', async t => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'mock';
  t.after(() => {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey;
  });
  const view = conversation();
  const get = predicate => nodes(view.render(), predicate)[0];
  const requests = [];
  const saved = [];
  globalThis.__chatViewHarness.updateRecord = async (...args) => { saved.push(args); return true; };
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    const result = requests.length === 1
      ? { reply: '¿Era café solo o llevaba leche/azúcar?', actions: [] }
      : { reply: 'Te propongo este registro.', actions: [{ type: 'add_meal', estimated: true,
        payload: { dateStr: requests.at(-1).today, name: 'Café negro solo', type: 'Snack', calories: 3, details: '' } }] };
    assert.match(payload.contents[0].parts[0].text, /Inmediatez explícita: sí/);
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] });
  };
  globalThis.__chatViewHarness.generateAIResponse = async (messages, systemInstruction, today, attachment, coachContext) => {
    const body = { messages, systemInstruction, today, attachment, coachContext };
    requests.push(body);
    const response = await chatHandler.fetch(new Request('http://localhost/api/ai/chat', { method: 'POST', body: JSON.stringify(body) }));
    assert.equal(response.status, 200);
    return response.json();
  };
  for (const text of ['recien me tome un cafe', 'era negro solo']) {
    get(e => e.type === 'textarea').props.onChange({ target: { value: text } });
    await get(e => e.type === 'form').props.onSubmit({ preventDefault() {} });
    await new Promise(setImmediate);
  }
  assert.equal(requests.length, 2);
  const html = renderToStaticMarkup(view.render());
  assert.ok(!html.includes('¿A qué hora'));
  assert.ok(!html.includes('calorías estimas'));
  assert.match(html, /Café negro solo/);
  assert.equal(saved.length, 0);
  await get(e => e.type === 'button' && e.props.children === 'Confirmar').props.onClick();
  assert.equal(saved.length, 1);
  const record = saved[0][1].meals.at(-1);
  assert.equal(record.name, 'Café negro solo');
  assert.equal(record.time, requests[0].messages[0].localTime);
  assert.equal(record.calories, 3);
  assert.match(renderToStaticMarkup(view.render()), /Registrado hoy/);
});

test('stored card is a sibling of reply, stays stable and historical messages do not animate', () => {
  const date = new Date().toLocaleDateString('en-CA');
  const card = buildCoachCard('today_summary', buildCoachContext(profile, date));
  const message = { id: 'historic-card', role: 'bot', text: 'Faltan comidas registradas.', coachCard: card };
  const view = conversation([message, { id: 'old', role: 'bot', text: 'Texto antiguo.' }]);
  const stack = nodes(view.render(), e => hasClass(e, 'chat-coach-stack'))[0];
  assert.ok(stack);
  assert.equal(stack.props.children[0].type.name, 'CoachInsightCard');
  assert.ok(hasClass(stack.props.children[1], 'chat-bubble'));
  const html = renderToStaticMarkup(stack);
  assert.match(html, /Resumen de hoy|Sin datos todavía|Faltan comidas registradas\./);
  assert.doesNotMatch(html, /0 kcal|Mantenimiento/);
  assert.equal(nodes(view.render(), e => hasClass(e, 'chat-message-new')).length, 0);
  view.flushPersistence();
  const saved = JSON.parse(localStorage.getItem(`calori:assistant:messages:user-a:${date}`));
  assert.deepEqual(saved[0].coachCard, card);
  const reloaded = render(saved);
  assert.deepEqual(nodes(reloaded, e => e.type.name === 'CoachInsightCard')[0].props.card, card);
  assert.match(renderToStaticMarkup(reloaded), /Texto antiguo\./);
});

test('malformed cards and user card metadata are dropped without losing any message text', () => {
  const date = new Date().toLocaleDateString('en-CA');
  const card = buildCoachCard('today_summary', buildCoachContext(profile, date));
  const tree = render([
    { id: 'bad-card', role: 'bot', text: 'Texto conservado.', coachCard: { ...card, type: 'unknown' } },
    { id: 'user-card', role: 'user', text: 'Mensaje del usuario.', coachCard: card },
  ]);
  assert.equal(nodes(tree, e => e.type.name === 'CoachInsightCard').length, 0);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Texto conservado\.|Mensaje del usuario\./);
  assert.equal(nodes(tree, e => hasClass(e, 'chat-bubble')).length, 2);
});

test('new response snapshot uses the request context even when records change before the response', async t => {
  const oldWindow = globalThis.window;
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  t.after(() => { globalThis.window = oldWindow; });
  const oldProfile = globalThis.__chatViewHarness.profile;
  const date = new Date().toLocaleDateString('en-CA');
  const current = { ...profile, records: { [date]: { meals: [{ name: 'Comida', type: 'Almuerzo', calories: 500 }], workouts: [], steps: 8500, water: 0 } } };
  globalThis.__chatViewHarness.profile = current;
  t.after(() => { globalThis.__chatViewHarness.profile = oldProfile; });
  const view = conversation();
  let finish;
  let sentContext;
  globalThis.__chatViewHarness.generateAIResponse = (...args) => {
    sentContext = args[4];
    return new Promise(resolve => { finish = resolve; });
  };
  const get = predicate => nodes(view.render(), predicate)[0];
  get(e => e.type === 'textarea').props.onChange({ target: { value: '¿Cómo vengo hoy?' } });
  get(e => e.type === 'form').props.onSubmit({ preventDefault() {} });
  current.records[date].meals.push({ name: 'Otra comida', type: 'Cena', calories: 900 });
  finish({ reply: 'Hay un déficit registrado.', actions: [], presentation: 'today_summary', consumed: 99999 });
  await new Promise(setImmediate);
  const rendered = get(e => e.type.name === 'CoachInsightCard');
  assert.deepEqual(rendered.props.card, buildCoachCard('today_summary', sentContext));
  assert.equal(rendered.props.card.consumed, 500);
  assert.match(renderToStaticMarkup(view.render()), /Hay un déficit registrado\./);
  view.flushPersistence();
  const stored = JSON.parse(localStorage.getItem(`calori:assistant:messages:user-a:${date}`));
  assert.deepEqual(stored.at(-1).coachCard, rendered.props.card);
});

test('rejected actions cannot create a card even if the model supplied a hint', async () => {
  const view = conversation();
  globalThis.__chatViewHarness.generateAIResponse = async () => ({ reply: 'No debe mostrarse.', presentation: 'today_summary',
    actions: [{ type: 'set_steps', estimated: false, payload: { dateStr: new Date().toLocaleDateString('en-CA'), steps: -1 } }] });
  const get = predicate => nodes(view.render(), predicate)[0];
  get(e => e.type === 'textarea').props.onChange({ target: { value: 'Pasos' } });
  get(e => e.type === 'form').props.onSubmit({ preventDefault() {} });
  await new Promise(setImmediate);
  assert.equal(nodes(view.render(), e => e.type.name === 'CoachInsightCard').length, 0);
  assert.match(renderToStaticMarkup(view.render()), /Revisá la fecha y los datos necesarios/);
});

test('insight cards use existing balance labels, recorded averages and accessible empty states', () => {
  const date = new Date().toLocaleDateString('en-CA');
  const todayCard = buildCoachCard('today_summary', buildCoachContext(profile, date));
  for (const [balance, label] of [[-1, 'Déficit Leve'], [-373, 'Déficit Moderado'], [1, 'Superávit Leve'], [0, 'Mantenimiento']]) {
    const html = renderToStaticMarkup(render([{ id: 'balance', role: 'bot', text: 'Explicación.',
      coachCard: { ...todayCard, consumed: 1800 + balance, expenditure: 1800, balance } }]));
    assert.ok(html.includes(label));
    assert.match(html, /aria-label="Resumen de hoy"/);
  }
  for (const type of ['nutrition_recent', 'training_recent']) {
    const html = renderToStaticMarkup(render([{ id: type, role: 'bot', text: 'Explicación.',
      coachCard: buildCoachCard(type, buildCoachContext(profile, date)) }]));
    assert.match(html, /Últimos 7 días/);
    assert.doesNotMatch(html, /0 kcal|Esta semana/);
    assert.match(html, type === 'nutrition_recent' ? /No hay comidas registradas/ : /Sin actividad registrada/);
  }
});

test('incoming cards preserve a reader above the end and keep the current anchor when already near it', async t => {
  const oldWindow = globalThis.window;
  const oldFrame = globalThis.requestAnimationFrame;
  globalThis.window = { matchMedia: query => ({ matches: query.includes('max-width') }) };
  globalThis.requestAnimationFrame = callback => { callback(); return 1; };
  t.after(() => { globalThis.window = oldWindow; globalThis.requestAnimationFrame = oldFrame; });
  for (const [scrollTop, expected] of [[150, 0], [1480, 1]]) {
    let scrolled = 0;
    const view = conversation([{ id: 'previous', role: 'bot', text: 'Anterior.' }]);
    const get = predicate => nodes(view.render(), predicate)[0];
    const container = { scrollHeight: 2000, clientHeight: 500, scrollTop, scrollTo() { scrolled++; } };
    get(e => hasClass(e, 'chat-messages')).props.ref.current = container;
    globalThis.__chatViewHarness.generateAIResponse = async () => ({ reply: 'Resumen.', actions: [], presentation: 'today_summary' });
    get(e => e.type === 'textarea').props.onChange({ target: { value: '¿Cómo vengo hoy?' } });
    get(e => e.type === 'form').props.onSubmit({ preventDefault() {} });
    await new Promise(setImmediate);
    view.render();
    view.flushAnchor();
    assert.equal(scrolled, expected);
    assert.equal(container.scrollTop, scrollTop);
  }
});
