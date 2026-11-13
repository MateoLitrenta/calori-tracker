import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Local browser QA only. This server does not launch or control a browser.
// App, HomeView, DailyPanel, Heatmap, ChartsView and CSS are product sources.
// Auth, record writer, Storage and AI are isolated synthetic boundaries.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const before = process.argv.includes('--before');
const base = '5a74e7279c77a7d1dc25fb5604d5fa0d657d6bf5';
const phase = before ? 'before' : 'after';
let root = repo;
if (before) {
  root = path.resolve(repo, '../home-v10-1-1-baseline');
  mkdirSync(root, { recursive: true });
  if (!existsSync(path.join(root, 'src'))) {
    const archive = path.join(root, 'baseline.tar');
    execFileSync('git', ['archive', '--format=tar', '--output', archive, base, 'src', 'public', 'index.html', 'postcss.config.js', 'tailwind.config.js', 'package.json'], { cwd: repo });
    execFileSync('tar', ['-xf', archive, '-C', root]);
  }
  if (!existsSync(path.join(root, 'node_modules'))) symlinkSync(path.join(repo, 'node_modules'), path.join(root, 'node_modules'), 'junction');
}
assert.ok(existsSync(path.join(repo, 'node_modules/vite/dist/node/index.js')), 'Install the locked project dependencies first');
const { createServer } = await import(pathToFileURL(path.join(repo, 'node_modules/vite/dist/node/index.js')));
const { default: react } = await import(pathToFileURL(path.join(repo, 'node_modules/@vitejs/plugin-react/dist/index.js')));
const { default: ts } = await import(pathToFileURL(path.join(repo, 'node_modules/typescript/lib/typescript.js')));
// Tailwind v3 resolves content globs from cwd, including for the frozen baseline.
process.chdir(root);
const TODAY = '2026-11-13';
const generation = '22222222-2222-4222-8222-222222222222';
const record = (dateStr, values = {}) => ({ dateStr, date: dateStr + 'T12:00:00', meals: [], workouts: [], steps: 0, water: 0, generation, version: '1', ...values });
const food = (id, name, calories, type = 'Almuerzo', time = '13:00') => ({ id, name, calories, type, time, details: 'Registro sintético de QA' });
const exercise = (id, activity, duration, calories, time) => ({ id, activity, duration, calories, time, muscles: [], details: 'Registro sintético de QA' });
const recordsA = {
  [TODAY]: record(TODAY, { meals: [food('a-breakfast', 'Yogur, fruta y avena', 380, 'Desayuno', '08:30'), food('a-lunch', 'Arroz con verduras y pollo', 650), food('a-snack', 'Tostadas con queso', 220, 'Merienda', '16:00')], workouts: [exercise('a-gym', 'Gimnasio', 45, 250, '10:00'), exercise('a-walk', 'Caminata', 25, 100, '15:00')], water: 1750, steps: 6300, weight: 72.8 }),
  '2026-11-12': record('2026-11-12', { meals: [food('a-yesterday', 'Comida de ayer', 2100)], workouts: [exercise('a-football', 'Fútbol 5', 60, 420, '18:00')], water: 2250, steps: 8750, weight: 73.2 }),
  '2026-11-11': record('2026-11-11', { water: 500, steps: 1900 }),
  '2026-11-09': record('2026-11-09', { meals: [food('a-monday', 'Almuerzo del lunes', 740)], water: 1250, steps: 4100 }),
  '2026-11-01': record('2026-11-01', { meals: [food('a-november', 'Comida de noviembre', 1950)], workouts: [exercise('a-gym-boundary', 'Gimnasio', 40, 220, '10:00')], water: 1500, steps: 5000 }),
  '2026-10-31': record('2026-10-31', { meals: [food('a-october', 'Comida de octubre', 2300)], workouts: [exercise('a-football-boundary', 'Fútbol', 50, 350, '12:00')], water: 2000, steps: 7600 }),
};
const profile = (owner, name, records) => ({ id: owner, user_id: owner, name, age: 30, sex: 'Masculino', height: 175, weight: 73, activity: 'Moderado', goal: 'Mantenimiento', onboarding_completed: true, avatar_path: null, recordProtocol: 'atomic', recordGeneration: generation, records });
const profiles = { A: profile('synthetic-home-a', 'Alex', recordsA), B: profile('synthetic-home-b', 'Sol', { [TODAY]: record(TODAY, { water: 250, steps: 800 }) }) };
const boot = `(() => {
  const today=${JSON.stringify(TODAY)}, initial=${JSON.stringify(profiles)}, generation=${JSON.stringify(generation)};
  const params=new URLSearchParams(location.search), phase=${JSON.stringify(phase)};
  const fixtureKey='calori-home-qa-fixtures-'+phase, accountKey='calori-home-qa-account-'+phase, controlsKey='calori-home-qa-controls-'+phase;
  const NativeDate=Date; class FixedDate extends NativeDate { constructor(...args){super(...(args.length?args:[today+'T15:00:00Z']));} static now(){return new NativeDate(today+'T15:00:00Z').getTime();} } window.Date=FixedDate;
  if(params.has('theme'))localStorage.setItem('calori-theme',params.get('theme'));
  if(params.has('controls'))localStorage.setItem(controlsKey,params.get('controls'));
  document.documentElement.classList.toggle('dark',localStorage.getItem('calori-theme')==='dark');
  if(params.get('reset')==='1'){localStorage.removeItem(fixtureKey);localStorage.removeItem(accountKey);}
  let saved;try{saved=JSON.parse(localStorage.getItem(fixtureKey)||'null');}catch{}
  const qa={phase,today,profiles:saved||initial,listeners:new Set(),revision:0,controlsHidden:localStorage.getItem(controlsKey)==='0',controlsKey,writes:[],aiCalls:[],failed:false,externalRequests:0,account:params.get('account')||localStorage.getItem(accountKey)||'A'};
  if(!qa.profiles[qa.account])qa.account='A';
  qa.notify=()=>{qa.revision++;qa.listeners.forEach(fn=>fn());};
  qa.makeStore=()=>({user:{id:qa.profiles[qa.account].user_id,email:'synthetic@example.test'},activeProfile:qa.profiles[qa.account],avatarRevision:0,loading:false,habitDrafts:null,
    signOut:async()=>{},completeOnboarding:async()=>{},updateRecord:async(date,value,options)=>{
      const owner=qa.account;qa.writes.push({owner,date,record:structuredClone(value),status:'pending'});const call=qa.writes.at(-1);
      if(qa.failed||date!==value.dateStr||date>today){call.status='failed';options?.onFailure?.({kind:'invalid',message:'Fallo sintético de QA. No se guardó.'});qa.notify();return false;}
      const canonical={...structuredClone(value),date:date+'T12:00:00',generation,version:String(Number(value.version||0)+1)};
      qa.profiles={...qa.profiles,[owner]:{...qa.profiles[owner],records:{...qa.profiles[owner].records,[date]:canonical}}};
      localStorage.setItem(fixtureKey,JSON.stringify(qa.profiles));call.status='confirmed';qa.store=qa.makeStore();options?.onConfirmed?.(canonical,generation);qa.notify();return true;
    }});
  qa.switchAccount=account=>{qa.account=account;localStorage.setItem(accountKey,account);qa.store=qa.makeStore();qa.notify();};
  qa.reset=()=>{qa.profiles=structuredClone(initial);qa.writes=[];qa.aiCalls=[];qa.failed=false;localStorage.removeItem(fixtureKey);qa.store=qa.makeStore();qa.notify();};
  qa.store=qa.makeStore();window.__homeQA=qa;
  // No credential/session/storage/API request may escape the local QA origin.
  const fetchLocal=window.fetch.bind(window);window.fetch=(input,init)=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.origin!==location.origin){qa.externalRequests++;return Promise.reject(Error('Remote requests blocked in local synthetic QA'));}return fetchLocal(input,init);};
})();`;
const external = {
  '/hooks/useAppStore.ts': `import{useSyncExternalStore}from'react';export function useAppStore(){return useSyncExternalStore(fn=>{window.__homeQA.listeners.add(fn);return()=>window.__homeQA.listeners.delete(fn)},()=>window.__homeQA.store);}`,
  '/lib/supabase.ts': `export const supabase={auth:{getSession:async()=>({data:{session:null}})},storage:{from:()=>({createSignedUrl:async()=>({data:null,error:null}),upload:async()=>({error:Error('Storage disabled in QA')})})}};`,
  '/services/aiTransport.ts': `export class AIRequestError extends Error{};export async function requestAI(body){window.__homeQA.aiCalls.push(body);window.__homeQA.notify();return body.mode==='estimate'?{estimated:true,calories:body.estimateType==='workout'?220:450,assumptions:['Estimación sintética de QA'],description:'Comida sintética'}:{reply:'Respuesta sintética de QA',actions:[],presentation:'none'};}`,
  '/services/coachGoals.ts': `export class CoachGoalsError extends Error{};export async function fetchCoachGoals(){return{goals:[],hasMore:false}};export async function confirmCoachGoal(){throw Error('No goal writes in home QA')}`,
};
const blank = ['AuthModal','LandingPage','Onboarding','ProfileView'];
const entry = `import React,{useState,useSyncExternalStore}from'react';import{createRoot}from'react-dom/client';import App from'/src/App.tsx';import{ThemeProvider}from'/src/components/ThemeProvider.tsx';import'/src/index.css';
function Controls(){const q=window.__homeQA;useSyncExternalStore(fn=>{q.listeners.add(fn);return()=>q.listeners.delete(fn)},()=>q.revision);const[hidden,setHidden]=useState(q.controlsHidden);return hidden?null:<details style={{position:'fixed',right:8,top:8,zIndex:99999,maxWidth:300,background:'#fff',color:'#111',border:'1px solid #999',padding:8,font:'12px sans-serif'}}><summary style={{minHeight:28}}>Prueba sintética · ${phase}</summary><p>Sin servicios remotos. Cuenta {q.account}. Guardados: {q.writes.filter(x=>x.status==='confirmed').length}. IA simulada: {q.aiCalls.length}.</p><button onClick={()=>q.switchAccount('A')}>Cuenta A</button> <button onClick={()=>q.switchAccount('B')}>Cuenta B</button> <button onClick={()=>q.reset()}>Restablecer fixtures</button><p><label><input type='checkbox' onChange={e=>{q.failed=e.target.checked}}/>Simular fallo de guardado</label></p><button onClick={()=>{localStorage.setItem(q.controlsKey,'0');setHidden(true);}}>Ocultar controles de prueba</button><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(q.writes.map(x=>({owner:x.owner,date:x.date,status:x.status})),null,2)}</pre></details>}
createRoot(document.getElementById('root')).render(<ThemeProvider><App/><Controls/></ThemeProvider>);`;
const entryCode = ts.transpileModule(entry, { compilerOptions: { module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 } }).outputText;
const port=Number(process.argv.find(value=>value.startsWith('--port='))?.split('=')[1] || (before?5181:5182));
// The baseline links the same installed dependencies, but each source tree must
// own its optimizer cache. Sharing node_modules/.vite can invalidate the other
// server's dependency URLs and return 504s instead of mounting the real App.
const cacheDir = path.resolve(repo, '../home-v10-1-1-qa-cache', phase);
const server=await createServer({root,cacheDir,configFile:false,plugins:[{name:'synthetic-home-boundaries',enforce:'pre',
  resolveId(id){if(id==='/__home_qa_entry.tsx')return'\0home-qa-entry.tsx';},
  load(id){if(id==='\0home-qa-entry.tsx')return entryCode;const clean=id.replaceAll('\\','/').split('?')[0];for(const[suffix,source]of Object.entries(external))if(clean.endsWith('/src'+suffix))return source;if(blank.some(name=>clean.endsWith('/src/components/'+name+'.tsx')))return'export default()=>null;';},
  configureServer(s){s.middlewares.use(async(req,res,next)=>{if(!['/qa','/app','/'].includes(req.url?.split('?')[0]))return next();res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy',"connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:");res.end(await s.transformIndexHtml('/qa','<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Calori — QA sintética '+phase+'</title></head><body><div id="root"></div><script>'+boot+'</script><script type="module" src="/__home_qa_entry.tsx"></script></body></html>'));});},
},react()],server:{host:'127.0.0.1',port,strictPort:true,hmr:false},logLevel:'warn'});
await server.listen();
console.log(JSON.stringify({phase,baseCommit:base,url:`http://127.0.0.1:${port}/qa?controls=0&theme=light`,controlsUrl:`http://127.0.0.1:${port}/qa`,sourceRoot:root,syntheticOnly:true,remoteServices:false}));
