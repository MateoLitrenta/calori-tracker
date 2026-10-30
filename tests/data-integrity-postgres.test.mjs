import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {disposablePostgres,postgresUnavailable} from './helpers/disposable-postgres.mjs';

const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
const login=id=>`set role authenticated; set "request.jwt.claim.sub"='${id}';`;
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const baseline=read('supabase/proposals/data-integrity-v9-1/001_clean_baseline.sql');
const atomic=read('supabase/proposals/data-integrity-v9-1/002_atomic_records.sql');
const bootstrap=`create schema auth; create table auth.users(id uuid primary key);
  insert into auth.users values('${a}'),('${b}');
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
  create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
  alter table storage.objects enable row level security; grant usage on schema storage to authenticated,anon;
  grant select,insert,update,delete on storage.objects to authenticated;
  alter default privileges in schema public grant all on tables to authenticated,anon;`;
const profile=id=>`insert into public.profiles(id,user_id,name,age,gender,height_cm,weight_kg,goal)
  values('${id}','${id}','Synthetic',30,'Masculino',170,70,'Mantenimiento');`;
const day=(extra={})=>({steps:100,water_ml:500,weight:70,meals:[],workouts:[],...extra});
const meal=(extra={})=>({id:randomUUID(),description:'Synthetic meal',meal_type:'Cena',calories:450,...extra});
const workout=(extra={})=>({id:randomUUID(),activity_name:'Synthetic walk',duration_min:30,calories_burned:100,...extra});
const call=(id,date,version,payload,op=randomUUID())=>`${login(id)} select public.save_daily_record_v1('${op}','${date}',${version??'null'},'${JSON.stringify(payload).replaceAll("'","''")}'::jsonb);`;

test('local PostgreSQL: schema, RLS, legacy failures and proposed atomic protocol',
  {skip:postgresUnavailable,timeout:180000},async t=>{
  const {sql,session,until}=await disposablePostgres(t);
  sql('create role authenticated; create role anon; create role service_role; create database integrity_failure;');
  sql(bootstrap);sql(bootstrap,'integrity_failure');
  await t.test('clean baseline rolls back completely if any statement fails',()=>{
    assert.throws(()=>sql(baseline.replace(/commit;\s*$/i,'select 1/0; commit;'),'integrity_failure'),/division by zero/);
    assert.equal(sql("select to_regclass('public.profiles') is null",'integrity_failure'),'t');
  });
  sql(baseline);sql(baseline,'integrity_failure');
  for(const file of readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()){
    const migration=read('supabase/migrations/'+file);sql(migration);sql(migration,'integrity_failure');
  }
  sql(login(b)+profile(b));
  await t.test('two identities: profile CRUD and every base-table ownership policy',()=>{
    sql(login(a)+profile(a));
    assert.equal(sql(login(a)+'select count(*) from public.profiles'),'1');
    assert.equal(sql(login(a)+`update public.profiles set name='other' where id='${b}' returning id;`),'');
    assert.equal(sql(login(a)+`delete from public.profiles where id='${b}' returning id;`),'');
    assert.throws(()=>sql(login(a)+profile(b)),/row-level security|duplicate key/);
    sql(login(a)+`update public.profiles set name='Mine' where id='${a}'; delete from public.profiles where id='${a}';`);
    sql(login(a)+profile(a));
    const foreignLog=randomUUID();
    sql(login(b)+`insert into public.daily_logs(id,user_id,profile_id,date) values('${foreignLog}','${b}','${b}','2026-10-01');`);
    for(const table of ['daily_logs','meals','workouts']){
      const ownId=randomUUID(),otherId=table==='daily_logs'?foreignLog:randomUUID();
      const ownLog=table==='daily_logs'?ownId:randomUUID();
      if(table!=='daily_logs')sql(login(a)+`insert into public.daily_logs(id,user_id,profile_id,date) values('${ownLog}','${a}','${a}','${table==='meals'?'2026-10-02':'2026-10-03'}');`);
      const date=table==='meals'?'2026-10-02':table==='workouts'?'2026-10-03':'2026-10-04';
      const insert=(id,owner,log,d)=>table==='daily_logs'?
        `insert into public.daily_logs(id,user_id,profile_id,date) values('${id}','${owner}','${owner}','${d}');`:
        `insert into public.${table}(id,user_id,daily_log_id,date,${table==='meals'?'description,meal_type,calories':'activity_name,duration_min,calories_burned'})
        values('${id}','${owner}','${log}','${d}',${table==='meals'?"'Meal','Cena',400":"'Walk',30,100"});`;
      if(table!=='daily_logs')sql(login(b)+insert(otherId,b,foreignLog,'2026-10-01'));
      sql(login(a)+insert(ownId,a,ownLog,date));
      assert.equal(sql(login(a)+`select count(*) from public.${table} where user_id='${b}'`),'0');
      const field=table==='daily_logs'?'steps':table==='meals'?'calories':'calories_burned';
      assert.equal(sql(login(a)+`update public.${table} set ${field}=25 where id='${otherId}' returning id;`),'');
      assert.equal(sql(login(a)+`delete from public.${table} where id='${otherId}' returning id;`),'');
      assert.throws(()=>sql(login(a)+insert(randomUUID(),b,foreignLog,'2026-10-01')),/row-level security/);
      assert.throws(()=>sql(login(a)+`update public.${table} set user_id='${b}' where id='${ownId}';`),/row-level security|check constraint/);
      assert.equal(sql(login(a)+`update public.${table} set ${field}=25 where id='${ownId}' returning id;`),ownId);
      assert.equal(sql(login(a)+`delete from public.${table} where id='${ownId}' returning id;`),ownId);
      assert.throws(()=>sql(`set role anon; select * from public.${table};`),/permission denied/);
    }
    assert.throws(()=>sql(login(a)+`insert into public.meals(id,user_id,daily_log_id,date,description,meal_type,calories)
      values('${randomUUID()}','${a}','${foreignLog}','2026-10-01','Cross link','Cena',100);`),/foreign key/);
    assert.equal(sql(login(b)+`select count(*) from public.profiles where name='Synthetic'`),'1');
  });
  await t.test('concurrent profile initialization preserves the winning custom settings',async()=>{
    sql(login(a)+`delete from public.profiles where id='${a}';`);
    const first=session('begin; '+login(a)+profile(a)+`update public.profiles set name='Configured',age=42,activity_level='Activo' where id='${a}'; select 'holding_profile';\n`);
    await until(()=>first.out.includes('holding_profile'),'Winning profile is still uncommitted');
    const second=session(login(a)+`set application_name='integrity_profile'; select count(*) from public.profiles where id='${a}'; `+
      profile(a).replace(/;$/,' on conflict(id) do nothing;')+`select name||':'||age||':'||activity_level from public.profiles where id='${a}';\n`);
    second.child.stdin.end();
    await until(()=>sql("select exists(select 1 from pg_stat_activity where application_name='integrity_profile' and wait_event_type='Lock')")==='t','Other initializer waits on the profile identity');
    first.child.stdin.end('commit;');assert.equal((await first.done).code,0);
    const result=await second.done;assert.equal(result.code,0);assert.deepEqual(result.out.split(/\r?\n/),['0','Configured:42:Activo']);
  });
  await t.test('actual versioned Storage policies isolate both photo buckets, including rename',()=>{
    for(const [bucket,suffix]of [['avatars','profile.jpg'],['meal-photos','entry.jpg']]){
      sql(login(b)+`insert into storage.objects(bucket_id,name) values('${bucket}','${b}/${suffix}');`);
      sql(login(a)+`insert into storage.objects(bucket_id,name) values('${bucket}','${a}/${suffix}');`);
      assert.equal(sql(login(a)+`select count(*) from storage.objects where bucket_id='${bucket}'`),'1');
      assert.throws(()=>sql(login(a)+`insert into storage.objects(bucket_id,name) values('${bucket}','${b}/other.jpg');`),/row-level security/);
      assert.throws(()=>sql(login(a)+`update storage.objects set name='${b}/${suffix}' where name='${a}/${suffix}'`),/row-level security/);
      assert.equal(sql(login(a)+`update storage.objects set name=name where name='${b}/${suffix}' returning name;`),'');
      assert.equal(sql(login(a)+`delete from storage.objects where name='${b}/${suffix}' returning name;`),'');
      assert.equal(sql(login(a)+`update storage.objects set name=name where name='${a}/${suffix}' returning name;`),`${a}/${suffix}`);
      assert.equal(sql(login(a)+`delete from storage.objects where name='${a}/${suffix}' returning name;`),`${a}/${suffix}`);
      assert.equal(sql(`select public from storage.buckets where id='${bucket}'`),'f');
    }
  });
  const legacyLog=randomUUID(),w1=randomUUID(),w2=randomUUID();
  sql(login(a)+`insert into public.daily_logs(id,user_id,profile_id,date,steps) values('${legacyLog}','${a}','${a}','2026-10-05',100);
    insert into public.workouts(id,user_id,daily_log_id,date,activity_name,duration_min,calories_burned) values
    ('${w1}','${a}','${legacyLog}','2026-10-05','One',10,50),('${w2}','${a}','${legacyLog}','2026-10-05','Two',20,100);`);
  await t.test('legacy reproduction: two tabs/devices overwrite stale scalar fields without a version',async()=>{
    const first=session(login(a)+`select steps from public.daily_logs where id='${legacyLog}';\n`);
    const second=session(login(a)+`select steps from public.daily_logs where id='${legacyLog}';\n`);
    await until(()=>first.out.includes('100')&&second.out.includes('100'),'Both connections read the old day');
    first.child.stdin.end(`update public.daily_logs set steps=1000,water_ml=0 where id='${legacyLog}';`);assert.equal((await first.done).code,0);
    second.child.stdin.end(`update public.daily_logs set steps=100,water_ml=500 where id='${legacyLog}';`);assert.equal((await second.done).code,0);
    assert.equal(sql(`select steps||':'||water_ml from public.daily_logs where id='${legacyLog}'`),'100:500');
  });
  await t.test('legacy reproduction: day/child and workout failures leave earlier requests committed; retry duplicates reject',()=>{
    sql(login(a)+`update public.daily_logs set steps=5000 where id='${legacyLog}'`);
    assert.throws(()=>sql(login(a)+`insert into public.meals(id,user_id,daily_log_id,date,description,meal_type,calories)
      values('${randomUUID()}','${a}','${legacyLog}','2026-10-05',null,'Cena',100)`),/not-null/);
    assert.equal(sql(`select steps from public.daily_logs where id='${legacyLog}'`),'5000');
    sql(login(a)+`update public.workouts set calories_burned=70 where id='${w1}'`);
    assert.throws(()=>sql(login(a)+`update public.workouts set activity_name=null where id='${w2}'`),/not-null/);
    assert.equal(sql(`select calories_burned from public.workouts where id='${w1}'`),'70');
    assert.equal(sql(`select activity_name from public.workouts where id='${w2}'`),'Two');
    assert.throws(()=>sql(login(a)+`insert into public.workouts select * from public.workouts where id='${w1}'`),/duplicate key/);
    assert.equal(sql(`select count(*) from public.workouts where id='${w1}'`),'1');
  });
  await t.test('atomic proposal rolls back DDL/ACL changes and preserves existing rows on successful upgrade',()=>{
    assert.throws(()=>sql(atomic.replace(/commit;\s*$/i,'select 1/0; commit;'),'integrity_failure'),/division by zero/);
    assert.equal(sql("select to_regprocedure('public.save_daily_record_v1(uuid,date,bigint,jsonb)') is null",'integrity_failure'),'t');
    assert.equal(sql("select count(*) from information_schema.columns where table_name='daily_logs' and column_name='version'",'integrity_failure'),'0');
    const before=sql('select jsonb_agg(to_jsonb(w) order by id) from public.workouts w');
    sql('grant update(steps) on public.daily_logs to authenticated; grant insert(description) on public.meals to authenticated;');
    sql(atomic);
    assert.equal(sql('select jsonb_agg(to_jsonb(w) order by id) from public.workouts w'),before);
    assert.equal(sql(`select steps from public.daily_logs where id='${legacyLog}'`),'5000');
    for(const table of ['daily_logs','meals','workouts'])assert.throws(()=>sql(login(a)+`delete from public.${table}`),/permission denied/);
    assert.throws(()=>sql(login(a)+`update public.daily_logs set steps=1 where id='${legacyLog}'`),/permission denied/);
    assert.throws(()=>sql(login(a)+"insert into public.meals(description) values('Unversioned')"),/permission denied/);
    assert.throws(()=>sql(`set role anon; select public.save_daily_record_v1(null,null,null,null)`),/permission denied/);
    assert.throws(()=>sql(`set role authenticated; reset "request.jwt.claim.sub"; select public.save_daily_record_v1(null,null,null,null)`),/Authentication required/);
    assert.throws(()=>sql(login(a)+'select * from integrity_private.record_operations'),/permission denied/);
  });
  let receipt;
  const item=meal({meal_details:'Long unchanged note',photo_path:`${a}/food.jpg`}),one=workout({workout_details:'Sets unchanged',time_str:'18:20',distance_km:4.2,pace_str:'7:00'}),two=workout();
  const original=day({meals:[item],workouts:[one,two]});
  const op=randomUUID();
  await t.test('atomic save and lost-response retry have one operation receipt and one copy of each entry',()=>{
    const query=call(a,'2026-10-10',null,original,op);
    receipt=JSON.parse(sql(query));assert.ok(receipt.version>0);
    assert.deepEqual(JSON.parse(sql(query)),receipt);
    assert.equal(sql(`select count(*) from public.meals where id='${item.id}'`),'1');
    assert.equal(sql(`select count(*) from integrity_private.record_operations where operation_id='${op}'`),'1');
    assert.throws(()=>sql(call(a,'2026-10-10',null,day(),op)),/Operation ID reused/);
  });
  await t.test('child failures roll back the day, all workouts, and receipt; a corrected explicit retry works',()=>{
    const failedOp=randomUUID();
    const invalid=day({steps:9000,meals:[{...item,description:null}],workouts:[]});
    assert.throws(()=>sql(call(a,'2026-10-10',receipt.version,invalid,failedOp)),/not-null/);
    const broken=day({steps:8000,meals:[item],workouts:[{...one,calories_burned:999},{...two,activity_name:null}]});
    assert.throws(()=>sql(call(a,'2026-10-10',receipt.version,broken,failedOp)),/not-null/);
    assert.equal(sql(`select steps||':'||version from public.daily_logs where id='${receipt.id}'`),`100:${receipt.version}`);
    assert.equal(sql(`select calories_burned from public.workouts where id='${one.id}'`),'100');
    assert.equal(sql(`select count(*) from integrity_private.record_operations where operation_id='${failedOp}'`),'0');
    receipt=JSON.parse(sql(call(a,'2026-10-10',receipt.version,original,failedOp)));
    assert.equal(sql(`select meal_details||':'||photo_path from public.meals where id='${item.id}'`),`Long unchanged note:${a}/food.jpg`);
    assert.equal(sql(`select workout_details||':'||time_str||':'||distance_km||':'||pace_str from public.workouts where id='${one.id}'`),'Sets unchanged:18:20:4.2:7:00');
  });
  await t.test('malformed payloads, duplicate IDs, invalid dates and versions never mutate the existing day',()=>{
    for(const invalid of [null,{},day({steps:-1}),day({water_ml:-1}),day({weight:0}),day({meals:[item,item]}),
      day({workouts:[one,one]}),day({meals:[meal({calories:-1})]}),day({workouts:[workout({duration_min:-1})]})]){
      assert.throws(()=>sql(call(a,'2026-10-10',receipt.version,invalid)),/Invalid|Missing or repeated/);
    }
    for(const version of [0,-1,null])assert.throws(()=>sql(call(a,'2026-10-10',version,original)),/Invalid|Record changed/);
    assert.throws(()=>sql(call(a,'infinity',null,day())),/Invalid record payload/);
    assert.equal(sql(`select steps||':'||version from public.daily_logs where id='${receipt.id}'`),`100:${receipt.version}`);
  });
  await t.test('two independent connections: stale updates reject after the winner commits',async()=>{
    const previous=receipt.version;
    const first=session('begin; '+call(a,'2026-10-10',previous,day({steps:777,meals:[item],workouts:[one,two]}))+"select 'holding';\n");
    await until(()=>first.out.includes('holding'),'First save holds its transaction');
    const second=session("set application_name='integrity_conflict'; "+call(a,'2026-10-10',previous,day({water_ml:9999}))+'\n');second.child.stdin.end();
    await until(()=>sql("select exists(select 1 from pg_stat_activity where application_name='integrity_conflict' and wait_event_type='Lock')")==='t','Second device waits for writer');
    first.child.stdin.end('commit;');assert.equal((await first.done).code,0);
    const rejected=await second.done;assert.notEqual(rejected.code,0);assert.match(rejected.err,/40001.*Record changed/);
    assert.equal(sql("select steps||':'||water_ml from public.daily_logs where user_id='"+a+"' and date='2026-10-10'"),'777:500');
  });
  await t.test('two tabs creating an absent day serialize; exactly one succeeds',async()=>{
    const first=session('begin; '+call(a,'2026-10-11',null,day())+"select 'holding_new';\n");
    await until(()=>first.out.includes('holding_new'),'First creates an uncommitted day');
    const second=session("set application_name='integrity_create'; "+call(a,'2026-10-11',null,day({steps:2}))+'\n');second.child.stdin.end();
    await until(()=>sql("select exists(select 1 from pg_stat_activity where application_name='integrity_create' and wait_event_type='Lock')")==='t','Second tab waits');
    first.child.stdin.end('commit;');assert.equal((await first.done).code,0);
    assert.match((await second.done).err,/40001.*Record changed/);
    assert.equal(sql(`select count(*) from public.daily_logs where user_id='${a}' and date='2026-10-11'`),'1');
  });
  await t.test('concurrent identical retries share one receipt and do not advance the revision',async()=>{
    const id=randomUUID(),payload=day({meals:[meal()]});
    const query=call(a,'2026-10-15',null,payload,id);
    const first=session('begin; '+query+"select 'holding_retry';\n");
    await until(()=>first.out.includes('holding_retry'),'First operation awaits commit');
    const second=session("set application_name='integrity_retry'; "+query+'\n');second.child.stdin.end();
    await until(()=>sql("select exists(select 1 from pg_stat_activity where application_name='integrity_retry' and wait_event_type='Lock')")==='t','Retry waits for committed receipt');
    first.child.stdin.end('commit;');const winner=await first.done,retry=await second.done;
    assert.equal(winner.code,0);assert.equal(retry.code,0);
    assert.deepEqual(JSON.parse(retry.out),JSON.parse(winner.out.split('\n')[0]));
    assert.equal(sql(`select count(*) from integrity_private.record_operations where user_id='${a}' and operation_id='${id}'`),'1');
  });
  await t.test('concurrent cross-user entry-ID collision cannot update the other user after an insert wait',async()=>{
    const collision=meal();
    const first=session('begin; '+call(a,'2026-10-16',null,day({meals:[collision]}))+"select 'holding_identity';\n");
    await until(()=>first.out.includes('holding_identity'),'First owns an uncommitted entry ID');
    const second=session("set application_name='integrity_identity'; "+call(b,'2026-10-16',null,day({meals:[{...collision,description:'Wrong owner'}]}))+'\n');second.child.stdin.end();
    await until(()=>sql("select exists(select 1 from pg_stat_activity where application_name='integrity_identity' and wait_event_type='Lock')")==='t','Other account waits on unique identity');
    first.child.stdin.end('commit;');assert.equal((await first.done).code,0);
    assert.match((await second.done).err,/40001.*Entry identity conflict/);
    assert.equal(sql(`select user_id||':'||description from public.meals where id='${collision.id}'`),`${a}:Synthetic meal`);
    assert.equal(sql(`select count(*) from public.daily_logs where user_id='${b}' and date='2026-10-16'`),'0');
  });
  await t.test('RPC cannot steal an entry, use a foreign photo path, or overwrite another account; reset does not reuse versions',()=>{
    assert.throws(()=>sql(call(b,'2026-10-10',null,day({meals:[item]}))),/Entry identity conflict/);
    assert.throws(()=>sql(call(b,'2026-10-10',null,day({meals:[meal({photo_path:`${a}/secret.jpg`})]}))),/check constraint/);
    assert.equal(sql(`select count(*) from public.daily_logs where user_id='${b}' and date='2026-10-10'`),'0');
    const oldVersion=Number(sql(`select version from public.daily_logs where user_id='${a}' and date='2026-10-10'`));
    assert.equal(sql(login(b)+`select count(*) from public.meals where id='${item.id}'`),'0');
    assert.equal(sql(login(a)+'select public.delete_my_daily_records()'),'t');
    assert.equal(sql(`select count(*) from public.daily_logs where user_id='${b}'`),'1');
    assert.deepEqual(JSON.parse(sql(call(a,'2026-10-10',null,original,op))),JSON.parse(sql(`select result from integrity_private.record_operations where user_id='${a}' and operation_id='${op}'`)));
    assert.equal(sql(`select count(*) from public.daily_logs where user_id='${a}'`),'0','Retry after reset returns original receipt without resurrecting records');
    const fresh=JSON.parse(sql(call(a,'2026-10-10',null,day())));assert.ok(fresh.version>oldVersion);
    assert.throws(()=>sql(call(a,'2026-10-10',oldVersion,original)),/Record changed/);
    assert.throws(()=>sql('begin isolation level repeatable read; '+call(a,'2026-10-12',null,day())),/read committed/);
  });
  await t.test('read-only inventory script executes against the complete local catalog',()=>{
    const catalog=sql(read('supabase/tests/data_integrity_inventory.sql'));
    assert.match(catalog,/save_daily_record_v1/);assert.match(catalog,/profiles_owner/);
    assert.match(catalog,/meal_photos_update_own/);assert.match(catalog,/coach_goals/);
  });
});
