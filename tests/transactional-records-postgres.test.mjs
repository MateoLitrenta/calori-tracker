import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {disposablePostgres,postgresUnavailable} from './helpers/security-postgres.mjs';

// Real disposable PostgreSQL; Auth/Storage are explicit SQL contract shims, not services.
const root=resolve('.');
const read=p=>readFileSync(resolve(root,p),'utf8');
const expand=p=>read(p).replace(/^\\set[^\n]*$/gm,'').replace(/^\\ir\s+(\S+)\s*$/gm,(_,child)=>expand(resolve(dirname(p),child)));
const proposal='supabase/proposals/transactional-records-v9-2/';
const prepare=expand(proposal+'001_prepare.sql'),activate=expand(proposal+'002_activate.sql'),recovery=expand(proposal+'003_readonly_recovery.sql');
const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const login=id=>`set role authenticated;set "request.jwt.claim.sub"=${quote(id)};`;
const day=(extra={})=>({steps:100,water_ml:200,weight:null,meals:[],workouts:[],...extra});
const meal=(extra={})=>({id:randomUUID(),description:'Synthetic meal',meal_type:'Cena',calories:100,time_str:null,meal_details:null,photo_path:null,...extra});
const workout=(extra={})=>({id:randomUUID(),activity_name:'Synthetic workout',duration_min:20,calories_burned:100,workout_details:null,time_str:null,distance_km:null,pace_str:null,...extra});
const save=(id,generation,date,version,payload,op=randomUUID())=>`${login(id)}select public.calori_save_daily_record_v1('${op}','${date}',${version===null?'null':quote(version)},'${generation}',${quote(JSON.stringify(payload))}::jsonb);`;
const reset=(id,generation,op=randomUUID())=>`${login(id)}select public.calori_reset_daily_records_v1('${op}','${generation}');`;
const jsonRows=s=>s.split(/\r?\n/).filter(l=>l.startsWith('{')).map(l=>JSON.parse(l));

test('transactional records candidate: native PostgreSQL lifecycle, RLS and concurrency',
 {skip:postgresUnavailable,timeout:240000},async t=>{
 const pg=await disposablePostgres(t),{sql,session,until}=pg;
 sql('create role anon;create role authenticated;create role service_role bypassrls;');
 sql(read('tests/fixtures/staging-platform-contract.sql'));
 sql("set calori.staging_bootstrap='empty-synthetic-only';"+read('supabase/proposals/staging-v9-1/000_initial_schema.sql'));
 for(const name of readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort())sql(read('supabase/migrations/'+name));
 sql(expand('supabase/proposals/security-rls-v9-1/020_upgrade.sql'));
 sql(`insert into auth.users values('${a}'),('${b}');`);
 for(const id of [a,b])sql(login(id)+`insert into public.profiles(id,user_id,name)values('${id}','${id}','Synthetic');`);
 const legacy=randomUUID(),legacyMeal=randomUUID(),datedMeal=randomUUID(),datedWorkout=randomUUID();
 sql(login(a)+`insert into daily_logs(id,user_id,profile_id,date,steps,water_ml,weight)values('${legacy}','${a}','${a}','2026-11-01',null,null,null);
  insert into meals(id,user_id,daily_log_id,date,description,calories)values('${legacyMeal}','${a}','${legacy}',null,null,null),('${datedMeal}','${a}','${legacy}','2026-10-31',null,null);
  insert into workouts(id,user_id,daily_log_id,date,activity_name)values('${datedWorkout}','${a}','${legacy}','2026-10-30',null);`);
 const snapshot=id=>JSON.parse(sql(login(id)+'select public.calori_record_snapshot_v1();'));
 const stateHash=()=>sql("select md5(jsonb_build_array((select jsonb_agg(to_jsonb(d)order by id)from daily_logs d),(select jsonb_agg(to_jsonb(m)order by id)from meals m),(select jsonb_agg(to_jsonb(w)order by id)from workouts w),(select jsonb_agg(to_jsonb(s)order by user_id)from calori_records_private.owner_state s),(select jsonb_agg(to_jsonb(o)order by user_id,operation_id)from calori_records_private.record_operations o))::text)");
 await t.test('prepare is transactional and keeps legacy clients, nullable data and eight CASCADE relationships',()=>{
  assert.throws(()=>sql(prepare.replace(/commit;\s*$/i,'select 1/0;commit;')),/division by zero/);
  assert.equal(sql("select to_regnamespace('calori_records_private')is null and not exists(select 1 from pg_roles where rolname='calori_record_writer')"),'t');
  sql(prepare);
  assert.equal(sql("select count(*) from pg_constraint where contype='f' and confdeltype='c' and conrelid=any(array['profiles'::regclass,'daily_logs'::regclass,'meals'::regclass,'workouts'::regclass])"),'8');
  const s=snapshot(a);assert.equal(s.protocol,'prepared');assert.equal(s.records[0].steps,null);assert.equal(s.records[0].meals[0].description,null);
  assert.equal(s.records[0].version,'1');
  assert.throws(()=>sql(save(a,s.generation,'2026-11-02',null,day())),/PT503.*RECORD_PROTOCOL_NOT_ACTIVE/s);
  sql(login(a)+`update daily_logs set steps=1555 where id='${legacy}';insert into daily_logs(user_id,profile_id,date)values('${a}','${a}','2026-11-02');`);
  assert.equal(sql(login(a)+"select version from daily_logs where date='2026-11-02'"),'1');
  // SET ROLE checks SESSION USER: replace the synthetic superuser session first.
  assert.throws(()=>sql('set session authorization authenticated;set role calori_record_writer'),/permission denied/);
  assert.throws(()=>sql(login(a)+'select * from calori_records_private.record_operations'),/permission denied/);
  assert.throws(()=>sql('set role anon;select public.calori_record_snapshot_v1()'),/permission denied/);
  assert.throws(()=>sql('set role authenticated;reset "request.jwt.claim.sub";select public.calori_record_snapshot_v1()'),/28000.*AUTHENTICATION_REQUIRED/s);
  assert.equal(sql("select not rolcanlogin and not rolsuper and not rolbypassrls from pg_roles where rolname='calori_record_writer'"),'t');
 });
 let prepared;
 await t.test('activation waits for snapshot global lock, invalidates prepared CAS and preserves rows/profiles',async()=>{
  prepared=snapshot(a);snapshot(b);
  const before=sql("select jsonb_agg(to_jsonb(d)-'version' order by id)from daily_logs d");
  const hold=session('begin;'+login(a)+"select public.calori_record_snapshot_v1();select 'snapshot_holding';\n");
  await until(()=>hold.out.includes('snapshot_holding'),'Snapshot holds shared protocol lock');
  const active=session("set application_name='activate_records_test';"+activate+'\n');active.child.stdin.end();
  await until(()=>sql("select exists(select 1 from pg_stat_activity where application_name='activate_records_test' and wait_event_type='Lock')")==='t','Activation waits before table locks');
  hold.child.stdin.end('commit;');assert.equal((await hold.done).code,0);
  const result=await active.done;assert.equal(result.code,0,result.err);
  assert.equal(sql("select jsonb_agg(to_jsonb(d)-'version' order by id)from daily_logs d"),before);
  assert.equal(snapshot(a).protocol,'atomic');assert.notEqual(snapshot(a).generation,prepared.generation);
  assert.throws(()=>sql(save(a,prepared.generation,'2026-11-01','1',day())),/PT409.*RECORD_CONFLICT/s);
  for(const table of ['daily_logs','meals','workouts'])assert.throws(()=>sql(login(a)+`delete from ${table}`),/permission denied/);
  assert.throws(()=>sql(login(a)+`update daily_logs set steps=1 where id='${legacy}'`),/permission denied/);
  assert.throws(()=>sql(login(a)+'select public.delete_my_daily_records()'),/permission denied/);
  sql(login(a)+`update profiles set name='Still compatible' where id='${a}'`);
  assert.equal(sql(login(a)+`select name from profiles where id='${a}'`),'Still compatible');
  assert.throws(()=>sql(activate),/not prepared/);
 });
 await t.test('water-only save preserves finite legacy child dates differing from the parent day',()=>{
  const s=snapshot(a),r=s.records.find(x=>x.id===legacy);
  const pick=(row,keys)=>Object.fromEntries(keys.map(key=>[key,row[key]??null]));
  const payload={steps:r.steps,water_ml:500,weight:r.weight,
   meals:r.meals.map(m=>pick(m,['id','description','meal_type','calories','time_str','meal_details','photo_path'])),
   workouts:r.workouts.map(w=>pick(w,['id','activity_name','duration_min','calories_burned','workout_details','time_str','distance_km','pace_str']))};
  const receipt=JSON.parse(sql(save(a,s.generation,'2026-11-01',r.version,payload)));
  assert.equal(receipt.day_id,legacy);
  assert.equal(sql(`select date::text from meals where id='${datedMeal}'`),'2026-10-31');
  assert.equal(sql(`select date::text from workouts where id='${datedWorkout}'`),'2026-10-30');
  assert.equal(sql(`select water_ml from daily_logs where id='${legacy}'`),'500');
 });
 let receipt,submitted;
 const originalOp=randomUUID();
 await t.test('atomic nullable save, canonical payload, injection text and lost-response replay',()=>{
  const s=snapshot(a),existing=s.records.find(r=>r.id===legacy);
  submitted=day({steps:null,water_ml:null,weight:null,meals:[meal({id:legacyMeal,description:null,calories:null,meal_details:"'); delete from public.profiles; --"})],workouts:[workout({activity_name:null,duration_min:null,calories_burned:null})]});
  const query=save(a,s.generation,'2026-11-01',existing.version,submitted,originalOp);
  receipt=JSON.parse(sql(query));assert.equal(typeof receipt.version,'string');assert.equal(receipt.day_id,legacy);assert.notEqual(receipt.generation,s.generation);
  assert.deepEqual(JSON.parse(sql(query)),receipt);
  assert.equal(sql(`select date is null and description is null and calories is null from meals where id='${legacyMeal}'`),'t');
  assert.equal(sql('select count(*)from profiles'),'2');
  assert.equal(sql(`select count(*) from calori_records_private.record_operations where operation_id='${originalOp}'`),'1');
  assert.throws(()=>sql(save(a,s.generation,'2026-11-01',existing.version,day(),originalOp)),/22023.*OPERATION_ID_REUSED/s);
  const foreign=snapshot(b);assert.equal(foreign.records.length,0);
  assert.equal(sql(login(b)+`select count(*)from meals where id='${legacyMeal}'`),'0');
 });
 await t.test('invalid owner fields, values, photos and cross-account entry IDs never partially persist',()=>{
  const s=snapshot(a),version=s.records.find(r=>r.id===legacy).version;
  const bad=[day({user_id:b}),day({steps:-1}),day({water_ml:1.5}),day({steps:2147483648}),day({weight:0}),day({meals:[meal({user_id:b})]}),day({meals:[meal({photo_path:`${b}/foreign.jpg`})]}),day({meals:[meal({photo_path:`${a}/missing.jpg`})]})];
  for(const payload of bad){const before=stateHash();assert.throws(()=>sql(save(a,s.generation,'2026-11-01',version,payload)),/22023/);assert.equal(stateHash(),before);}
  sql(login(a)+`insert into storage.objects(bucket_id,name)values('meal-photos','${a}/own.jpg')`);
  const bState=snapshot(b),bMeal=meal();
  const bReceipt=JSON.parse(sql(save(b,bState.generation,'2026-11-03',null,day({meals:[bMeal]}))));assert.ok(bReceipt.day_id);
  const before=stateHash();assert.throws(()=>sql(save(a,s.generation,'2026-11-01',version,day({meals:[bMeal]}))),/PT409.*RECORD_CONFLICT/s);assert.equal(stateHash(),before);
  const good=JSON.parse(sql(save(a,s.generation,'2026-11-01',version,day({meals:[meal({photo_path:`${a}/own.jpg`})]}))));assert.ok(good.version);
 });
 await t.test('failure midway rolls back day/children/generation/receipt; same operation can be retried',()=>{
  const s=snapshot(a),v=s.records.find(r=>r.id===legacy).version,op=randomUUID();
  const data=day({steps:999,meals:[meal()],workouts:[workout()]});
  sql("create function public.synthetic_record_failure()returns trigger language plpgsql as $$begin raise exception 'synthetic child failure';end$$;create trigger synthetic_record_failure before insert on workouts for each row execute function public.synthetic_record_failure()");
  const before=stateHash();assert.throws(()=>sql(save(a,s.generation,'2026-11-01',v,data,op)),/synthetic child failure/);assert.equal(stateHash(),before);
  sql('drop trigger synthetic_record_failure on workouts;drop function public.synthetic_record_failure()');
  const saved=JSON.parse(sql(save(a,s.generation,'2026-11-01',v,data,op)));assert.ok(saved.version);
  assert.equal(sql(`select count(*)from calori_records_private.record_operations where operation_id='${op}'`),'1');
 });
 await t.test('two independent saves serialize; stale generation/version rejects after winner commit',async()=>{
  const s=snapshot(a),v=s.records.find(r=>r.id===legacy).version;
  const first=session('begin;'+save(a,s.generation,'2026-11-01',v,day({steps:777}))+"select 'winner_holding';\n");
  await until(()=>first.out.includes('winner_holding'),'Winner saves inside an uncommitted transaction');
  const second=session("set application_name='record_stale_test';"+save(a,s.generation,'2026-11-01',v,day({water_ml:999}))+'\n');second.child.stdin.end();
  await until(()=>sql("select exists(select 1 from pg_stat_activity where application_name='record_stale_test' and wait_event_type='Lock')")==='t','Stale writer waits on owner lock');
  first.child.stdin.end('commit;');assert.equal((await first.done).code,0);
  const result=await second.done;assert.notEqual(result.code,0);assert.match(result.err,/PT409.*RECORD_CONFLICT/s);
  assert.equal(snapshot(a).records.find(r=>r.id===legacy).steps,777);
 });
 await t.test('concurrent identical retries return one receipt; versions beyond JS safe range stay text',async()=>{
  sql("select setval('calori_records_private.record_versions',9007199254740993,false)");
  const s=snapshot(a),op=randomUUID(),payload=day({meals:[meal()],workouts:[workout()]});
  const query=save(a,s.generation,'2026-11-04',null,payload,op);
  const first=session('begin;'+query+"select 'retry_holding';\n");await until(()=>first.out.includes('retry_holding'),'First request waits before commit');
  const second=session(query+'\n');second.child.stdin.end();
  first.child.stdin.end('commit;');const x=await first.done,y=await second.done;assert.equal(x.code,0,x.err);assert.equal(y.code,0,y.err);
  const one=jsonRows(x.out)[0],two=jsonRows(y.out)[0];assert.deepEqual(one,two);assert.equal(one.version,'9007199254740993');
  assert.equal(snapshot(a).records.find(r=>r.date==='2026-11-04').version,one.version);
  assert.equal(sql(`select count(*)from calori_records_private.record_operations where operation_id='${op}'`),'1');
 });
 let beforeReset,resetReceipt,resetOp;
 await t.test('reset CAS and receipts survive reset; stale empty-day saves cannot resurrect records',()=>{
  beforeReset=snapshot(a);resetOp=randomUUID();resetReceipt=JSON.parse(sql(reset(a,beforeReset.generation,resetOp)));
  assert.equal(snapshot(a).records.length,0);assert.notEqual(resetReceipt.generation,beforeReset.generation);
  assert.deepEqual(JSON.parse(sql(reset(a,beforeReset.generation,resetOp))),resetReceipt);
  assert.throws(()=>sql(save(a,beforeReset.generation,'2026-11-04',null,day())),/PT409.*RECORD_CONFLICT/s);
  assert.throws(()=>sql(save(a,beforeReset.generation,'2026-11-04',null,day(),resetOp)),/22023.*OPERATION_ID_REUSED/s);
  assert.equal(snapshot(b).records.length,1);
  assert.equal(sql(`select exists(select 1 from calori_records_private.record_operations where operation_id='${originalOp}')`),'t');
 });
 await t.test('safe recovery preserves isolation, history and closed legacy writes',()=>{
  sql(recovery);assert.equal(snapshot(a).protocol,'read_only');
  const before=stateHash();assert.throws(()=>sql(save(a,snapshot(a).generation,'2026-11-05',null,day())),/PT503.*RECORD_WRITES_PAUSED/s);assert.equal(stateHash(),before);
  assert.throws(()=>sql(reset(a,snapshot(a).generation)),/PT503.*RECORD_WRITES_PAUSED/s);
  assert.deepEqual(JSON.parse(sql(reset(a,beforeReset.generation,resetOp))),resetReceipt);
  assert.throws(()=>sql(login(a)+"insert into daily_logs(user_id,date)values('"+a+"','2026-11-06')"),/permission denied/);
  assert.equal(sql("select count(*)from pg_policy where polname='security_owner_gate'"),'4');
  assert.equal(snapshot(b).records.length,1);
 });
});
