import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {createHash,randomUUID} from 'node:crypto';
import ts from 'typescript';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {startPostgrest} from './helpers/local-postgrest.mjs';
import {disposablePostgres,postgresUnavailable,delay} from './helpers/security-postgres.mjs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
const la='10000000-0000-0000-0000-000000000001',lb='10000000-0000-0000-0000-000000000002';
const login=id=>`set role authenticated; set "request.jwt.claims"='${JSON.stringify({sub:id,role:'authenticated'})}';`;
const profile=(id,owner=id)=>`insert into profiles(id,user_id,name) values('${id}','${owner}','Synthetic');`;
const proposal='supabase/proposals/security-rls-v9-1/';
const expand=p=>read(p).replace(/^\\set[^\n]*$/gm,'').replace(/^\\ir (\S+)\s*$/gm,(_,file)=>expand(proposal+file));
const upgrade=expand(proposal+'020_upgrade.sql'),preflight=expand(proposal+'000_preflight.sql');
const snapshot=`select jsonb_build_object('profiles',(select jsonb_agg(to_jsonb(t) order by id) from profiles t),
 'days',(select jsonb_agg(to_jsonb(t) order by id) from daily_logs t),
 'meals',(select jsonb_agg(to_jsonb(t) order by id) from meals t),'workouts',(select jsonb_agg(to_jsonb(t) order by id) from workouts t));`;
const catalog=`select jsonb_build_object('policies',(select jsonb_agg(to_jsonb(p) order by tablename,policyname) from pg_policies p where schemaname='public'),
 'tables',(select jsonb_agg(jsonb_build_array(relname,relacl) order by relname) from pg_class where oid in('profiles'::regclass,'daily_logs'::regclass,'meals'::regclass,'workouts'::regclass)),
 'constraints',(select jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) order by conname,conrelid) from pg_constraint where connamespace='public'::regnamespace));`;
function seed(sql,db){sql(profile(a)+profile(b)+`insert into daily_logs(id,user_id,profile_id,date) values('${la}','${a}','${a}','2026-11-03'),('${lb}','${b}','${b}','2026-11-03');`,db);}

test('security hardening: synthetic remote shape, safe upgrade and PR70 compatibility',
 {skip:postgresUnavailable,timeout:360000},async t=>{
 const pg=await disposablePostgres(t),{sql}=pg;
 sql('create role anon;create role authenticated;create role service_role bypassrls;create role pgrst_login login noinherit;grant anon,authenticated to pgrst_login;');
 const databases=['postgres','clean','http_attack','http_legacy','http_hardened'];
 for(const db of databases){
  if(db!=='postgres')sql(`create database ${db};`);
  sql(read('tests/fixtures/security-rls/remote-shape.sql')+`insert into auth.users values('${a}'),('${b}');`,db);
  for(const migration of ['202609110001_delete_daily_records.sql','202609250001_profile_avatar.sql','202609290001_meal_photos.sql','202610130001_coach_goals.sql'])sql(read('supabase/migrations/'+migration),db);
 }
 seed(sql,'postgres');seed(sql,'clean');
 await t.test('A can change its profile user_id to B; B can read and modify it under the actual OR predicates',()=>{
  const out=sql(`begin;${login(a)}update profiles set user_id='${b}' where id='${a}' returning id;
   reset role;${login(b)}select name from profiles where id='${a}';update profiles set name='Changed by B' where id='${a}' returning name;rollback;`);
  assert.deepEqual(out.split(/\r?\n/),[a,'Synthetic','Changed by B']);
 });
 await t.test('mixed identity INSERT and id reassignment succeed only when PK/FKs permit; occupied id fails',()=>{
  const out=sql(`begin;delete from daily_logs;delete from profiles;${login(a)}${profile(a,b)}reset role;${login(b)}select count(*) from profiles where id='${a}';rollback;`);
  assert.equal(out,'1');
  assert.equal(sql(`begin;delete from daily_logs;delete from profiles;${profile(a)}${login(a)}update profiles set id='${b}' where id='${a}';reset role;${login(b)}select count(*) from profiles where id='${b}';rollback;`),'1');
  assert.throws(()=>sql(`begin;${login(a)}update profiles set id='${b}' where id='${a}';rollback;`),/duplicate key|foreign key/);
 });
 await t.test('own meals/workouts can reference B day, but parent rows remain hidden to A',()=>{
  for(const [table,cols,values]of [['meals','description,calories',"'Own injected meal',200"],['workouts','activity_name,calories_burned',"'Own injected workout',100"]]){
   const out=sql(`begin;${login(a)}insert into ${table}(id,user_id,daily_log_id,date,${cols}) values('${randomUUID()}','${a}','${lb}','2026-11-03',${values});
    select count(*) from ${table} where daily_log_id='${lb}';select count(*) from daily_logs where id='${lb}';reset role;${login(b)}select count(*) from ${table} where daily_log_id='${lb}';rollback;`);
   assert.deepEqual(out.split(/\r?\n/),['1','0','0']);
  }
 });
 await t.test('legacy mutation matrix: profile association and child parent can change; user_id transfers on days/children reject',()=>{
  assert.equal(sql(`begin;${login(a)}update daily_logs set profile_id='${b}' where id='${la}' returning profile_id;rollback;`),b);
  for(const table of ['meals','workouts']){
   const id=randomUUID(),field=table==='meals'?'description':'activity_name';
   const insert=`insert into ${table}(id,user_id,daily_log_id,date,${field}) values('${id}','${a}','${la}','2026-11-03','Own');`;
   assert.equal(sql(`begin;${login(a)}${insert}update ${table} set daily_log_id='${lb}' where id='${id}' returning daily_log_id;rollback;`),lb);
   assert.throws(()=>sql(`begin;${login(a)}${insert}update ${table} set user_id='${b}' where id='${id}';rollback;`),/row-level security/);
  }
  assert.throws(()=>sql(`begin;${login(a)}update daily_logs set user_id='${b}' where id='${la}';rollback;`),/row-level security/);
 });
 await t.test('TRUNCATE bypasses RLS in a direct SQL role; the other excess grants are proven privileges, not asserted HTTP exploits',()=>{
  assert.equal(sql(`begin;${login(a)}truncate profiles,daily_logs,meals,workouts;reset role;select count(*) from profiles where id='${b}';rollback;`),'0');
  for(const role of ['anon','authenticated'])for(const privilege of ['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'])
   assert.equal(sql(`select has_table_privilege('${role}','profiles','${privilege}')`),'t');
 });
 await t.test('preflight aborts on mixed owners; nullable legacy fields migrate unchanged',()=>{
  sql(`update profiles set user_id='${b}' where id='${a}';`);
  let before=sql(snapshot),acl=sql(catalog);
  assert.throws(()=>sql(preflight),/Legacy profile identity inconsistencies: 1/);
  assert.throws(()=>sql(upgrade),/Legacy profile identity inconsistencies: 1/);
  assert.equal(sql(snapshot),before);assert.equal(sql(catalog),acl);
  sql(`update profiles set user_id='${a}' where id='${a}';update daily_logs set profile_id='${b}' where id='${la}';`);
  assert.throws(()=>sql(upgrade),/Legacy day\/profile inconsistencies/);
  sql(`update daily_logs set profile_id='${a}' where id='${la}';insert into meals(id,user_id,daily_log_id,date,description) values('${randomUUID()}','${a}','${lb}',null,'Wrong owner');`);
  before=sql(snapshot);assert.throws(()=>sql(upgrade),/Legacy meals ownership inconsistencies/);assert.equal(sql(snapshot),before);
 });
 await t.test('unknown columns, triggers and unsafe FK actions fail closed',()=>{
  const shape=sql(catalog,'clean');
  for(const change of ["alter table profiles add column unreviewed text;", "alter table daily_logs drop constraint daily_logs_profile_id_fkey;alter table daily_logs add foreign key(profile_id) references profiles(id) on delete set null;",
   "create function public.synthetic_trigger() returns trigger language plpgsql as $$begin return new;end;$$;create trigger unexpected before update on profiles for each row execute function public.synthetic_trigger();"]){
   assert.throws(()=>sql('begin;'+change+expand(proposal+'010_checks.sql')+'rollback;','clean'),/Unknown|Unsupported/);
   assert.equal(sql(catalog,'clean'),shape);
  }
 });
 let backup;
 await t.test('local backup and injected upgrade failure preserve rows, constraints and privileges',()=>{
  backup=execFileSync(pg.executable('pg_dump'),['-h','127.0.0.1','-p',String(pg.port),'-U','integrity_admin','-d','clean','--no-owner'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});
  const before=sql(snapshot,'clean'),acl=sql(catalog,'clean');
  assert.throws(()=>sql(upgrade.replace(/commit;\s*$/i,'select 1/0;commit;'),'clean'),/division by zero/);
  assert.equal(sql(snapshot,'clean'),before);assert.equal(sql(catalog,'clean'),acl);
  sql('create database restored_isolated;');sql(backup,'restored_isolated');
  assert.equal(sql(snapshot,'restored_isolated'),before);
  assert.throws(()=>sql(upgrade.replace('begin;',"begin;create role inherited_writer;grant all on profiles to inherited_writer;grant inherited_writer to authenticated;"),'clean'),/Excess effective privilege/);
  assert.throws(()=>sql(upgrade.replace('begin;',"begin;create role inherited_writer;grant references(id) on profiles to inherited_writer;grant inherited_writer to authenticated;"),'clean'),/Excess effective column REFERENCES/);
  assert.equal(sql(catalog,'clean'),acl);
 });
 await t.test('upgrade preserves rows and FK actions while replacing the old relationships without duplicates',()=>{
  sql(`update daily_logs set profile_id=null where id='${la}';insert into meals(id,user_id,daily_log_id,date,description) values('${randomUUID()}','${a}','${la}',null,'Valid nullable legacy');`,'clean');
  const before=sql(snapshot,'clean');sql(upgrade,'clean');assert.equal(sql(snapshot,'clean'),before);
  assert.equal(sql("select count(*) from pg_constraint where conrelid in('meals'::regclass,'workouts'::regclass) and confrelid='daily_logs'::regclass and contype='f'",'clean'),'2');
  assert.equal(sql("select string_agg(cardinality(conkey)::text,',' order by conrelid) from pg_constraint where conrelid in('meals'::regclass,'workouts'::regclass) and confrelid='daily_logs'::regclass and contype='f'",'clean'),'2,2');
 });
 await t.test('CASCADE and deferred FK semantics are preserved in a separate disposable variant',()=>{
  sql('create database cascade_variant template http_legacy;');
  sql('alter table meals drop constraint meals_daily_log_id_fkey;alter table meals add constraint meals_daily_log_id_fkey foreign key(daily_log_id) references daily_logs(id) on update cascade on delete cascade deferrable initially deferred;','cascade_variant');
  seed(sql,'cascade_variant');
  sql(`insert into meals(id,user_id,daily_log_id,description) values('${randomUUID()}','${a}','${la}','Cascade fixture');`,'cascade_variant');
  sql(upgrade,'cascade_variant');
  assert.equal(sql("select confdeltype::text||':'||confupdtype::text||':'||condeferrable::text||':'||condeferred::text from pg_constraint where conname='meals_daily_log_id_fkey'",'cascade_variant'),'c:c:true:true');
  assert.equal(sql(`begin;${login(a)}delete from daily_logs where id='${la}';select count(*) from meals;rollback;`,'cascade_variant'),'0');
 });
 await t.test('hardened photo policies and persistent goals retain their owner-scoped operations',()=>{
  for(const [bucket,file]of [['avatars','profile.jpg'],['meal-photos','meal.jpg']]){
   sql(login(a)+`insert into storage.objects(bucket_id,name) values('${bucket}','${a}/${file}');update storage.objects set name=name where name='${a}/${file}';`,'clean');
   assert.equal(sql(login(b)+`select count(*) from storage.objects where name='${a}/${file}'`,'clean'),'0');
   assert.throws(()=>sql(login(b)+`insert into storage.objects(bucket_id,name) values('${bucket}','${a}/${file}')`,'clean'),/row-level security/);
   assert.equal(sql(login(b)+`update storage.objects set name=name where name='${a}/${file}' returning id`,'clean'),'');
   assert.throws(()=>sql(login(a)+`update storage.objects set name='${b}/${file}' where name='${a}/${file}'`,'clean'),/row-level security/);
   assert.equal(sql(login(b)+`delete from storage.objects where name='${a}/${file}' returning id`,'clean'),'');
   assert.ok(sql(login(a)+`delete from storage.objects where name='${a}/${file}' returning id`,'clean'));
  }
  const goal=randomUUID();
  sql(login(a)+`insert into coach_goals(id,user_id,type,target,start_date,end_date) values('${goal}','${a}','workout_sessions',3,current_date,current_date+6);`,'clean');
  assert.equal(sql(login(b)+`select count(*) from coach_goals where id='${goal}'`,'clean'),'0');
  assert.equal(sql(login(a)+`update coach_goals set target=2 where id='${goal}' and version=1 returning version`,'clean'),'2');
 });
 await t.test('hardened role/ownership matrix denies cross-user access, associations and identity updates',()=>{
  const run=q=>sql(q,'clean');
  assert.equal(run(login(a)+`select count(*) from profiles where id='${b}'`),'0');
  assert.equal(run(login(a)+`update profiles set name='No' where id='${b}' returning id`),'');
  assert.throws(()=>run(login(a)+`update profiles set user_id='${b}' where id='${a}'`),/row-level security|check constraint/);
  assert.throws(()=>run(login(a)+`update daily_logs set profile_id='${b}' where id='${la}'`),/permission denied/);
  assert.throws(()=>run(login(a)+`insert into daily_logs(id,user_id,profile_id,date) values('${randomUUID()}','${a}','${b}','2026-11-04')`),/row-level security|check constraint/);
  for(const table of ['meals','workouts']){
   const field=table==='meals'?'description':'activity_name';
   assert.throws(()=>run(login(a)+`insert into ${table}(id,user_id,daily_log_id,date,${field}) values('${randomUUID()}','${a}','${lb}','2026-11-03','No')`),/foreign key/);
  }
  assert.throws(()=>run(`set role anon;select * from profiles`),/permission denied/);
  assert.throws(()=>run(login(a)+'truncate profiles,daily_logs,meals,workouts'),/permission denied/);
  assert.throws(()=>run(login(a)+`delete from profiles where id='${a}'`),/permission denied/);
  assert.equal(run("select has_table_privilege('service_role','profiles','TRUNCATE')"),'t','Trusted service grants are unchanged');
 });
 await t.test('read-only recovery stops writes without undoing isolation or modifying records',()=>{
  const before=sql(snapshot,'clean');sql(expand(proposal+'040_readonly_recovery.sql'),'clean');
  assert.equal(sql(snapshot,'clean'),before);assert.equal(sql(login(a)+'select count(*) from profiles','clean'),'1');
  assert.throws(()=>sql(login(a)+`update profiles set name='No' where id='${a}'`,'clean'),/permission denied/);
 });
 const postgrest=resolve(process.env.SECURITY_TEST_POSTGREST_BIN||('../security-tools/postgrest/postgrest'+(process.platform==='win32'?'.exe':'')));
 await t.test('real local PostgREST, signed synthetic JWTs and unmodified PR70 persistence',
  {skip:!existsSync(postgrest)?'Install official PostgREST binary locally; HTTP compatibility remains unverified':false,timeout:120000},async http=>{
  const manifest=JSON.parse(read('tests/fixtures/security-rls/pr70-source.json'));
  for(const [path,file]of [['src/lib/db.ts','pr70-db.ts.json'],['src/hooks/useAppStore.ts','pr70-useAppStore.ts.json']])
   assert.equal(createHash('sha256').update(JSON.parse(read('tests/fixtures/security-rls/'+file)).replaceAll('\r\n','\n')).digest('hex'),manifest[path]);
  sql(upgrade,'http_hardened');
  await http.test('a forced bind conflict reports its real failure; OS-assigned startup succeeds without retrying it',async()=>{
   const blocker=createServer();await new Promise((done,reject)=>{blocker.once('error',reject);blocker.listen(0,'127.0.0.1',done);});
   const port=blocker.address().port;
   try{
    await assert.rejects(startPostgrest(http,pg,'http_hardened',postgrest,{port}),error=>{
     assert.equal(error.diagnostic.stage,'exited-before-ready');assert.equal(error.diagnostic.pgReady,true);
     assert.equal(error.diagnostic.requestedPort,port);
     assert.equal(error.diagnostic.pgReadyAfter,true);assert.equal(error.diagnostic.spawnError,null);
     // A bind failure exits 1 normally; this Windows runtime also reproduced 3.
     // Preserve the actual status rather than treating every failure as code 3.
     assert.ok(Number.isInteger(error.diagnostic.exit)&&error.diagnostic.exit!==0);
     assert.equal(error.diagnostic.signal,null);
     assert.ok(!error.message.includes('postgresql://'));assert.ok(!error.message.includes('synthetic-test-only-secret-with-at-least-32-bytes'));
     return true;
    });
    const server=await startPostgrest(http,pg,'http_hardened',postgrest);
    assert.notEqual(Number(new URL(server.url).port),port);await server.stop();
   }finally{await new Promise(done=>blocker.close(done));}
  });
  await http.test('parallel services bind distinct OS ports and stop independently',async()=>{
   const servers=await Promise.all(['http_attack','http_legacy','http_hardened'].map(name=>startPostgrest(http,pg,name,postgrest)));
   assert.equal(new Set(servers.map(server=>server.url)).size,3);
   await servers[0].stop();
   for(const server of servers.slice(1)){const response=await fetch(server.url+'/');assert.equal(response.status,200);await response.body?.cancel();}
   await Promise.all(servers.slice(1).map(server=>server.stop()));
  });
  await http.test('legacy HTTP reproduces mixed-profile access; unsupported TRUNCATE HTTP does not imply an exposed SQL command',async()=>{
   const server=await startPostgrest(http,pg,'http_attack',postgrest),ca=server.client(a),cb=server.client(b);
   assert.ifError((await ca.from('profiles').insert({id:a,user_id:b,name:'Synthetic mixed'})).error);
   assert.equal((await cb.from('profiles').select('id').eq('id',a).single()).data.id,a);
   const response=await fetch(server.url+'/profiles',{method:'TRUNCATE',headers:{Authorization:'Bearer '+server.token(a)}});
   assert.equal(response.status,405);await response.body?.cancel();await server.stop();
  });
  for(const database of ['http_legacy','http_hardened'])await http.test(database+': profile/day/children CRUD and nested read confirmations',async()=>{
   const server=await startPostgrest(http,pg,database,postgrest),client=server.client(a);
   const source=JSON.parse(read('tests/fixtures/security-rls/pr70-db.ts.json')).replace("import { supabase } from './supabase';",'const supabase=globalThis.__securityClient;')
    .replace("'../utils/helpers'",JSON.stringify(new URL('../src/utils/helpers.ts',import.meta.url).href));
   globalThis.__securityClient=client;
   const dbURL='data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText+'\n// '+database).toString('base64');
   const db=await import(dbURL);
   if(database==='http_hardened'){
    const oldSource=read('src/lib/db.ts').replace("import { supabase } from './supabase';",'const supabase=globalThis.__securityClient;')
     .replace("'../utils/helpers'",JSON.stringify(new URL('../src/utils/helpers.ts',import.meta.url).href));
    const oldDB=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(oldSource,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
    assert.ok(await oldDB.fetchUserData(a),'Main initializer remains compatible without loosening owner predicates');
    globalThis.__securityClient=server.client(b);
    const fresh=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText+'\n// fresh B').toString('base64'));
    assert.equal((await fresh.fetchUserData(b)).id,b,'PR70 DO NOTHING initializer also works with hardened grants');
    globalThis.__securityClient=client;
   }
   let p=await db.fetchUserData(a);assert.ok(p);assert.equal(p.id,a);
   await db.completeOnboarding(a,{name:'Synthetic updated',age:30,sex:'Masculino',height:170,weight:70});
   await db.syncProfile({...p,name:'Kept',activity:'Activo'});p=await db.fetchUserData(a);assert.equal(p.name,'Kept');assert.equal(p.activity,'Activo');
   const date='2026-11-03',record={dateStr:date,steps:1200,water:500,weight:70,meals:[],workouts:[]};
   const log=await db.ensureDailyLog(a,record);assert.ok(log);
   assert.equal(await db.ensureDailyLog(a,{...record,steps:1300}),log);
   const m={id:randomUUID(),name:'Meal',type:'Cena',calories:400,details:'Preserved\nnotes',photo_path:a+'/food.jpg'};
   const w={id:randomUUID(),activity:'Walk',duration:30,calories:100,details:'Preserved routine',distance:4.2,pace:'7:00'};
   await db.syncAddMeal(a,log,m,date);await db.syncAddWorkout(a,log,w,date);
   await db.syncUpdateMeal({...m,calories:450});await db.syncUpdateWorkout({...w,calories:120});
   const round=await db.fetchDailyLog(a,date);assert.equal(round.meals[0].calories,450);assert.equal(round.meals[0].details,m.details);assert.equal(round.workouts[0].distance,4.2);
   assert.equal((await db.fetchUserData(a)).records[date].steps,1300,'Unqualified embedded reads remain unambiguous');
   await db.syncDeleteMeal(m.id);await db.syncDeleteWorkout(w.id);
   await assert.rejects(db.syncDeleteMeal(m.id));await assert.rejects(db.syncUpdateWorkout(w));
   const missing={...p,id:b,user_id:b};await assert.rejects(db.syncProfile(missing));
   const outsider=server.client(b);assert.deepEqual((await outsider.from('daily_logs').select('id')).data,[]);
   const forged=await fetch(server.url+'/profiles',{headers:{Authorization:'Bearer '+server.token(a).slice(0,-3)+'xyz'}});assert.equal(forged.status,401);await forged.body?.cancel();
   await db.deleteUserRecords();assert.equal(await db.fetchDailyLog(a,date),null);
   if(database==='http_hardened')await verifyStoreWithRealPersistence(dbURL);
   await server.stop();
  });
 });
});

async function verifyStoreWithRealPersistence(dbURL){
 const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
 const state={errors:[],auth:{getSession:async()=>({data:{session:{user:{id:a}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};
 globalThis.__securityStore=state;
 const imports={react:import.meta.resolve('react'),'../lib/db':dbURL,
  '../utils/helpers':new URL('../src/utils/helpers.ts',import.meta.url).href,
  '../lib/supabase':url('export const supabase={auth:globalThis.__securityStore.auth};'),
  'react-hot-toast':url('export default {error:m=>globalThis.__securityStore.errors.push(m),success(){}};')};
 const code=ts.transpileModule(JSON.parse(read('tests/fixtures/security-rls/pr70-useAppStore.ts.json')),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText
  .replace(/from ["']([^"']+)["']/g,(_,name)=>'from '+JSON.stringify(imports[name]||import.meta.resolve(name)));
 const {AppStoreProvider,useAppStore}=await import(url(code));
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true}),saved={window:globalThis.window,document:globalThis.document,act:globalThis.IS_REACT_ACT_ENVIRONMENT};
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const {createRoot}=await import('react-dom/client');const element=createRoot(document.getElementById('root'));
 function Probe(){const store=useAppStore();React.useLayoutEffect(()=>{state.store=store;});return null;}
 try{
  await act(()=>element.render(React.createElement(AppStoreProvider,null,React.createElement(Probe))));
  for(let i=0;i<200&&!state.store?.activeProfile;i++)await act(async()=>delay(10));
  assert.ok(state.store.activeProfile);
  await act(async()=>state.store.updateProfile({...state.store.activeProfile,name:'Saved through store'}));
  assert.equal(state.store.activeProfile.name,'Saved through store');
  const day={dateStr:'2026-11-04',date:new Date('2026-11-04T12:00:00'),steps:3000,water:750,
   meals:[{id:randomUUID(),name:'Store meal',type:'Cena',calories:450}],workouts:[{id:randomUUID(),activity:'Store walk',duration:30,calories:100,muscles:[]}]};
  await act(async()=>assert.equal(await state.store.updateRecord(day.dateStr,day),true));
  assert.equal(state.store.activeProfile.records[day.dateStr].meals[0].id,day.meals[0].id);
  assert.equal(state.store.activeProfile.records[day.dateStr].workouts[0].id,day.workouts[0].id);
  assert.deepEqual(state.errors,[]);
 }finally{
  await act(()=>element.unmount());dom.window.close();globalThis.window=saved.window;globalThis.document=saved.document;globalThis.IS_REACT_ACT_ENVIRONMENT=saved.act;
 }
}
