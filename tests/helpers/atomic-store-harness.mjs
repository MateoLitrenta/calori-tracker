import {readFile} from 'node:fs/promises';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import ts from 'typescript';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const methods=['fetchUserData','syncProfile','syncAvatarPath','completeOnboarding','fetchRecordSnapshot','commitRecordIntent','createRecordIntent','createResetIntent'];
const imports={react:import.meta.resolve('react'),'../utils/helpers':new URL('../../src/utils/helpers.ts',import.meta.url).href,
 '../lib/supabase':url('export const supabase={auth:{getSession:()=>globalThis.__atomicStore.session(),onAuthStateChange:cb=>{globalThis.__atomicStore.emit=cb;return{data:{subscription:{unsubscribe(){}}}}}}};'),
 '../lib/db':url(methods.map(n=>`export const ${n}=(...a)=>globalThis.__atomicStore.db.${n}(...a);`).join('\n')),
 'react-hot-toast':url('export default {error:m=>globalThis.__atomicStore.errors.push(m),success(){}};')};
const source=await readFile(new URL('../../src/hooks/useAppStore.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText
 .replace(/from ["']([^"']+)["']/g,(_,s)=>'from '+JSON.stringify(imports[s]||import.meta.resolve(s)));
const{AppStoreProvider,useAppStore}=await import(url(code));
export {act};
export const generation='22222222-2222-4222-8222-222222222222';
export const nextGeneration='33333333-3333-4333-8333-333333333333';
export const record={generation,version:null,dateStr:'2026-11-11',date:new Date('2026-11-11T12:00:00'),meals:[],workouts:[],water:0,steps:0};
export const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
export const failure=kind=>Object.assign(Error(kind),{kind});
export async function mount(t,session=async()=>({data:{session:{user:{id:'A'}}}})){
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});const saved={};
 for(const n of ['window','document','IS_REACT_ACT_ENVIRONMENT'])saved[n]=globalThis[n];
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const state={errors:[],session,calls:[],receipts:new Map(),mutationCount:0,server:{protocol:'atomic',generation,records:{}}};
 let sequence=0;
 state.db={
  fetchUserData:async id=>({id,user_id:id,name:id,activity:'Activo',recordProtocol:'atomic',recordGeneration:state.server.generation,records:structuredClone(state.server.records)}),
  syncProfile:async()=>{},syncAvatarPath:async()=>{},completeOnboarding:async()=>{},
  fetchRecordSnapshot:async()=>structuredClone(state.server),
  createRecordIntent:r=>({kind:'save',operationId:crypto.randomUUID(),date:r.dateStr,generation:r.generation,expectedVersion:r.version??null,
   fingerprint:JSON.stringify({date:r.dateStr,steps:r.steps,water:r.water,weight:r.weight,meals:r.meals,workouts:r.workouts}),record:structuredClone(r)}),
  createResetIntent:gen=>({kind:'reset',operationId:crypto.randomUUID(),generation:gen,fingerprint:'reset'}),
  commitRecordIntent:async(owner,intent)=>{
   state.calls.push({owner,intent:structuredClone(intent)});
   if(state.receipts.has(intent.operationId))return state.receipts.get(intent.operationId);
   if(intent.generation!==state.server.generation)throw failure('conflict');
   const version=String(++sequence),newGeneration=sequence===1?nextGeneration:crypto.randomUUID();state.mutationCount++;
   state.server={...state.server,generation:newGeneration,records:intent.kind==='reset'?{}:{...state.server.records,
    [intent.date]:{...structuredClone(intent.record),version,generation:newGeneration}}};
   const receipt={operation_id:intent.operationId,generation:newGeneration,version};state.receipts.set(intent.operationId,receipt);return receipt;
  },
 };
 globalThis.__atomicStore=state;
 function Probe(){const store=useAppStore();React.useLayoutEffect(()=>{state.store=store;});return React.createElement('p',null,store.loading?'loading':store.activeProfile?.name??'signed out');}
 const{createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'));
 await act(async()=>root.render(React.createElement(AppStoreProvider,null,React.createElement(Probe))));
 t.after(async()=>{await act(()=>root.unmount());dom.window.close();for(const[n,v]of Object.entries(saved))globalThis[n]=v;});return state;
}
