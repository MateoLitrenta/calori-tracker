import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confirmCoachGoal } from '../src/services/coachGoals.ts';
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
