import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import ts from 'typescript';
import { globalSupabase, installGlobalFixture } from '../../../scripts/fitness-global/fixture.mjs';

// A local-only visual fixture. It serves the real App, views, CSS, AI transport
// and account-owned conversation store. Only Auth, remote APIs and writes are
// synthetic. No browser is launched or controlled by this script.
const repo = process.argv.find(value => value.startsWith('--source='))?.slice('--source='.length) || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
process.chdir(repo);
const portAt = process.argv.indexOf('--port');
const port = Number(process.argv.find(value => value.startsWith('--port='))?.split('=')[1] || (portAt >= 0 ? process.argv[portAt + 1] : null) || process.env.PORT || 5173);
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
cases.long[0].payload.calories = 1100;
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
  const history = params.get('conversation') || 'short';
  if (params.get('reset') === '1') {
    const short = [
      { id: 'fixture-intro-user', role: 'user', text: 'Ayudame a completar las comidas de hoy.' },
      { id: 'fixture-intro-bot', role: 'bot', text: 'Podemos registrar una comida por vez. Contame qué comiste y a qué hora.' }
    ];
    const long = Array.from({length: 14}, (_, i) => ({ id: 'fixture-history-' + i, role: i % 2 ? 'bot' : 'user',
      text: 'Mensaje de prueba ' + (i + 1) + '. ' + (i % 2 ? 'Este texto sintético permite comprobar que la lectura se conserva al cambiar la altura de una tarjeta. '.repeat(8) : 'Consulta breve del historial.') }));
    localStorage.setItem('calori:assistant:messages:' + initial.user_id + ':' + today, JSON.stringify(history === 'long' ? long : history === 'none' ? [] : short));
  }
  let saved;
  try { saved = JSON.parse(localStorage.getItem(fixtureKey) || 'null'); } catch {}
  const qa = { phase, today, profiles: saved || { A: initial }, account: 'A', listeners: new Set(), revision: 0,
    writes: [], aiCalls: [], failed: false, externalRequests: 0, scenario,
    controlsHidden: params.get('controls') === '0', holdSave: false, releaseSave: null };
  qa.notify = () => { qa.revision++; qa.listeners.forEach(fn => fn()); };
  qa.makeStore = () => ({ user: { id: initial.user_id, email: 'synthetic@example.test' },
    activeProfile: qa.profiles.A, avatarRevision: 0, loading: false, habitDrafts: null,
    signOut: async () => {}, completeOnboarding: async () => {},
    updateRecord: async (date, value, options) => {
      const call = { owner: 'A', date, record: structuredClone(value), status: 'pending' };
      qa.writes.push(call);
      if (qa.holdSave) await new Promise(resolve => { qa.releaseSave = resolve; qa.notify(); });
      else await new Promise(resolve => setTimeout(resolve, 650));
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
    <summary style={{minHeight:28}}>Prueba sintética de confirmación</summary>
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
    <label style={{display:'block', marginBlock:12}}><input type="checkbox" checked={qa.holdSave}
      onChange={event => { qa.holdSave = event.target.checked; qa.notify(); }}/>
      Mantener guardado pendiente</label>
    <button type="button" disabled={!qa.releaseSave} onClick={() => { qa.releaseSave?.(); qa.releaseSave = null; qa.notify(); }}>Resolver guardado pendiente</button>
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
  define: { __CALORI_PREVIEW_COMMIT__: JSON.stringify('local-confirmation-qa') },
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
        const parsed = new URL(req.url || '/', 'http://fixture.local');
        if (parsed.pathname === '/review') {
          const width = parsed.searchParams.get('width') === '375' ? 375 : 1440;
          const height = width === 375 ? 812 : 900;
          const theme = parsed.searchParams.get('theme') === 'light' ? 'light' : 'dark';
          const conversation = ['short','long','none'].includes(parsed.searchParams.get('conversation')) ? parsed.searchParams.get('conversation') : 'short';
          const controls = parsed.searchParams.get('controls') === '1' ? '1' : '0';
          const iframeUrl = '/app?case=long&theme=' + theme + '&conversation=' + conversation + '&reset=1&controls=' + controls;
          res.setHeader('Content-Type', 'text/html');
          res.end('<!doctype html><html><head><meta charset="utf-8"><title>Calori · confirmación · QA sintética</title><style>body{margin:0;background:#111;color:#fff;font:14px sans-serif;}header{padding:8px;min-height:32px}iframe{display:block;border:0;background:#fff;}a{color:#9cf;margin-right:12px}</style></head><body><header>Viewport sintético ' + width + ' × ' + height + ' · ' + theme + ' · ' + conversation + ' <a href="/review?width=375&theme=' + theme + '&conversation=' + conversation + '">Móvil</a><a href="/review?width=1440&theme=' + theme + '&conversation=' + conversation + '">Escritorio</a><a href="/review?width=' + width + '&theme=' + (theme === 'dark' ? 'light' : 'dark') + '&conversation=' + conversation + '">Cambiar tema</a></header><iframe id="qa-frame" title="Calori con datos sintéticos" width="' + width + '" height="' + height + '" src="' + iframeUrl + '"></iframe></body></html>');
          return;
        }
        if (!['/', '/app', '/qa'].includes(parsed.pathname)) return next();
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Security-Policy', "connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:");
        res.end(await s.transformIndexHtml('/qa', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Calori · confirmación · QA sintética</title></head><body><div id="root"></div><script>' + boot + '</script><script type="module" src="/__coach_names_qa.tsx"></script></body></html>'));
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
