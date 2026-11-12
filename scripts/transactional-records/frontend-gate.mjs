// Manual local-stack gate. Only DOM/toast presentation is adapted; Auth, db.ts,
// the shared React store and every persistence request use the real local client.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname,extname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import ts from 'typescript';

const sourceRoot=fileURLToPath(new URL('../../src/',import.meta.url));
const dataURL=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');

async function withRealStore(client,owner,check){
 const target=new URL(client.supabaseUrl);
 assert.ok(['127.0.0.1','localhost'].includes(target.hostname)&&target.protocol==='http:',
  'This gate may only contact an isolated local Supabase stack');
 const key='__caloriRealStoreGate',previous=globalThis[key];
 const context={client,messages:[]};globalThis[key]=context;
 const cache=new Map();
 async function compile(file){
  if(cache.has(file))return cache.get(file);
  if(file===resolve(sourceRoot,'lib/supabase.ts')){
   const url=dataURL(`export const supabase=globalThis.${key}.client;`);cache.set(file,url);return url;
  }
  const source=await readFile(file,'utf8');
  let code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,
   target:ts.ScriptTarget.ES2023,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const imports=new Set([...code.matchAll(/(?:from\s+|import\()['"]([^'"]+)['"]/g)].map(m=>m[1]));
  for(const name of imports){
   let url;
   if(name==='react-hot-toast')url=dataURL(`const capture=(...args)=>globalThis.${key}.messages.push(args);export default {error:capture,success:capture};`);
   else if(name.startsWith('.')){
    let path=resolve(dirname(file),name);
    if(!extname(path)){
     try{await readFile(path+'.ts');path+='.ts';}catch{path+='.tsx';}
    }
    url=await compile(path);
   }else url=import.meta.resolve(name);
   code=code.replaceAll(`'${name}'`,JSON.stringify(url)).replaceAll(`"${name}"`,JSON.stringify(url));
  }
  // A separate module instance binds each mount to its own legitimate session.
  const url=dataURL(code+'\n// local gate '+crypto.randomUUID());cache.set(file,url);return url;
 }
 const dom=new JSDOM('<div id="root"></div>',{url:'http://127.0.0.1/calori-local-gate'});
 const globals=['window','document','HTMLElement','MutationObserver','localStorage'];
 const saved=new Map(globals.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 for(const name of globals)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:dom.window[name]});
 const oldAct=globalThis.IS_REACT_ACT_ENVIRONMENT;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 let root;
 try{
  const {AppStoreProvider,useAppStore}=await import(await compile(resolve(sourceRoot,'hooks/useAppStore.ts')));
  let state;
  function Probe(){const current=useAppStore();React.useEffect(()=>{state=current;});return null;}
  root=createRoot(document.getElementById('root'));
  await act(async()=>root.render(React.createElement(AppStoreProvider,null,React.createElement(Probe))));
  for(let i=0;i<150&&(!state||state.loading);i++)await act(async()=>{await new Promise(done=>setTimeout(done,50));});
  assert.equal(state?.loading,false,'The real store did not finish loading the Auth session/profile');
  assert.equal(state.user?.id,owner);assert.equal(state.activeProfile?.user_id,owner);
  await check({store:()=>state,run:async callback=>{let result;await act(async()=>{result=await callback();});return result;},messages:context.messages});
 }finally{
  if(root)await act(async()=>root.unmount());dom.window.close();
  for(const[name,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
  globalThis.IS_REACT_ACT_ENVIRONMENT=oldAct;
  if(previous===undefined)delete globalThis[key];else globalThis[key]=previous;
 }
}

export async function verifyPreparedFrontend({client,owner}){
 await withRealStore(client,owner,async({store,run,messages})=>{
  const before=structuredClone(store().activeProfile.records);
  assert.equal(store().activeProfile.recordProtocol,'prepared');
  const date='2026-12-22';assert.equal(before[date],undefined,'Use an empty synthetic day');
  const draft={dateStr:date,date:new Date(date),version:null,generation:store().activeProfile.recordGeneration,
   steps:1234,water:750,weight:70,meals:[],workouts:[]};
  const saved=await run(()=>store().updateRecord(date,draft));
  assert.equal(saved,false);assert.deepEqual(store().activeProfile.records,before);
  assert.ok(messages.some(args=>String(args[0]).includes('no estaba habilitado')));
  const actual=await client.from('daily_logs').select('id').eq('date',date);
  assert.ifError(actual.error);assert.deepEqual(actual.data,[]);
 });
 return {preparedFrontend:'passed',actualReactStore:true,actualDbModule:true,actualAuthHTTP:true};
}

export async function verifyAtomicFrontend({client,owner}){
 await withRealStore(client,owner,async({store,run,messages})=>{
  assert.equal(store().activeProfile.recordProtocol,'atomic');
  const date='2026-12-23';assert.equal(store().activeProfile.records[date],undefined,'Use an empty synthetic day');
  const draft={dateStr:date,date:new Date(date),version:null,generation:store().activeProfile.recordGeneration,
   steps:4321,water:1250,weight:70,meals:[{id:crypto.randomUUID(),name:'Synthetic frontend meal',
    type:'Cena',calories:400,details:'Long notes\nPreserved by the real client'}],workouts:[]};
  assert.equal(await run(()=>store().updateRecord(date,draft)),true);
  const saved=structuredClone(store().activeProfile.records[date]);
  assert.equal(saved.steps,draft.steps);assert.equal(saved.meals[0].id,draft.meals[0].id);
  assert.equal(saved.meals[0].details,draft.meals[0].details);assert.equal(typeof saved.version,'string');
  // A separate real HTTP RPC commits before this store's stale draft.
  const snapshot=await client.rpc('calori_record_snapshot_v1');assert.ifError(snapshot.error);
  const changed=await client.rpc('calori_save_daily_record_v1',{p_operation_id:crypto.randomUUID(),p_date:date,
   p_expected_version:saved.version,p_generation:snapshot.data.generation,
   p_day:{steps:9999,water_ml:1500,weight:70,meals:[],workouts:[]}});assert.ifError(changed.error);
  const staleDraft={...saved,water:1750},unchanged=structuredClone(staleDraft);
  assert.equal(await run(()=>store().updateRecord(date,staleDraft)),false);
  assert.deepEqual(staleDraft,unchanged,'A failed conflict must not mutate the caller draft');
  assert.equal(store().activeProfile.records[date].steps,9999);
  assert.equal(store().activeProfile.records[date].water,1500);
  assert.ok(messages.some(args=>String(args[0]).includes('otra pestaña o dispositivo')));
 });
 return {atomicFrontend:'passed',actualReactStore:true,actualDbModule:true,conflictReread:'passed'};
}
