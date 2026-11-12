import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const owner='11111111-1111-4111-8111-111111111111', generation='22222222-2222-4222-8222-222222222222';
const nextGeneration='33333333-3333-4333-8333-333333333333', id='44444444-4444-4444-8444-444444444444';
let state;
globalThis.__atomicDb={auth:{
  getSession:async()=>({data:{session:{access_token:state.token,user:{id:state.owner}}},error:null}),
  getUser:async token=>{assert.equal(token,state.token);return{data:{user:{id:state.owner}},error:state.authError};},
},rpc(name,args){const call={name,args:structuredClone(args)};state.calls.push(call);return{
  setHeader(k,v){call[k]=v;return this;},abortSignal(){return Promise.resolve(state.respond(call));},
};},from(){throw Error('Legacy writes/read fallback not expected');}};
const source=(await readFile(new URL('../src/lib/db.ts',import.meta.url),'utf8'))
 .replace("import { supabase } from './supabase';",'const supabase=globalThis.__atomicDb;')
 .replace("'../utils/helpers'",JSON.stringify(new URL('../src/utils/helpers.ts',import.meta.url).href));
const db=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText).toString('base64'));
const draft=()=>({dateStr:'2026-11-11',date:new Date('2026-11-11T12:00:00'),version:'9007199254740993',generation,
 steps:123,water:500,weight:70.5,meals:[{id,name:'Long\nmeal description',type:'Cena',calories:400,details:'Notes\nkept',photo_path:owner+'/meal.jpg'}],workouts:[]});
const reset=()=>{state={owner,token:'synthetic-token-A',calls:[],respond:({args})=>({data:{operation_id:args.p_operation_id,day_id:id,version:'9007199254740994',generation:nextGeneration},error:null,status:200})};};

test('atomic client sends a full owner-free payload and preserves bigint tokens as strings',async()=>{
 reset();const intent=db.createRecordIntent(draft());const receipt=await db.commitRecordIntent(owner,intent);
 assert.equal(receipt.version,'9007199254740994');assert.equal(state.calls.length,1);
 const c=state.calls[0];assert.equal(c.name,'calori_save_daily_record_v1');assert.equal(c.Authorization,'Bearer synthetic-token-A');
 assert.equal(c.args.p_expected_version,'9007199254740993');assert.equal(c.args.p_generation,generation);
 assert.deepEqual(c.args.p_day,{steps:123,water_ml:500,weight:70.5,
  meals:[{id,description:'Long\nmeal description',meal_type:'Cena',calories:400,time_str:null,meal_details:'Notes\nkept',photo_path:owner+'/meal.jpg'}],workouts:[]});
 assert.ok(!('user_id'in c.args)&&!('user_id'in c.args.p_day.meals[0]));
});
test('a lost response replays exactly one identical operation, without another intention or entry ID',async()=>{
 reset();let n=0;const reply=state.respond;state.respond=c=>++n===1?{data:null,error:{code:'',message:'lost after commit'},status:0}:reply(c);
 const intent=db.createRecordIntent(draft());await db.commitRecordIntent(owner,intent);
 assert.equal(state.calls.length,2);assert.deepEqual(state.calls[0],state.calls[1]);
});
test('network retries are bounded and an explicit retry retains the original operation',async()=>{
 reset();state.respond=()=>({data:null,error:{code:''},status:0});const intent=db.createRecordIntent(draft());
 await assert.rejects(db.commitRecordIntent(owner,intent),e=>e.kind==='ambiguous');assert.equal(state.calls.length,2);
 await assert.rejects(db.commitRecordIntent(owner,intent),e=>e.kind==='ambiguous');assert.equal(state.calls.length,4);
 assert.ok(state.calls.every(c=>c.args.p_operation_id===intent.operationId));
});
test('an authentication failure after an uncertain first write cannot discard its ambiguous intention',async()=>{
 reset();const intent=db.createRecordIntent(draft());state.respond=()=>{state.authError={status:0};return{data:null,error:{code:''},status:0};};
 await assert.rejects(db.commitRecordIntent(owner,intent),e=>e.kind==='ambiguous');assert.equal(state.calls.length,1);
 state.authError=null;state.respond=({args})=>({data:{operation_id:args.p_operation_id,day_id:id,version:'2',generation:nextGeneration},error:null,status:200});
 await db.commitRecordIntent(owner,intent);assert.equal(state.calls[1].args.p_operation_id,state.calls[0].args.p_operation_id);
});
test('a retry rejected by JWT validation before ledger lookup preserves uncertainty',async()=>{
 reset();let n=0;state.respond=()=>++n===1?{data:null,error:{code:''},status:0}:{data:null,error:{code:'PGRST301'},status:401};
 await assert.rejects(db.commitRecordIntent(owner,db.createRecordIntent(draft())),e=>e.kind==='ambiguous');assert.equal(state.calls.length,2);
});
test('uncertainty survives a later explicit click whose authentication fails before dispatch',async()=>{
 reset();const intent=db.createRecordIntent(draft());state.respond=()=>({data:null,error:{code:''},status:0});
 await assert.rejects(db.commitRecordIntent(owner,intent),e=>e.kind==='ambiguous');const original=state.calls[0].args.p_operation_id;
 state.authError={status:0};await assert.rejects(db.commitRecordIntent(owner,intent),e=>e.kind==='ambiguous');assert.equal(state.calls.length,2);
 state.authError=null;state.respond=({args})=>({data:{operation_id:args.p_operation_id,day_id:id,version:'2',generation:nextGeneration},error:null,status:200});
 await db.commitRecordIntent(owner,intent);assert.equal(state.calls[2].args.p_operation_id,original);
});
test('conflicts, inactive protocol and invalid input never trigger an automatic replay',async()=>{
 for(const[code,status,kind]of[['PT409',409,'conflict'],['PT503',503,'inactive'],['22023',400,'invalid']]){
  reset();state.respond=()=>({data:null,error:{code},status});await assert.rejects(db.commitRecordIntent(owner,db.createRecordIntent(draft())),e=>e.kind===kind);assert.equal(state.calls.length,1);
 }
});
test('account change or expired authentication stops before any RPC',async()=>{
 reset();state.owner='other-account';await assert.rejects(db.commitRecordIntent(owner,db.createRecordIntent(draft())),e=>e.kind==='session');assert.equal(state.calls.length,0);
 reset();state.authError={status:401};await assert.rejects(db.commitRecordIntent(owner,db.createRecordIntent(draft())),e=>e.kind==='session');assert.equal(state.calls.length,0);
});
test('malformed receipts never confirm success; original intention remains usable',async()=>{
 reset();state.respond=()=>({data:{operation_id:'different',generation:nextGeneration},error:null,status:200});
 await assert.rejects(db.commitRecordIntent(owner,db.createRecordIntent(draft())),e=>e.kind==='ambiguous');
});
test('snapshot validates ownership and maps versions and generation without losing details',async()=>{
 reset();const row={id,user_id:owner,date:'2026-11-11',version:'9007199254740994',steps:123,water_ml:500,weight:70.5,
 meals:[{id,user_id:owner,daily_log_id:id,description:'Long\ntext',meal_type:'Cena',calories:400,meal_details:'Notes',photo_path:owner+'/meal.jpg'}],workouts:[]};
 state.respond=()=>({data:{protocol:'atomic',generation:nextGeneration,records:[row]},error:null,status:200});
 const s=await db.fetchRecordSnapshot(owner);assert.equal(s.records['2026-11-11'].version,row.version);assert.equal(s.records['2026-11-11'].generation,nextGeneration);assert.equal(s.records['2026-11-11'].meals[0].details,'Notes');
 row.meals[0].user_id='foreign';await assert.rejects(db.fetchRecordSnapshot(owner),e=>e.kind==='invalid');
});
test('reset has its own durable intention and does not use the legacy delete RPC',async()=>{
 reset();const intent=db.createResetIntent(generation);await db.commitRecordIntent(owner,intent);
 assert.equal(state.calls[0].name,'calori_reset_daily_records_v1');assert.deepEqual(state.calls[0].args,{p_operation_id:intent.operationId,p_generation:generation});
});
test('modern RPC versions must be decimal strings, never already-rounded JavaScript numbers or arrays',async()=>{
 for(const version of [9007199254740993,['1']]){
  reset();state.respond=()=>({data:{protocol:'atomic',generation,records:[{id,user_id:owner,date:'2026-11-11',version,meals:[],workouts:[]}]},error:null,status:200});
  await assert.rejects(db.fetchRecordSnapshot(owner),e=>e.kind==='invalid');
  const intent=db.createRecordIntent(draft());state.respond=()=>({data:{operation_id:intent.operationId,day_id:id,version,generation},error:null,status:200});
  await assert.rejects(db.commitRecordIntent(owner,intent),e=>e.kind==='ambiguous');
 }
});
test('saving another day field preserves empty strings and nullable legacy child fields',()=>{
 const r={...draft(),water:777,meals:[{id,name:'',type:'Cena',calories:null,time:'',details:'',photo_path:null}],
  workouts:[{id,activity:null,duration:null,calories:null,muscles:[],details:'',time:'',distance:0,pace:''}]};
 const p=db.recordPayload(r);assert.equal(p.meals[0].description,'');assert.equal(p.meals[0].time_str,'');assert.equal(p.meals[0].meal_details,'');
 assert.equal(p.meals[0].calories,null);assert.equal(p.workouts[0].time_str,'');assert.equal(p.workouts[0].workout_details,'');assert.equal(p.workouts[0].pace_str,'');assert.equal(p.workouts[0].distance_km,0);
});
