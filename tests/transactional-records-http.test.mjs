import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import {disposablePostgres,postgresUnavailable} from './helpers/security-postgres.mjs';
import {startPostgrest} from './helpers/local-postgrest.mjs';

// Native PostgreSQL/PostgREST only. Auth/Storage schemas are explicit local SQL
// stand-ins; these tests do not certify GoTrue, files, or a hosted Supabase service.
const root=resolve('.'),proposal='supabase/proposals/transactional-records-v9-2/';
const read=path=>readFileSync(resolve(root,path),'utf8');
const expand=path=>read(path).replace(/^\\set[^\n]*$/gm,'').replace(/^\\ir (\S+)\s*$/gm,(_,file)=>expand(resolve(dirname(path),file)));
const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
const dayA='10000000-0000-0000-0000-000000000001',dayB='10000000-0000-0000-0000-000000000002';
const mealA='20000000-0000-0000-0000-000000000001',mealB='20000000-0000-0000-0000-000000000002';
const workA='30000000-0000-0000-0000-000000000001',workB='30000000-0000-0000-0000-000000000002';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const meal=(patch={})=>({id:randomUUID(),description:'Synthetic meal',meal_type:'Cena',calories:450,time_str:'21:30',meal_details:'Synthetic long notes\nSecond line',photo_path:null,...patch});
const workout=(patch={})=>({id:randomUUID(),activity_name:'Synthetic walk',duration_min:30,calories_burned:120,workout_details:'Synthetic routine',time_str:'18:00',distance_km:3.5,pace_str:'8:34',...patch});
const payload=(patch={})=>({steps:6500,water_ml:1750,weight:70,meals:[meal()],workouts:[workout()],...patch});
const receiptCheck=(r,operation)=>{assert.equal(r.operation_id,operation);assert.match(r.day_id,uuid);assert.equal(typeof r.version,'string');assert.match(r.version,/^[1-9]\d*$/);assert.match(r.generation,uuid);};

test('transactional records: native PostgreSQL and real PostgREST HTTP, synthetic identities only', {timeout:300000},async t=>{
 assert.equal(postgresUnavailable,false,'Native PostgreSQL is required; a skipped test is not certification');
 const binary=resolve(process.env.SECURITY_TEST_POSTGREST_BIN||('../security-tools/postgrest/postgrest'+(process.platform==='win32'?'.exe':'')));
 assert.ok(existsSync(binary),'Native PostgREST is required; install the pinned runtime rather than skip');
 const pg=await disposablePostgres(t),sql=pg.sql;
 sql('create role anon;create role authenticated;create role service_role bypassrls;create role pgrst_login login noinherit;grant anon,authenticated to pgrst_login;');
 sql(read('tests/fixtures/staging-platform-contract.sql'));
 sql(expand('supabase/proposals/staging-v9-1/010_bootstrap.psql'));
 sql(expand('supabase/proposals/security-rls-v9-1/020_upgrade.sql'));
 sql(`insert into auth.users values('${a}'),('${b}');insert into profiles(id,user_id,name)values('${a}','${a}','Synthetic A'),('${b}','${b}','Synthetic B');
 insert into daily_logs(id,user_id,profile_id,date,steps,water_ml,weight)values('${dayA}','${a}','${a}','2026-11-01',1000,500,70),('${dayB}','${b}','${b}','2026-11-01',2000,750,78);
 insert into meals(id,user_id,daily_log_id,date,description,calories)values('${mealA}','${a}','${dayA}',null,'Legacy nullable date',100),('${mealB}','${b}','${dayB}','2026-11-01','B meal',200);
 insert into workouts(id,user_id,daily_log_id,date,activity_name,duration_min,calories_burned)values('${workA}','${a}','${dayA}',null,'Legacy walk',10,30),('${workB}','${b}','${dayB}','2026-11-01','B walk',20,60);
 insert into daily_logs(id,user_id,profile_id,date,steps,water_ml)values('10000000-0000-0000-0000-000000000003','${a}','${a}','2026-11-30',3000,250);
 insert into meals(id,user_id,daily_log_id,date,description,calories)values('20000000-0000-0000-0000-000000000003','${a}','10000000-0000-0000-0000-000000000003','2026-11-29','Legacy different child date',150);
 insert into workouts(id,user_id,daily_log_id,date,activity_name,duration_min,calories_burned)values('30000000-0000-0000-0000-000000000003','${a}','10000000-0000-0000-0000-000000000003','2026-11-28','Legacy different workout date',15,50);
 insert into storage.objects(bucket_id,name)values('meal-photos','${a}/photo.jpg'),('meal-photos','${b}/photo.jpg');`);
 sql(expand(proposal+'001_prepare.sql'));
 const server=await startPostgrest(t,pg,'postgres',binary);
 const raw=async(id,name,args={},token)=>fetch(server.url+'/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json',...(id||token?{Authorization:'Bearer '+(token??server.token(id))}:{})},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});
 const call=async(id,name,args={},token)=>{const response=await raw(id,name,args,token);return{status:response.status,data:await response.json()};};
 const successful=async(id,name,args={})=>{const r=await call(id,name,args);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;};
 const snapshot=id=>successful(id,'calori_record_snapshot_v1');
 const saveArgs=(s,date,day,patch={})=>({p_operation_id:randomUUID(),p_date:date,p_expected_version:s.records.find(r=>r.date===date)?.version??null,p_generation:s.generation,p_day:day,...patch});
 const save=async(id,args)=>{const r=await successful(id,'calori_save_daily_record_v1',args);receiptCheck(r,args.p_operation_id);return r;};
 const rejection=async(id,name,args,status,code)=>{const r=await call(id,name,args);assert.equal(r.status,status,JSON.stringify(r.data));assert.equal(r.data.code,code);return r;};
 const currentPolicies=()=>sql("select jsonb_agg(to_jsonb(p) order by tablename,policyname) from pg_policies p where schemaname='public';");
 let prepared,stalePrepared,mainPayload,mainReceipt,lostArgs,lostReceipt,beforeActivationPolicies;

 await t.test('prepare is additive: snapshot reads legacy rows with text versions and write RPCs fail closed',async()=>{
  prepared=await snapshot(a);assert.equal(prepared.protocol,'prepared');assert.match(prepared.generation,uuid);assert.equal(prepared.records[0].id,dayA);assert.equal(prepared.records[0].version,'1');
  stalePrepared=saveArgs(prepared,'2026-11-01',payload({steps:9999,meals:[],workouts:[]}));
  await rejection(a,'calori_save_daily_record_v1',stalePrepared,503,'PT503');
  await rejection(a,'calori_reset_daily_records_v1',{p_operation_id:randomUUID(),p_generation:prepared.generation},503,'PT503');
  const legacy=server.client(a);assert.ifError((await legacy.from('daily_logs').update({steps:4444}).eq('id',dayA).select('id').single()).error);
  const inserted=randomUUID();assert.ifError((await legacy.from('daily_logs').insert({id:inserted,user_id:a,profile_id:a,date:'2026-10-31'}).select('id').single()).error);
  assert.ifError((await legacy.from('daily_logs').delete().eq('id',inserted).select('id').single()).error);beforeActivationPolicies=currentPolicies();
 });
 await t.test('activation invalidates prepared snapshots, leaves data intact and changes no RLS policy',async()=>{
  sql(expand(proposal+'002_activate.sql'));assert.equal(currentPolicies(),beforeActivationPolicies);
  const atomic=await snapshot(a);assert.equal(atomic.protocol,'atomic');assert.notEqual(atomic.generation,prepared.generation);assert.notEqual(atomic.records[0].version,'1');
  await rejection(a,'calori_save_daily_record_v1',stalePrepared,409,'PT409');assert.equal((await snapshot(a)).records[0].steps,4444);
 });
 await t.test('old tabs cannot insert/update/delete records or call legacy reset; profile saving remains usable',async()=>{
  const client=server.client(a);
  for(const [table,id,changes,insert]of [
   ['daily_logs',dayA,{steps:1},{id:randomUUID(),user_id:a,profile_id:a,date:'2026-10-30'}],
   ['meals',mealA,{description:'Forbidden'},{id:randomUUID(),user_id:a,daily_log_id:dayA}],
   ['workouts',workA,{activity_name:'Forbidden'},{id:randomUUID(),user_id:a,daily_log_id:dayA}]
  ])for(const q of [client.from(table).insert(insert).select('id'),client.from(table).update(changes).eq('id',id).select('id'),client.from(table).delete().eq('id',id).select('id')]){const r=await q;assert.equal(r.status,403);assert.equal(r.error?.code,'42501');}
  const reset=await call(a,'delete_my_daily_records');assert.ok([401,403,404].includes(reset.status));
  assert.ifError((await client.from('profiles').update({name:'Synthetic A preserved'}).eq('id',a).select('id').single()).error);
 });
 await t.test('one HTTP save commits complete scalars and all nested fields, preserving nullable values',async()=>{
  mainPayload=payload({meals:[meal({photo_path:a+'/photo.jpg'}),meal({description:null,meal_type:null,calories:null,time_str:null,meal_details:null})],workouts:[workout(),workout({activity_name:null,duration_min:null,calories_burned:null,distance_km:null,pace_str:null})]});
  const before=await snapshot(a),args=saveArgs(before,'2026-11-02',mainPayload);mainReceipt=await save(a,args);
  assert.notEqual(mainReceipt.generation,before.generation);const day=(await snapshot(a)).records.find(r=>r.id===mainReceipt.day_id);assert.equal(day.version,mainReceipt.version);
  for(const key of ['steps','water_ml','weight'])assert.equal(day[key],mainPayload[key]);
  for(const [key,entries]of [['meals',mainPayload.meals],['workouts',mainPayload.workouts]])for(const entry of entries){const stored=day[key].find(r=>r.id===entry.id);for(const [field,value]of Object.entries(entry))assert.deepEqual(stored[field],value);assert.equal(stored.user_id,a);assert.equal(stored.daily_log_id,day.id);assert.equal(stored.date,'2026-11-02');}
 });
 await t.test('editing, adding and removing children is one versioned replacement without touching another owner',async()=>{
  const bBefore=await snapshot(b),s=await snapshot(a),old=s.records.find(r=>r.id===mainReceipt.day_id),created=old.meals.find(m=>m.id===mainPayload.meals[0].id).created_at;
  mainPayload={...mainPayload,steps:8000,meals:[{...mainPayload.meals[0],description:'Edited\nnotes',calories:550},meal()],workouts:[{...mainPayload.workouts[1],activity_name:'Edited walk',duration_min:45,calories_burned:180}]};
  mainReceipt=await save(a,saveArgs(s,'2026-11-02',mainPayload));const after=(await snapshot(a)).records.find(r=>r.id===mainReceipt.day_id);
  assert.equal(after.meals.length,2);assert.equal(after.workouts.length,1);assert.equal(after.meals.find(m=>m.id===mainPayload.meals[0].id).created_at,created);assert.deepEqual(await snapshot(b),bBefore);
 });
 await t.test('legacy child NULL dates and creation times survive an update of existing identifiers',async()=>{
  const s=await snapshot(a),old=s.records.find(r=>r.id===dayA),args=saveArgs(s,'2026-11-01',payload({meals:[meal({id:mealA,description:'Updated legacy'})],workouts:[workout({id:workA})]}));
  await save(a,args);const after=(await snapshot(a)).records.find(r=>r.id===dayA);assert.equal(after.meals[0].date,null);assert.equal(after.workouts[0].date,null);assert.equal(after.meals[0].created_at,old.meals[0].created_at);assert.equal(after.workouts[0].created_at,old.workouts[0].created_at);
 });
 await t.test('a water-only save preserves legacy meal and workout dates differing from their own parent day',async()=>{
  const s=await snapshot(a),old=s.records.find(r=>r.date==='2026-11-30');
  const pick=(row,keys)=>Object.fromEntries(keys.map(key=>[key,row[key]]));
  const request=payload({steps:old.steps,water_ml:1250,weight:old.weight,
   meals:old.meals.map(row=>pick(row,['id','description','meal_type','calories','time_str','meal_details','photo_path'])),
   workouts:old.workouts.map(row=>pick(row,['id','activity_name','duration_min','calories_burned','workout_details','time_str','distance_km','pace_str']))});
  await save(a,saveArgs(s,old.date,request));
  const after=(await snapshot(a)).records.find(r=>r.id===old.id);
  assert.equal(after.water_ml,1250);assert.deepEqual(after.meals,old.meals);assert.deepEqual(after.workouts,old.workouts);
  assert.equal(after.meals[0].date,'2026-11-29');assert.equal(after.workouts[0].date,'2026-11-28');
 });
 await t.test('a workout-stage exception rolls back day, meals, generation and receipt; the same operation can then succeed',async()=>{
  const before=await snapshot(a),args=saveArgs(before,'2026-11-02',payload({steps:9999,workouts:[workout({activity_name:'FAIL_ATOMIC_STAGE'})]}));
  sql("create function public.synthetic_record_failure() returns trigger language plpgsql as $$begin if NEW.activity_name='FAIL_ATOMIC_STAGE' then raise exception 'Synthetic transaction fault';end if;return NEW;end;$$;create trigger synthetic_record_failure before insert or update on workouts for each row execute function public.synthetic_record_failure();");
  try{const failed=await call(a,'calori_save_daily_record_v1',args);assert.equal(failed.status,400);assert.deepEqual(await snapshot(a),before);assert.equal(sql(`select count(*) from calori_records_private.record_operations where user_id='${a}' and operation_id='${args.p_operation_id}'`),'0');}
  finally{sql('drop trigger synthetic_record_failure on workouts;drop function public.synthetic_record_failure();');}
  const accepted=await save(a,args);assert.notEqual(accepted.generation,before.generation);assert.deepEqual(await successful(a,'calori_save_daily_record_v1',args),accepted);
 });
 await t.test('discarding a committed HTTP response then retrying identically returns one durable receipt',async()=>{
  const s=await snapshot(a);lostArgs=saveArgs(s,'2026-11-04',payload());const response=await raw(a,'calori_save_daily_record_v1',lostArgs);assert.equal(response.status,200);await response.body?.cancel();
  lostReceipt=JSON.parse(sql(`select result::text from calori_records_private.record_operations where user_id='${a}' and operation_id='${lostArgs.p_operation_id}'`));const committed=await snapshot(a);
  assert.deepEqual(await successful(a,'calori_save_daily_record_v1',structuredClone(lostArgs)),lostReceipt);assert.deepEqual(await snapshot(a),committed);assert.equal(sql(`select count(*) from calori_records_private.record_operations where user_id='${a}' and operation_id='${lostArgs.p_operation_id}'`),'1');
 });
 await t.test('reusing an operation ID with another payload or operation type is rejected without effects',async()=>{
  const before=await snapshot(a);await rejection(a,'calori_save_daily_record_v1',{...lostArgs,p_day:{...lostArgs.p_day,steps:1}},400,'22023');await rejection(a,'calori_reset_daily_records_v1',{p_operation_id:lostArgs.p_operation_id,p_generation:lostArgs.p_generation},400,'22023');assert.deepEqual(await snapshot(a),before);
 });
 await t.test('a stale day version conflicts even with the current account generation',async()=>{
  const first=await snapshot(a),old=first.records.find(r=>r.date==='2026-11-04').version;await save(a,saveArgs(first,'2026-11-04',payload()));const current=await snapshot(a);
  await rejection(a,'calori_save_daily_record_v1',saveArgs(current,'2026-11-04',payload(),{p_expected_version:old}),409,'PT409');assert.deepEqual(await snapshot(a),current);
 });
 await t.test('a save on another date invalidates an older account generation',async()=>{
  const old=await snapshot(a);await save(a,saveArgs(old,'2026-11-05',payload()));const current=await snapshot(a);await rejection(a,'calori_save_daily_record_v1',saveArgs(old,'2026-11-06',payload()),409,'PT409');assert.deepEqual(await snapshot(a),current);
 });
 await t.test('two HTTP sessions with the same generation produce one winner and one conflict',async()=>{
  const initial=await snapshot(a),args=[saveArgs(initial,'2026-11-07',payload()),saveArgs(initial,'2026-11-08',payload())];const results=await Promise.all(args.map(v=>call(a,'calori_save_daily_record_v1',v)));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(results.find(r=>r.status===409).data.code,'PT409');const after=await snapshot(a);assert.equal(after.records.filter(r=>['2026-11-07','2026-11-08'].includes(r.date)).length,1);assert.equal(sql(`select count(*) from calori_records_private.record_operations where user_id='${a}' and operation_id in('${args[0].p_operation_id}','${args[1].p_operation_id}')`),'1');
 });
 await t.test('simultaneous identical retries commit only once and both receive the same receipt',async()=>{
  const args=saveArgs(await snapshot(a),'2026-11-09',payload());const results=await Promise.all([call(a,'calori_save_daily_record_v1',args),call(a,'calori_save_daily_record_v1',args)]);assert.equal(results[0].status,200);assert.equal(results[1].status,200);assert.deepEqual(results[0].data,results[1].data);assert.equal(sql(`select count(*) from calori_records_private.record_operations where user_id='${a}' and operation_id='${args.p_operation_id}'`),'1');
 });
 await t.test('two users can use the same operation UUID without sharing records or receipts',async()=>{
  const op=randomUUID(),sa=await snapshot(a),sb=await snapshot(b),results=await Promise.all([call(a,'calori_save_daily_record_v1',saveArgs(sa,'2026-11-10',payload(),{p_operation_id:op})),call(b,'calori_save_daily_record_v1',saveArgs(sb,'2026-11-11',payload(),{p_operation_id:op}))]);
  for(const r of results)assert.equal(r.status,200,JSON.stringify(r.data));assert.notEqual(results[0].data.day_id,results[1].data.day_id);for(const owner of[a,b])for(const day of(await snapshot(owner)).records){assert.equal(day.user_id,owner);for(const child of [...day.meals,...day.workouts])assert.equal(child.user_id,owner);}assert.equal(sql(`select count(*) from calori_records_private.record_operations where operation_id='${op}'`),'2');
 });
 await t.test('forged ownership arguments and foreign child identifiers cannot transfer another user record',async()=>{
  const aBefore=await snapshot(a),bBefore=await snapshot(b);const signature=await call(a,'calori_record_snapshot_v1',{p_user_id:b});assert.equal(signature.status,404);
  for(const forged of [{...payload(),user_id:b},payload({meals:[meal({user_id:b})]})])await rejection(a,'calori_save_daily_record_v1',saveArgs(aBefore,'2026-11-12',forged),400,'22023');
  for(const p of [payload({meals:[meal({id:mealB})]}),payload({workouts:[workout({id:workB})]})])await rejection(a,'calori_save_daily_record_v1',saveArgs(aBefore,'2026-11-12',p),409,'PT409');assert.deepEqual(await snapshot(a),aBefore);assert.deepEqual(await snapshot(b),bBefore);
 });
 await t.test('photo references require own existing Storage metadata; no Storage HTTP service is claimed',async()=>{
  const s=await snapshot(a);for(const path of [b+'/photo.jpg',a+'/missing.jpg',a+'/../foreign.jpg'])await rejection(a,'calori_save_daily_record_v1',saveArgs(s,'2026-11-13',payload({meals:[meal({photo_path:path})]})),400,'22023');assert.deepEqual(await snapshot(a),s);
 });
 await t.test('invalid values, duplicate IDs and malformed UUIDs reject the entire request',async()=>{
  const s=await snapshot(a),one=meal();const invalid=[{...payload(),steps:'bad'},payload({meals:[one,one]}),payload({workouts:[workout({id:'not-a-uuid'})]}),{steps:1,water_ml:1,weight:70,meals:[]},payload({water_ml:-1})];for(const p of invalid){await rejection(a,'calori_save_daily_record_v1',saveArgs(s,'2026-11-14',p),400,'22023');assert.deepEqual(await snapshot(a),s);}
 });
 await t.test('expired, forged and anonymous JWTs cannot reach the authenticated RPC',async()=>{
  const s=await snapshot(a);for(const token of [server.token(a,{exp:Math.floor(Date.now()/1000)-60}),server.token(a).slice(0,-4)+'xxxx']){const r=await call(a,'calori_record_snapshot_v1',{},token);assert.equal(r.status,401);}const anonymous=await call(null,'calori_record_snapshot_v1');assert.ok([401,403,404].includes(anonymous.status));assert.deepEqual(await snapshot(a),s);
 });
 await t.test('reset is atomic, receipt-replayable and never resurrects old saves or affects the other owner',async()=>{
  const sa=await snapshot(a),sb=await snapshot(b),args={p_operation_id:randomUUID(),p_generation:sa.generation};const response=await raw(a,'calori_reset_daily_records_v1',args);assert.equal(response.status,200);await response.body?.cancel();const reset=await successful(a,'calori_reset_daily_records_v1',args);assert.equal(reset.deleted_days,sa.records.length);const empty=await snapshot(a);assert.equal(empty.records.length,0);assert.equal(empty.generation,reset.generation);assert.deepEqual(await successful(a,'calori_save_daily_record_v1',lostArgs),lostReceipt);assert.deepEqual(await snapshot(a),empty);assert.deepEqual(await snapshot(b),sb);assert.equal(sql(`select count(*) from storage.objects where name='${a}/photo.jpg'`),'1');assert.equal(sql(`select count(*) from profiles where id='${a}'`),'1');
 });
 await t.test('a reset/save race using one account generation has exactly one committed outcome',async()=>{
  const s=await snapshot(a),saveRequest=saveArgs(s,'2026-11-25',payload()),resetRequest={p_operation_id:randomUUID(),p_generation:s.generation};const [saved,reset]=await Promise.all([call(a,'calori_save_daily_record_v1',saveRequest),call(a,'calori_reset_daily_records_v1',resetRequest)]);assert.deepEqual([saved.status,reset.status].sort(),[200,409]);const now=await snapshot(a);assert.equal(now.records.length,saved.status===200?1:0);assert.equal(now.generation,(saved.status===200?saved:reset).data.generation);
 });
 await t.test('global versions larger than Number.MAX_SAFE_INTEGER survive HTTP as decimal text',async()=>{
  sql("select setval('calori_records_private.record_versions',9007199254740992,true);");const args=saveArgs(await snapshot(a),'2026-11-26',payload());const first=await save(a,args);assert.equal(first.version,'9007199254740993');const s=await snapshot(a);assert.equal(s.records.find(r=>r.date==='2026-11-26').version,first.version);const next=await save(a,saveArgs(s,'2026-11-26',payload()));assert.equal(next.version,'9007199254740994');
 });
 await t.test('the writer is NOLOGIN/NOBYPASSRLS and authenticated callers cannot access its private ledger',async()=>{
  assert.equal(sql("select rolcanlogin::text||'/'||rolsuper::text||'/'||rolbypassrls::text from pg_roles where rolname='calori_record_writer'"),'false/false/false');assert.equal(sql("select pg_has_role('authenticated','calori_record_writer','MEMBER')"),'f');assert.equal(sql("select has_schema_privilege('authenticated','calori_records_private','USAGE')"),'f');assert.throws(()=>sql('set role authenticated;select * from calori_records_private.record_operations;'),/permission denied/);
 });
 await t.test('actual db.ts loads, saves, edits, rejects stale drafts and resets through native PostgREST',async()=>{
  // Only GoTrue is substituted: the SDK, PostgREST transport and database are real.
  const client=server.client(a),jwt=server.token(a),otherBefore=await snapshot(b);
  globalThis.__transactionHttpClient={auth:{
   getSession:async()=>({data:{session:{access_token:jwt,user:{id:a}}},error:null}),
   getUser:async token=>{assert.equal(token,jwt);return{data:{user:{id:a}},error:null};},
  },rpc:(...args)=>client.rpc(...args),from:(...args)=>client.from(...args)};
  const original=read('src/lib/db.ts'),source=original
   .replace("import { supabase } from './supabase';",'const supabase=globalThis.__transactionHttpClient;')
   .replace("'../utils/helpers'",JSON.stringify(new URL('../src/utils/helpers.ts',import.meta.url).href));
  assert.notEqual(source,original,'Real db.ts must use the local synthetic Auth boundary');
  try{
   const db=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText).toString('base64'));
   const profile=await db.fetchUserData(a);assert.equal(profile.user_id,a);assert.equal(profile.recordProtocol,'atomic');assert.match(profile.recordGeneration,uuid);
   const initial=await db.fetchRecordSnapshot(a),date='2026-11-28';
   const draft={dateStr:date,date:new Date(date+'T12:00:00Z'),version:null,generation:initial.generation,steps:8888,water:1250,weight:71,
    meals:[{id:randomUUID(),name:'Synthetic db meal\nSecond line',type:'Cena',calories:550,time:'21:00',details:'Long notes\nKept',photo_path:a+'/photo.jpg'}],
    workouts:[{id:randomUUID(),activity:'Synthetic db walk',duration:45,calories:150,muscles:[],time:'18:00',details:'Routine',distance:3.5,pace:'12:51'}]};
   const intent=db.createRecordIntent(draft),receipt=await db.commitRecordIntent(a,intent);receiptCheck(receipt,intent.operationId);
   assert.deepEqual(await db.commitRecordIntent(a,intent),receipt,'Same app intention replays one durable receipt');
   const created=await db.fetchRecordSnapshot(a),stored=created.records[date];assert.equal(stored.version,receipt.version);assert.deepEqual(db.recordPayload(stored),db.recordPayload(draft));
   const nested=await db.fetchDailyLog(a,date);assert.deepEqual(db.recordPayload(nested),db.recordPayload(draft));
   const stale=db.createRecordIntent({...stored,steps:9999});
   const edited={...stored,water:1750,meals:[{...stored.meals[0],details:'Edited notes'}],workouts:[]};
   await db.commitRecordIntent(a,db.createRecordIntent(edited));
   await assert.rejects(db.commitRecordIntent(a,stale),error=>error.kind==='conflict');
   const after=await db.fetchRecordSnapshot(a);assert.equal(after.records[date].water,1750);assert.equal(after.records[date].meals[0].details,'Edited notes');assert.equal(after.records[date].workouts.length,0);
   const resetIntent=db.createResetIntent(after.generation),reset=await db.commitRecordIntent(a,resetIntent);assert.equal(reset.operation_id,resetIntent.operationId);
   assert.equal(Object.keys((await db.fetchRecordSnapshot(a)).records).length,0);assert.deepEqual(await snapshot(b),otherBefore);
  }finally{delete globalThis.__transactionHttpClient;}
 });
 await t.test('read-only recovery preserves snapshots, rejects new operations and never restores legacy writes',async()=>{
  const before=await snapshot(a),args=saveArgs(before,'2026-11-27',payload());sql(expand(proposal+'003_readonly_recovery.sql'));const paused=await snapshot(a);assert.equal(paused.protocol,'read_only');assert.deepEqual(paused.records,before.records);assert.equal(paused.generation,before.generation);await rejection(a,'calori_save_daily_record_v1',args,503,'PT503');await rejection(a,'calori_reset_daily_records_v1',{p_operation_id:randomUUID(),p_generation:paused.generation},503,'PT503');const direct=await server.client(a).from('daily_logs').update({steps:1}).eq('user_id',a).select('id');assert.equal(direct.error?.code,'42501');assert.deepEqual(await successful(a,'calori_save_daily_record_v1',lostArgs),lostReceipt);assert.deepEqual(await snapshot(a),paused);
 });
});
