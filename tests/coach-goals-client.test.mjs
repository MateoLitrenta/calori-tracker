import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confirmCoachGoal, fetchCoachGoals, CoachGoalsError } from '../src/services/coachGoals.ts';
import { supabase } from '../src/lib/supabase.ts';

const proposal={operation:'accept',id:'00000000-0000-0000-0000-000000000055',type:'step_days',target:5,
  stepThreshold:8000,startDate:'2026-10-13',endDate:'2026-10-19'};
const saved={...proposal,status:'active',version:1,createdAt:'2026-10-13T12:00:00Z',updatedAt:'2026-10-13T12:00:00Z'};
function mock(t) {
  const oldSession=supabase.auth.getSession,oldFetch=globalThis.fetch;
  const state={calls:0,session:{access_token:'synthetic-token',user:{id:'owner'}},response:Response.json({goal:saved})};
  supabase.auth.getSession=async()=>({data:{session:state.session},error:null});
  globalThis.fetch=async(url,options)=>{state.calls++;state.url=url;state.options=options;return state.response;};
  t.after(()=>{supabase.auth.getSession=oldSession;globalThis.fetch=oldFetch;}); return state;
}
test('confirmed goal uses the current owner session, compact whitelisted payload and no AI call',async t=>{
  const state=mock(t); const goal=await confirmCoachGoal({...proposal,user_id:'other',privateNotes:'not sent'},'2026-10-13','owner');
  assert.equal(goal.target,5);assert.equal(state.url,'/api/coach/goals');assert.equal(state.calls,1);
  assert.equal(state.options.headers.Authorization,'Bearer synthetic-token');
  assert.deepEqual(JSON.parse(state.options.body),{today:'2026-10-13',proposal});
});
test('session changes reject goal confirmation before any write',async t=>{
  const state=mock(t);state.session.user.id='other';
  await assert.rejects(()=>confirmCoachGoal(proposal,'2026-10-13','owner'),/sesión cambió/);assert.equal(state.calls,0);
});
test('Auth refresh exceptions do not expose session details or send a goal write',async t=>{
  const state=mock(t);supabase.auth.getSession=async()=>{throw new Error('private token details');};
  await assert.rejects(()=>confirmCoachGoal(proposal,'2026-10-13','owner'),error=>/sesión/.test(error.message)&&!error.message.includes('private'));
  assert.equal(state.calls,0);
});
test('conflicts and private backend failures do not retry or claim success',async t=>{
  const state=mock(t);
  for(const status of [409,500]) {state.response=Response.json({error:'private database secret'}, {status});
    await assert.rejects(()=>confirmCoachGoal(proposal,'2026-10-13','owner'),error=>!error.message.includes('private'));}
  assert.equal(state.calls,2);
});
test('unchanged revision and invalid success payload cannot confirm an update',async t=>{
  const state=mock(t);
  await assert.rejects(()=>confirmCoachGoal({...proposal,operation:'update',expectedVersion:1},'2026-10-13','owner'),/no confirmó/);
  state.response=Response.json({goal:{...saved,id:'00000000-0000-0000-0000-000000000066'}});
  await assert.rejects(()=>confirmCoachGoal(proposal,'2026-10-13','owner'),/no confirmó/);
});

test('goal list uses the current owner bearer, no cache, no model call and rejects incomplete or malformed lists', async t => {
  const state=mock(t);
  state.response=Response.json({goals:[saved],hasMore:true});
  const result=await fetchCoachGoals('owner');
  assert.equal(result.goals[0].target,5); assert.equal(result.hasMore,true);
  assert.equal(state.options.cache,'no-store'); assert.equal(state.options.headers.Authorization,'Bearer synthetic-token');
  assert.equal(state.options.body,undefined); assert.equal(state.url,'/api/coach/goals');
  for(const payload of [{goals:[]},{goals:[saved,{...saved}] ,hasMore:false},{goals:[{...saved,target:0}],hasMore:false},{}]) {
    state.response=Response.json(payload);
    await assert.rejects(()=>fetchCoachGoals('owner'),/consultar/);
  }
});

test('disabled flag and a changed account during a list read never expose previous goals', async t => {
  const state=mock(t);
  state.response=Response.json({error:'private',code:'goals_disabled'},{status:503});
  await assert.rejects(()=>fetchCoachGoals('owner'),error=>error instanceof CoachGoalsError && error.code==='goals_disabled' && !error.message.includes('private'));
  globalThis.fetch=async()=>{state.session.user.id='other';return Response.json({goals:[saved],hasMore:false});};
  await assert.rejects(()=>fetchCoachGoals('owner'),/sesión cambió/);
});
