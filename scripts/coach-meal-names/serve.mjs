import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import ts from 'typescript';
import { globalSupabase, installGlobalFixture } from '../fitness-global/fixture.mjs';

// A local-only visual fixture. It serves the real App, views, CSS, AI transport
// and account-owned conversation store. Only Auth, remote APIs and writes are
// synthetic. No browser is launched or controlled by this script.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
process.chdir(repo);
const port = Number(process.argv.find(value => value.startsWith('--port='))?.split('=')[1] || 5194);
const today = '2026-11-26';
const generation = '22222222-2222-4222-8222-222222222222';
const makeMeal = (name, details, overrides = {}) => ({ type: 'add_meal', estimated: true,
  payload: { dateStr: today, name, details, type: 'Almuerzo', calories: 850, time: '13:30', ...overrides } });
const cases = {
  standard: [makeMeal('Almuerzo', 'Milanesa con papas y cerveza')],
  missing: [makeMeal('Comida', 'Sin azúcar')],
  long: [makeMeal('Milanesa napolitana con papas al horno, ensalada de tomate, cerveza y ensalada de frutas de postre',
    'Una milanesa napolitana al horno, papas al horno, ensalada de tomate, una cerveza y una porción de ensalada de frutas de postre.')],
  multi: [makeMeal('Almuerzo', 'Milanesa con papas y cerveza'),
    makeMeal('Merienda', 'Café con dos tostadas y queso', { type: 'Merienda', time: '17:00', calories: 320 })],
};
const emptyDay = { dateStr: today, date: today + 'T12:00:00', generation, version: '1', meals: [], workouts: [], steps: 0, water: 0 };
const profile = { id: 'synthetic-coach-name', user_id: 'synthetic-coach-name', name: 'Alex', age: 30,
  sex: 'Masculino', height: 175, weight: 73, activity: 'Moderado', goal: 'Mantenimiento',
  onboarding_completed: true, avatar_path: null, recordProtocol: 'atomic', recordGeneration: generation,
  records: { [today]: emptyDay } };

const boot = `(() => {
  const params = new URLSearchParams(location.search);
  const today = ${JSON.stringify(today)}, generation = ${JSON.stringify(generation)};
  const cases = ${JSON.stringify(cases)}, initial = ${JSON.stringify(profile)};
  const scenario = Object.hasOwn(cases, params.get('case')) ? params.get('case') : 'standard';
  const phase = 'coach-meal-names', fixtureKey = 'calori-home-qa-fixtures-' + phase;
  const NativeDate = Date;
  class FixedDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [today + 'T16:30:00Z'])); }
    static now() { return new NativeDate(today + 'T16:30:00Z').getTime(); }
  }
  window.Date = FixedDate;
  if (params.has('theme')) localStorage.setItem('calori-theme', params.get('theme'));
  if (params.get('reset') === '1') {
    localStorage.removeItem(fixtureKey);
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('calori:assistant:messages:synthetic-coach-name')) localStorage.removeItem(key);
    }
  }
  let saved;
  try { saved = JSON.parse(localStorage.getItem(fixtureKey) || 'null'); } catch {}
  const qa = { phase, today, profiles: saved || { A: initial }, account: 'A', listeners: new Set(), revision: 0,
    writes: [], aiCalls: [], failed: false, externalRequests: 0, scenario,
    controlsHidden: params.get('controls') === '0' };
  qa.notify = () => { qa.revision++; qa.listeners.forEach(fn => fn()); };
  qa.makeStore = () => ({ user: { id: initial.user_id, email: 'synthetic@example.test' },
    activeProfile: qa.profiles.A, avatarRevision: 0, loading: false, habitDrafts: null,
    signOut: async () => {}, completeOnboarding: async () => {},
    updateRecord: async (date, value, options) => {
      const call = { owner: 'A', date, record: structuredClone(value), status: 'pending' };
      qa.writes.push(call);
      if (qa.failed || date !== value.dateStr || date > today) {
        call.status = 'failed';
        options?.onFailure?.({ kind: 'invalid', message: 'Fallo sintético de QA. No se guardó.' });
        qa.notify(); return false;
      }
      const canonical = { ...structuredClone(value), date: date + 'T12:00:00', generation,
        version: String(Number(value.version || 0) + 1) };
      qa.profiles = { A: { ...qa.profiles.A, records: { ...qa.profiles.A.records, [date]: canonical } } };
      localStorage.setItem(fixtureKey, JSON.stringify(qa.profiles));
      call.status = 'confirmed'; qa.store = qa.makeStore(); options?.onConfirmed?.(canonical, generation);
      qa.notify(); return true;
    }
  });
  qa.prepare = key => {
    qa.scenario = key;
    qa.nextAI = { reply: 'Preparé esta propuesta sintética para que la revises.',
      actions: structuredClone(cases[key]), presentation: 'none' };
    qa.notify();
  };
  qa.store = qa.makeStore(); window.__homeQA = qa;
  const fetchLocal = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== location.origin) { qa.externalRequests++; return Promise.reject(Error('Remote requests blocked in synthetic QA')); }
    return fetchLocal(input, init);
  };
})();
(${installGlobalFixture.toString()})();
window.__homeQA.prepare(window.__homeQA.scenario);`;

const storeSource = `import { useSyncExternalStore, useMemo } from 'react';
import { CoachConversationStore } from '/src/lib/coachConversation.ts';
const qa = window.__homeQA;
const conversations = new CoachConversationStore(() => qa.store.activeProfile);
conversations.resetOwner(qa.store.user.id);
const subscribe = listener => { qa.listeners.add(listener); return () => qa.listeners.delete(listener); };
export function useAppStore() {
  const store = useSyncExternalStore(subscribe, () => qa.store);
  return useMemo(() => ({ ...store, coachConversations: conversations }), [store]);
}`;
const entry = `import React, { useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import App from '/src/App.tsx';
import { ThemeProvider } from '/src/components/ThemeProvider.tsx';
import '/src/index.css';
function Controls() {
  const qa = window.__homeQA;
  useSyncExternalStore(listener => { qa.listeners.add(listener); return () => qa.listeners.delete(listener); }, () => qa.revision);
  const [hidden, setHidden] = useState(qa.controlsHidden);
  if (hidden) return null;
  return <details style={{position:'fixed', right:8, top:8, zIndex:99999, maxWidth:300, padding:8,
    background:'#fff', color:'#111', border:'1px solid #999', font:'12px sans-serif'}}>
    <summary style={{minHeight:28}}>Prueba sintética de nombres</summary>
    <p>Sin servicios remotos. Caso: {qa.scenario}. IA: {qa.aiCalls.length}.
      Guardados: {qa.writes.filter(call => call.status === 'confirmed').length}.</p>
    <p>Elegí el caso y enviá un mensaje desde Coach.</p>
    <div style={{display:'grid', gap:6}}>
      <button type="button" onClick={() => qa.prepare('standard')}>Preparar nombre genérico</button>
      <button type="button" onClick={() => qa.prepare('missing')}>Preparar nombre incompleto</button>
      <button type="button" onClick={() => qa.prepare('long')}>Preparar nombre largo</button>
      <button type="button" onClick={() => qa.prepare('multi')}>Preparar dos comidas</button>
    </div>
    <label style={{display:'block', marginBlock:12}}><input type="checkbox" checked={qa.failed}
      onChange={event => { qa.failed = event.target.checked; qa.notify(); }}/>
      Simular fallo de guardado</label>
    <button type="button" onClick={() => setHidden(true)}>Ocultar controles de prueba</button>
    <pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(qa.writes.map(call => ({date:call.date, status:call.status})), null, 2)}</pre>
  </details>;
}
createRoot(document.getElementById('root')).render(<ThemeProvider><App/><Controls/></ThemeProvider>);`;
const entryCode = ts.transpileModule(entry, { compilerOptions: { module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 } }).outputText;
const external = { '/hooks/useAppStore.ts': storeSource, '/lib/supabase.ts': globalSupabase };
const server = await createServer({ root: repo, configFile: false,
  cacheDir: path.join(repo, 'node_modules/.vite-coach-meal-names'),
  define: { __CALORI_PREVIEW_COMMIT__: JSON.stringify('local-name-qa') },
  plugins: [{ name: 'coach-meal-names-synthetic-boundaries', enforce: 'pre',
    resolveId(id) { if (id === '/__coach_names_qa.tsx') return '\0coach-names-qa.tsx'; },
    load(id) {
      if (id === '\0coach-names-qa.tsx') return entryCode;
      const clean = id.replaceAll('\\', '/').split('?')[0];
      for (const [suffix, source] of Object.entries(external)) if (clean.endsWith('/src' + suffix)) return source;
      if (['AuthModal', 'LandingPage', 'Onboarding'].some(name => clean.endsWith('/src/components/' + name + '.tsx'))) return 'export default () => null;';
    },
    configureServer(s) {
      s.middlewares.use(async (req, res, next) => {
        if (!['/', '/app', '/qa'].includes(req.url?.split('?')[0])) return next();
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Security-Policy', "connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:");
        res.end(await s.transformIndexHtml('/qa', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Calori · nombres · QA sintética</title></head><body><div id="root"></div><script>' + boot + '</script><script type="module" src="/__coach_names_qa.tsx"></script></body></html>'));
      });
    },
  }, react()], server: { host: '127.0.0.1', port, strictPort: true, hmr: false }, logLevel: 'warn' });
await server.listen();
console.log(JSON.stringify({ url: `http://127.0.0.1:${port}/app?case=standard&theme=light&reset=1`,
  cases: Object.keys(cases), sourceRoot: repo, syntheticOnly: true, remoteServices: false }));
if (process.argv.includes('--check')) {
  try {
    for (const route of ['/app?case=standard&theme=light&reset=1', '/__coach_names_qa.tsx',
      '/src/hooks/useAppStore.ts', '/src/components/ChatView.tsx', '/src/lib/coachMealNames.ts', '/src/components/ProfileView.tsx']) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`);
      await response.text();
      if (!response.ok) throw new Error(`Fixture route ${route}: HTTP ${response.status}`);
      console.log(JSON.stringify({ route, status: response.status }));
    }
  } finally { await server.close(); }
}
