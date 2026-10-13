import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { before, after, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import goalsHandler from '../api/coach/goals.ts';
import chatHandler from '../api/ai/chat.ts';
import { buildCoachContext } from '../src/utils/coachContext.ts';
import { coachDates } from '../src/utils/coachDates.ts';
import { evaluateCoachGoal, isActionableCoachingQuery, parseGoalValues } from '../src/utils/coachGoals.ts';
import { supabaseUrl, supabasePublishableKey } from '../src/lib/supabaseConfig.ts';

const own = '00000000-0000-0000-0000-000000000001', other = '00000000-0000-0000-0000-000000000002';
const today = new Date().toISOString().slice(0, 10);
const token = id => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: id, iss: `${supabaseUrl}/auth/v1`,
  aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'synthetic_signature'].join('.');
const values = (overrides = {}) => ({ type: 'workout_sessions', target: 3, startDate: today,
  endDate: coachDates(today, 1, -6)[0], stepThreshold: null, ...overrides });
const proposal = (overrides = {}) => ({ ...values(), operation: 'accept', id: randomUUID(), ...overrides });
const db = new PGlite();
before(async () => {
  await db.exec(`create role authenticated; create role anon; create schema auth;
    create table auth.users(id uuid primary key); insert into auth.users values ('${own}'), ('${other}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`);
  await db.exec(`create table public.daily_logs (user_id uuid, date date, steps integer);
    create table public.workouts (user_id uuid, date date);
    alter table public.daily_logs enable row level security; alter table public.workouts enable row level security;
    grant select on public.daily_logs,public.workouts to authenticated;
    create policy logs_owner on public.daily_logs for select to authenticated using(auth.uid()=user_id);
    create policy workouts_owner on public.workouts for select to authenticated using(auth.uid()=user_id);`);
  await db.exec(await readFile(new URL('../supabase/migrations/202610130001_coach_goals.sql', import.meta.url), 'utf8'));
});
after(() => db.close());
beforeEach(async () => { await db.exec('reset role; truncate public.coach_goals,public.daily_logs,public.workouts;'); });
async function login(id = own) {
  await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec('set role authenticated');
}
const insert = async (id = own, goal = proposal()) => {
  await login(id);
  return (await db.query(`insert into public.coach_goals(id,user_id,type,target,step_threshold,start_date,end_date)
    values($1,$2,$3,$4,$5,$6,$7) returning *`, [goal.id,id,goal.type,goal.target,goal.stepThreshold,goal.startDate,goal.endDate])).rows[0];
};
const serialize = rows => rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
  [key, value instanceof Date ? key === 'date' || /_date$/.test(key) ? value.toISOString().slice(0, 10) : value.toISOString() : value])));

function infrastructure(t) {
  const envs = ['AI_COACH_GOALS_ENABLED','GEMINI_API_KEY','SUPABASE_AI_SECRET_KEY','AI_TEXT_DAILY_LIMIT'];
  const oldEnv = Object.fromEntries(envs.map(key => [key,process.env[key]])), oldFetch = globalThis.fetch, oldInfo = console.info;
  const state = { modelCalls: 0, quotas: 0, reads: 0, writes: 0, logs: [], prompts: [], goalsDown: false,
    activityDown:false, activityTruncated:false,
    result: { reply: 'Plan de prueba.', actions: [], presentation: 'none', goalProposal: null } };
  process.env.AI_COACH_GOALS_ENABLED = 'true'; process.env.GEMINI_API_KEY = 'synthetic';
  process.env.SUPABASE_AI_SECRET_KEY = 'sb_secret_not_for_goals'; process.env.AI_TEXT_DAILY_LIMIT = '30';
  console.info = log => state.logs.push(log);
  globalThis.fetch = async (url, options = {}) => {
    if (url === `${supabaseUrl}/auth/v1/user`) {
      const header = options.headers.Authorization || '';
      try { return Response.json({ id: JSON.parse(Buffer.from(header.split('.')[1], 'base64url').toString()).sub }); }
      catch { return new Response('', { status: 401 }); }
    }
    if (url === `${supabaseUrl}/rest/v1/rpc/reserve_ai_quota`) { state.quotas++; return Response.json({ allowed: true, retry_after_seconds: 3600 }); }
    if (/\/rest\/v1\/(?:daily_logs|workouts)\?/.test(url)) {
      assert.equal(options.headers.apikey,supabasePublishableKey); assert.equal(options.headers.Prefer,'count=exact');
      if(state.activityDown) return new Response('private activity error',{status:500});
      const uid=JSON.parse(Buffer.from(options.headers.Authorization.split('.')[1],'base64url').toString()).sub;
      await login(uid); const table=new URL(url).pathname.split('/').at(-1), query=new URL(url).searchParams;
      const filters=query.getAll('date'), start=filters.find(value=>value.startsWith('gte.')).slice(4), end=filters.find(value=>value.startsWith('lte.')).slice(4);
      const rows=serialize((await db.query(`select * from public.${table} where user_id=$1 and date >= $2 and date <= $3`,[uid,start,end])).rows);
      return Response.json(rows,{headers:{'Content-Range':`0-${Math.max(0,rows.length-1)}/${rows.length+(state.activityTruncated?1:0)}`}});
    }
    if (url.startsWith(`${supabaseUrl}/rest/v1/coach_goals?`)) {
      assert.equal(options.headers.apikey, supabasePublishableKey);
      assert.ok(!JSON.stringify(options.headers).includes('sb_secret'));
      if (state.goalsDown) return new Response('private database details', { status: 500 });
      const uid = JSON.parse(Buffer.from(options.headers.Authorization.split('.')[1], 'base64url').toString()).sub;
      await login(uid);
      const query = new URL(url).searchParams, method = options.method ?? 'GET';
      try {
        if (method === 'POST') {
          state.writes++; const row = JSON.parse(options.body);
          const result = await db.query(`insert into public.coach_goals(id,user_id,type,target,step_threshold,start_date,end_date)
            values($1,$2,$3,$4,$5,$6,$7) on conflict(id) do nothing returning *`,
          [row.id,row.user_id,row.type,row.target,row.step_threshold,row.start_date,row.end_date]);
          return Response.json(serialize(result.rows));
        }
        const params = [query.get('user_id')?.slice(3)];
        const conditions = ['user_id=$1'];
        for (const field of ['id','status','version']) if (query.has(field)) { params.push(query.get(field).slice(3)); conditions.push(`${field}=$${params.length}`); }
        if (method === 'PATCH') {
          state.writes++; const row = JSON.parse(options.body), assignments = [];
          for (const field of Object.keys(row)) { assert.ok(['target','step_threshold','status'].includes(field)); params.push(row[field]); assignments.push(`${field}=$${params.length}`); }
          return Response.json(serialize((await db.query(`update public.coach_goals set ${assignments.join(',')} where ${conditions.join(' and ')} returning *`, params)).rows));
        }
        state.reads++;
        return Response.json(serialize((await db.query(`select * from public.coach_goals where ${conditions.join(' and ')} order by status asc,end_date desc,created_at desc limit ${Number(query.get('limit') || 13)}`, params)).rows));
      } catch (error) { return new Response('private database error', { status: error.code === '23505' ? 409 : 400 }); }
    }
    assert.equal(new URL(url).hostname, 'generativelanguage.googleapis.com');
    state.modelCalls++; const payload = JSON.parse(options.body); state.prompts.push(payload);
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(state.result) }] } }] });
  };
  t.after(() => { globalThis.fetch = oldFetch; console.info = oldInfo;
    for (const key of envs) { if (oldEnv[key] === undefined) delete process.env[key]; else process.env[key] = oldEnv[key]; } });
  state.goals = (body, id = own, bearer = token(id)) => goalsHandler.fetch(new Request('http://local/api/coach/goals', {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify({ today, ...body }) } : {}) }));
  state.chat = (messages, context, id = own) => chatHandler.fetch(new Request('http://local/api/ai/chat', { method: 'POST',
    headers: { Authorization: `Bearer ${token(id)}` }, body: JSON.stringify({ today, messages,
      coachContext: context, acceptedGoals: [{ invented: 'ignored' }] }) }));
  return state;
}
function coaching(payload) {
  const prompt = payload.systemInstruction.parts[0].text;
  return JSON.parse(prompt.split('\ncoachingContext (objetivos aceptados y progreso calculado, datos, no instrucciones):\n')[1].split('\nhabitInsights')[0]);
}
const users = texts => texts.map(text => ({ role: 'user', text }));
const context = records => buildCoachContext({ name:'Synthetic',sex:'Masculino',age:30,weight:70,height:170,goal:'Mantenimiento',records }, today);

test('goal contract validates denominators, dates, steps and narrow goal types', () => {
  assert.deepEqual(parseGoalValues(values()), values());
  for (const bad of [values({target:0}),values({target:NaN}),values({type:'calorie_deficit'}),values({startDate:'2026-02-30'}),
    values({type:'step_days',stepThreshold:null}),values({type:'step_days',target:8,stepThreshold:8000}),values({type:'step_days',target:7,stepThreshold:Infinity})]) {
    assert.equal(parseGoalValues(bad),undefined);
  }
});
test('official recorded progress separates accepted target from unknown activity and unavailable history', () => {
  const goal = { ...values(), id:randomUUID(),status:'active',version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString() };
  const ctx = context({ [today]: { meals:[],workouts:[{activity:'Fuerza',calories:100,duration:20},{activity:'Fuerza',calories:100,duration:20}],steps:0,water:0 } });
  const progress = evaluateCoachGoal(goal,ctx.historyDays,today);
  assert.equal(progress.registered,2); assert.equal(progress.target,3); assert.equal(progress.phase,'in_progress');
  assert.equal(progress.remainingToRegister,1); assert.ok(progress.limitations.includes('missing_records_do_not_confirm_noncompliance'));
  assert.equal(evaluateCoachGoal(goal,context({}).historyDays,today).classification,'recorded_progress_only');
  assert.equal(evaluateCoachGoal(goal,[],today).registered,null);
  const stepGoal = {...goal,type:'step_days',target:3,stepThreshold:8000};
  assert.equal(evaluateCoachGoal(stepGoal,context({[today]:{meals:[],workouts:[],steps:8000,water:0}}).historyDays,today).registered,1);
  assert.equal(evaluateCoachGoal({...goal,status:'cancelled'},ctx.historyDays,today).phase,'cancelled');
});
test('RLS denies other owners, anonymous reads, metadata edits and changing goal type or period', async () => {
  const row = await insert(); await login(other);
  assert.equal((await db.query('select * from public.coach_goals')).rows.length,0);
  assert.equal((await db.query("update public.coach_goals set target=2 where id=$1 returning *",[row.id])).rows.length,0);
  await assert.rejects(() => db.query(`insert into public.coach_goals(id,user_id,type,target,start_date,end_date)
    values($1,$2,'workout_sessions',3,current_date,current_date+6)`,[randomUUID(),own]),/row-level security/);
  await login();
  for (const assignment of ["user_id='00000000-0000-0000-0000-000000000002'","version=100","created_at=now()","start_date=current_date+1","type='step_days'"]) {
    await assert.rejects(() => db.query(`update public.coach_goals set ${assignment} where id=$1`,[row.id]),/permission denied/);
  }
  await db.exec('reset role; set role anon'); await assert.rejects(() => db.query('select * from public.coach_goals'),/permission denied/);
});
test('database preserves revision metadata and caps ongoing goals with explicit thresholds', async () => {
  const first = await insert();
  await db.query('update public.coach_goals set target=2 where id=$1',[first.id]);
  assert.equal((await db.query('select version from public.coach_goals where id=$1',[first.id])).rows[0].version,2);
  await db.query("update public.coach_goals set status='cancelled' where id=$1",[first.id]);
  await assert.rejects(() => db.query('update public.coach_goals set target=3 where id=$1',[first.id]),/Immutable goal/);
  for (let target=1;target<=8;target++) await insert(own,proposal({target}));
  await assert.rejects(() => insert(own,proposal({target:9})),/Too many ongoing/);
  await login(other); await assert.rejects(() => db.query(`insert into public.coach_goals(id,user_id,type,target,start_date,end_date)
    values($1,$2,'step_days',3,current_date,current_date+6)`,[randomUUID(),other]),/check constraint/);
});
test('goal API requires verified Auth and activation; confirmation is idempotent without AI quota or provider calls', async t => {
  const state=infrastructure(t), proposed=proposal();
  assert.equal((await state.goals({proposal:proposed},own,'')).status,401);
  process.env.AI_COACH_GOALS_ENABLED='false'; assert.equal((await state.goals({proposal:proposed})).status,503);
  assert.equal(state.writes,0); process.env.AI_COACH_GOALS_ENABLED='true';
  for(let i=0;i<2;i++) { const response=await state.goals({proposal:proposed}); assert.equal(response.status,200); assert.equal((await response.json()).goal.version,1); }
  await login(); assert.equal((await db.query('select * from public.coach_goals')).rows.length,1);
  assert.equal(state.quotas,0); assert.equal(state.modelCalls,0);
});
test('confirmed modifications and cancellation reject stale versions and cross-user IDs', async t => {
  const state=infrastructure(t), proposed=proposal(); await state.goals({proposal:proposed});
  const change={...proposed,operation:'update',expectedVersion:1,target:2};
  const modified=await state.goals({proposal:change}); assert.equal(modified.status,200); assert.equal((await modified.json()).goal.version,2);
  assert.equal((await state.goals({proposal:change})).status,409);
  assert.equal((await state.goals({proposal:{...change,expectedVersion:2}},other)).status,409);
  const cancelled=await state.goals({proposal:{...change,operation:'cancel',expectedVersion:2}});
  assert.equal(cancelled.status,200); assert.equal((await cancelled.json()).goal.status,'cancelled');
  assert.equal((await state.goals({proposal:{...change,expectedVersion:3}})).status,409);
  assert.equal(state.modelCalls,0);
});
test('fresh conversations and devices recover only persisted owner goals and compute progress from current records', async t => {
  const state=infrastructure(t), proposed=proposal(); await state.goals({proposal:proposed});
  await db.exec('reset role'); await db.query('insert into public.workouts values ($1,$2),($1,$2),($3,$2)',[own,today,other]);
  const ctx=context({[today]:{meals:[],workouts:[{activity:'Fuerza',calories:100,duration:20},{activity:'Fuerza',calories:100,duration:20}],steps:0,water:0}});
  for(let i=0;i<2;i++) {
    assert.equal((await state.chat(users(['¿Cómo me fue con mi objetivo?']),ctx)).status,200);
    const evidence=coaching(state.prompts.at(-1)); assert.equal(evidence.acceptedGoals[0].id,proposed.id);
    assert.equal(evidence.acceptedGoals[0].target,3); assert.equal(evidence.acceptedGoals[0].registered,2);
    assert.ok(!JSON.stringify(evidence).includes(own));
  }
  assert.equal((await state.chat(users(['¿Cuáles son mis objetivos?']),ctx,other)).status,200);
  assert.deepEqual(coaching(state.prompts.at(-1)).acceptedGoals,[]); assert.equal(state.modelCalls,3); assert.equal(state.quotas,3);
  for(const secret of [token(own),own,'Synthetic','sb_secret','private database']) assert.ok(!state.logs.join('').includes(secret));
});
test('step-day progress uses persisted entries, ignores forged client totals and refuses incomplete database reads',async t=>{
  const state=infrastructure(t), proposed=proposal({type:'step_days',target:5,stepThreshold:8000}); await state.goals({proposal:proposed});
  await db.exec('reset role'); await db.query('insert into public.daily_logs values($1,$2,8000),($3,$2,99000)',[own,today,other]);
  const forged=context({[today]:{meals:[],workouts:[],steps:99999,water:0}});
  assert.equal((await state.chat(users(['¿Cómo me fue con mi objetivo de pasos?']),forged)).status,200);
  assert.equal(coaching(state.prompts.at(-1)).acceptedGoals[0].registered,1);
  assert.equal(coaching(state.prompts.at(-1)).acceptedGoals[0].stepThreshold,8000);
  for(const field of ['activityDown','activityTruncated']) {
    state[field]=true; assert.equal((await state.chat(users(['¿Cómo me fue con el objetivo?']),forged)).status,200);
    const evidence=coaching(state.prompts.at(-1)); assert.equal(evidence.progressAvailability,'unavailable');
    assert.equal(evidence.acceptedGoals[0].registered,null);state[field]=false;
  }
  assert.equal(state.modelCalls,3);assert.equal(state.quotas,3);
});
test('suggestions remain unaccepted; invalid/foreign proposals and unavailable persistence cannot create goals', async t => {
  const state=infrastructure(t), suggested=values(); state.result.goalProposal={...suggested,operation:'accept'};
  const response=await state.chat(users(['Quiero entrenar tres veces esta semana']),context({}));
  assert.equal(response.status,200); const body=await response.json(); assert.equal(body.goalProposal.target,3);
  assert.equal(state.writes,0); await login(); assert.equal((await db.query('select * from public.coach_goals')).rows.length,0);
  state.result.goalProposal={...suggested,id:randomUUID(),operation:'cancel'};
  assert.equal((await (await state.chat(users(['Quiero cancelar un objetivo']),context({}))).json()).goalProposal,undefined);
  state.goalsDown=true; state.result.goalProposal={...suggested,operation:'accept'};
  const degraded=await state.chat(users(['Organizame la semana']),context({})); assert.equal(degraded.status,200);
  assert.equal((await degraded.json()).goalProposal,undefined); assert.equal(coaching(state.prompts.at(-1)).availability,'unavailable');
  assert.equal(state.writes,0); assert.equal(state.modelCalls,3);
});
test('actionable planning and changes preserve declared constraints, official evidence and empty record actions in one call', async t => {
  const state=infrastructure(t);
  for(const texts of [
    ['Quiero entrenar tres veces esta semana','Solo tengo 40 minutos por día','Los miércoles juego al fútbol','Organizame la semana'],
    ['Organizame la semana','¿Y si solo puedo entrenar dos días?','Cambiemos el jueves por el viernes'],
    ['Quiero mejorar mi alimentación','Prefiero comidas vegetarianas y tengo poco tiempo','¿Por qué me recomendás eso?'],
  ]) {
    const before=state.modelCalls; state.result.actions=[{type:'set_steps',estimated:false,payload:{dateStr:today,steps:99999}}];
    const response=await state.chat(users(texts),context({})); assert.equal(response.status,200); assert.deepEqual((await response.json()).actions,[]);
    const payload=state.prompts.at(-1), prompt=payload.systemInstruction.parts[0].text;
    assert.deepEqual(payload.contents.map(item=>item.parts[0].text),texts);
    assert.match(prompt,/No inventes porcentajes/); assert.match(prompt,/2–4 frases/); assert.match(prompt,/restricciones extremas/);
    assert.equal(state.modelCalls,before+1); assert.equal(state.quotas,state.modelCalls);
  }
  for(const text of ['Organizame la semana','Los miércoles juego al fútbol','Solo tengo 40 minutos','Quiero caminar más','Quiero dejar de seguir ese plan']) {
    assert.equal(isActionableCoachingQuery(users([text])),true,text);
  }
  for(const text of ['Registrá una hora de gimnasio hoy a las 18','Quiero registrar una comida para mejorar mi alimentación',
    'Comí pizza a las 21','Tomé 500 ml de agua']) assert.equal(isActionableCoachingQuery(users([text])),false,text);
  assert.equal(isActionableCoachingQuery(users(['El lunes recién tomé un café'])),false);
  assert.equal(isActionableCoachingQuery(users(['Organizame la semana','40 minutos'])),true);
  assert.equal(isActionableCoachingQuery(users(['Recién entrené gimnasio','40 minutos'])),false);
});
test('bounded goal context has measurable overhead and preserves existing message and daily-history limits',async t=>{
  const state=infrastructure(t), ctx=context({});
  await state.chat(users(['¿Cómo vengo hoy?']),ctx);
  const baseline=state.prompts.at(-1).systemInstruction.parts[0].text.length;
  for(let i=0;i<8;i++) await insert(own,proposal({target:i+1}));
  await state.chat(users(['Organizame la semana']),ctx);
  const payload=state.prompts.at(-1), prompt=payload.systemInstruction.parts[0].text;
  const growth=prompt.length-baseline;
  console.log(JSON.stringify({event:'synthetic_coaching_context_size',baselineChars:baseline,eightGoalsChars:prompt.length,growthChars:growth}));
  assert.equal(coaching(payload).acceptedGoals.length,8);assert.ok(growth<18000,`Extra characters: ${growth}`);
  assert.equal(payload.contents.length,1);assert.ok(!JSON.stringify(coaching(payload)).includes('private'));
  assert.equal(ctx.historyDays.length,60);assert.ok(JSON.stringify(ctx).length<24000);
  await state.chat(users(Array.from({length:20},()=> '¿Cómo me fue con mi objetivo?')),ctx);
  assert.equal(state.prompts.at(-1).contents.length,10);assert.equal(state.modelCalls,3);assert.equal(state.quotas,3);
});
