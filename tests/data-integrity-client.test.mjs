import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

// Actual db.ts executed with a PostgREST-shaped boundary, no remote credentials.
let state;
globalThis.__integrityDb={from(table){
  let action='select',payload,filters=[],options;
  const chain={
    select(){return chain;},or(){return chain;},eq(k,v){filters.push([k,v]);return chain;},
    insert(p){action='insert';payload=p;return chain;},update(p){action='update';payload=p;return chain;},
    delete(){action='delete';return chain;},upsert(p,o){action='upsert';payload=p;options=o;return chain;},
    single(){return run();},maybeSingle(){return run();},then(ok,fail){return run().then(ok,fail);},
  };
  async function run(){state.calls.push({table,action,payload,filters,options});return state.respond({table,action,payload,filters,options});}
  return chain;
}};
const source=(await readFile(new URL('../src/lib/db.ts',import.meta.url),'utf8'))
  .replace("import { supabase } from './supabase';",'const supabase=globalThis.__integrityDb;')
  .replace("'../utils/helpers'",JSON.stringify(new URL('../src/utils/helpers.ts',import.meta.url).href));
const db=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
const record={dateStr:'2026-10-30',steps:100,water:500,meals:[],workouts:[]};
const meal={id:'meal',name:'Content retained',type:'Cena',calories:400,details:'Multiple\nlines',photo_path:'u/photo.jpg'};
const workout={id:'workout',activity:'Walk',duration:30,calories:100,details:'Routine',muscles:[]};
const writes=[
  ()=>db.syncProfile({id:'u',activity:'Activo'}),
  ()=>db.syncAddMeal('u','log',meal,record.dateStr),()=>db.syncUpdateMeal(meal),()=>db.syncDeleteMeal(meal.id),
  ()=>db.syncAddWorkout('u','log',workout,record.dateStr),()=>db.syncUpdateWorkout(workout),()=>db.syncDeleteWorkout(workout.id),
];
test('all profile/entry writes require a returned row and propagate backend errors',async()=>{
  for(const data of [null,{}]){
    state={calls:[],respond:()=>({data,error:null})};
    for(const write of writes)await assert.rejects(write(),/confirmar/);
  }
  state={calls:[],respond:()=>({data:null,error:Error('Connection lost')})};
  for(const write of writes)await assert.rejects(write(),/Connection lost/);
  state={calls:[],respond:()=>({data:{id:'confirmed'},error:null})};
  for(const write of writes)await write();
});
test('day creation and update both reject unconfirmed writes; existing ID is preserved on success',async()=>{
  const original=console.error;console.error=()=>{};
  try{
    for(const existing of [null,{id:'existing'}]){
      state={calls:[],respond:({action})=>({data:action==='select'?existing:null,error:null})};
      assert.equal(await db.ensureDailyLog('u',record),null);
      assert.equal(state.calls.at(-1).action,existing?'update':'insert');
      state={calls:[],respond:({action,payload})=>({data:action==='select'?existing:{id:existing?.id??payload.id},error:null})};
      const id=await db.ensureDailyLog('u',record);assert.ok(id);if(existing)assert.equal(id,'existing');
    }
  }finally{console.error=original;}
});
test('concurrent profile initialization never replaces the winner with defaults',async()=>{
  const winner={id:'u',user_id:'u',name:'Existing custom name',activity_level:'Activo',age:40,weight_kg:80,height_cm:180};
  let reads=0;
  state={calls:[],respond:({table,action,options})=>{
    if(table==='daily_logs')return{data:[],error:null};
    if(action==='upsert'){
      assert.deepEqual(options,{onConflict:'id',ignoreDuplicates:true});
      return{data:null,error:null}; // Concurrent winner exists; INSERT DO NOTHING.
    }
    return{data:++reads===1?null:winner,error:null};
  }};
  const result=await db.fetchUserData('u','synthetic@example.test');
  assert.equal(result.name,winner.name);assert.equal(result.activity,'Activo');assert.equal(result.age,40);
  assert.equal(state.calls.filter(c=>c.action==='upsert').length,1);
});
test('meal/workout content remains unchanged across explicit retry after an ambiguous response',async()=>{
  let committed;
  state={calls:[],respond:({payload})=>{committed={...payload};return{data:null,error:Error('Response lost after commit')};}};
  await assert.rejects(db.syncAddMeal('u','log',meal,record.dateStr));
  assert.equal(committed.meal_details,meal.details);assert.equal(committed.photo_path,meal.photo_path);
  state.respond=({payload})=>{assert.equal(payload.id,committed.id);return{data:null,error:Error('Duplicate primary key')};};
  await assert.rejects(db.syncAddMeal('u','log',meal,record.dateStr),/Duplicate/);
  assert.equal(meal.details,'Multiple\nlines');assert.equal(state.calls.length,2,'No automatic write retries');
});
