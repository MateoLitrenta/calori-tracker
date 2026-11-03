import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {disposablePostgres,postgresUnavailable} from './helpers/security-postgres.mjs';
import {startPostgrest} from './helpers/local-postgrest.mjs';
import {stagingTarget,syntheticCredentials,outsideGit,productionRef} from '../scripts/staging/target.mjs';
import {fixtures} from '../scripts/staging/fixtures.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const proposal='supabase/proposals/staging-v9-1/';
const expand=p=>read(p).replace(/^\\set[^\n]*$/gm,'').replace(/^\\ir (\S+)\s*$/gm,(_,file)=>expand(resolve(dirname(p),file).replaceAll('\\','/').slice(resolve('.').replaceAll('\\','/').length+1)));
const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
const login=id=>`set role authenticated;set "request.jwt.claim.sub"='${id}';`;
const inventory=JSON.parse(read('tests/fixtures/staging-verified-catalog.json'));
const columnsSQL=`select jsonb_agg(jsonb_build_array(c.relname,a.attname,format_type(a.atttypid,a.atttypmod),not a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) order by c.relname,a.attnum)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid
 left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
 where n.nspname='public' and c.relname in('profiles','daily_logs','meals','workouts') and a.attnum>0 and not a.attisdropped;`;
const foreignKeysSQL=`select jsonb_agg(jsonb_build_object('name',f.conname,'table',c.relname,
 'columns',(select jsonb_agg(a.attname order by k.ord) from unnest(f.conkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=f.conrelid and a.attnum=k.num),
 'parent',pn.nspname||'.'||p.relname,
 'parentColumns',(select jsonb_agg(a.attname order by k.ord) from unnest(f.confkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=f.confrelid and a.attnum=k.num),
 'onDelete',case f.confdeltype when 'c' then 'CASCADE' else f.confdeltype::text end,
 'onUpdate',f.confupdtype,'deferrable',f.condeferrable,'deferred',f.condeferred,'validated',f.convalidated) order by c.relname,f.conname)
 from pg_constraint f join pg_class c on c.oid=f.conrelid join pg_namespace n on n.oid=c.relnamespace
 join pg_class p on p.oid=f.confrelid join pg_namespace pn on pn.oid=p.relnamespace
 where f.contype='f' and n.nspname='public' and c.relname in('profiles','daily_logs','meals','workouts');`;
const uniqueDaySQL=`select jsonb_agg((select jsonb_agg(a.attname order by k.ord) from unnest(f.conkey) with ordinality k(num,ord)
 join pg_attribute a on a.attrelid=f.conrelid and a.attnum=k.num)) from pg_constraint f where f.contype='u' and f.conrelid='public.daily_logs'::regclass;`;
const env={CALORI_STAGING_PROJECT_REF:'abcdefghijklmnopqrst',CALORI_STAGING_URL:'https://abcdefghijklmnopqrst.supabase.co',CALORI_STAGING_ACK:'synthetic-only:abcdefghijklmnopqrst',CALORI_STAGING_PUBLISHABLE_KEY:'sb_publishable_synthetic-test-key'};
test('staging guard refuses Production, mismatched targets, credentials in URLs and secret browser keys',()=>{
 assert.equal(stagingTarget(env).ref,env.CALORI_STAGING_PROJECT_REF);
 for(const patch of [{CALORI_STAGING_PROJECT_REF:productionRef},{CALORI_STAGING_URL:`https://${productionRef}.supabase.co`},{CALORI_STAGING_ACK:''},{CALORI_STAGING_URL:'https://abcdefghijklmnopqrst.supabase.co?credential=synthetic'},{CALORI_STAGING_URL:'https://user:synthetic@abcdefghijklmnopqrst.supabase.co'},{CALORI_STAGING_PUBLISHABLE_KEY:'sb_secret_synthetic'}])assert.throws(()=>stagingTarget({...env,...patch}));
 const service=['e30',Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url'),'synthetic'].join('.');
 assert.throws(()=>stagingTarget({...env,CALORI_STAGING_PUBLISHABLE_KEY:service}));
 assert.throws(()=>stagingTarget({...env,CALORI_STAGING_URL:'not a URL'}),/Invalid staging API URL/);
});
test('staging fixtures accept only dedicated accounts, stay deterministic and keep ownership/date links',()=>{
 const e={CALORI_STAGING_EMAIL_A:'calori-staging-a@example.test',CALORI_STAGING_EMAIL_B:'calori-staging-b@example.test',CALORI_STAGING_PASSWORD_A:'synthetic-password-a',CALORI_STAGING_PASSWORD_B:'synthetic-password-b'};
 assert.equal(syntheticCredentials(e).length,2);assert.throws(()=>syntheticCredentials({...e,CALORI_STAGING_EMAIL_A:'person@example.org'}));
 assert.throws(()=>outsideGit(resolve('private-staging.json')));
 const f=fixtures(a,'A','2026-11-03');assert.deepEqual(f,fixtures(a,'A','2026-11-03'));assert.notEqual(f.days[0].id,fixtures(b,'B','2026-11-03').days[0].id);
 for(const row of [...f.meals,...f.workouts])assert.ok(f.days.some(d=>d.id===row.daily_log_id&&d.user_id===row.user_id&&d.date===row.date));
 const migrationFiles=readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort();
 const included=[...read(proposal+'010_bootstrap.psql').matchAll(/\.\.\/\.\.\/migrations\/(\S+\.sql)/g)].map(m=>m[1]);assert.deepEqual(included,migrationFiles);
 assert.ok(!read(proposal+'000_initial_schema.sql').match(/create\s+(?:table|schema|function)\s+(?:auth|storage)\./i));
 const image=Buffer.from(read('tests/fixtures/staging-photo.base64').trim(),'base64');
 assert.equal(createHash('sha256').update(image).digest('hex'),'46ddde3566b226a51725da01de880938b1e9ad8737d22d25e954836aa133b4b1');
});

test('staging: real PostgreSQL bootstrap sequence with explicit Auth/Storage SQL shims, NOT service certification',
 {skip:postgresUnavailable,timeout:360000},async t=>{
 const pg=await disposablePostgres(t),{sql}=pg;
 sql('create role anon;create role authenticated;create role service_role bypassrls;create role pgrst_login login noinherit;grant anon,authenticated to pgrst_login;');
 const baseline=read(proposal+'000_initial_schema.sql'),ack="set calori.staging_bootstrap='empty-synthetic-only';";
 await t.test('missing managed prerequisites fail without creating application tables',()=>{
  assert.throws(()=>sql(ack+baseline),/prerequisites missing/);assert.equal(sql("select to_regclass('public.profiles') is null"),'t');
 });
 for(const db of ['stage','injected','catalog']){sql('create database '+db);sql(read('tests/fixtures/staging-platform-contract.sql'),db);}
 await t.test('explicit acknowledgement, empty target and transactional baseline rollback are enforced',()=>{
  assert.throws(()=>sql(baseline,'stage'),/acknowledgement required/);
  assert.throws(()=>sql(ack+baseline.replace('commit;','select 1/0;commit;'),'injected'),/division by zero/);
  assert.equal(sql("select to_regclass('public.profiles') is null and to_regclass('auth.users') is not null",'injected'),'t');
  sql("insert into storage.buckets(id,name)values('avatars','avatars')",'injected');
  assert.throws(()=>sql(ack+baseline,'injected'),/buckets already exist/);
  assert.equal(sql("select to_regclass('public.profiles') is null and exists(select 1 from storage.buckets where id='avatars')",'injected'),'t');
 });
 const verifyColumns=db=>{
  const actual=JSON.parse(sql(columnsSQL,db));
  for(const expected of inventory.columns){
   const row=actual.find(r=>r[0]===expected[0]&&r[1]===expected[1]);assert.ok(row,'Missing documented column: '+expected.slice(0,2).join('.'));
   assert.deepEqual(row.slice(0,expected.length),expected);
  }
  assert.ok(JSON.parse(sql(uniqueDaySQL,db)).some(cols=>JSON.stringify(cols)===JSON.stringify(inventory.uniqueKeys[0][1])));
 };
 await t.test('baseline catalog matches the documented types, nullability, exact defaults, eight CASCADE FKs and unique day key',()=>{
  sql(ack+baseline,'catalog');verifyColumns('catalog');
  const actual=JSON.parse(sql(foreignKeysSQL,'catalog')).map(f=>[f.table,f.columns,f.parent,f.parentColumns,f.onDelete]);
  const sort=rows=>rows.toSorted((x,y)=>JSON.stringify(x).localeCompare(JSON.stringify(y)));
  assert.deepEqual(sort(actual),sort(inventory.foreignKeys));
  assert.equal(sql("select count(*) from pg_policy where polrelid in('profiles'::regclass,'daily_logs'::regclass,'meals'::regclass,'workouts'::regclass) and polpermissive and polroles=array[0::oid]",'catalog'),'4');
  assert.equal(sql("select count(*) from pg_policy where polname='security_owner_gate'",'catalog'),'0');
 });
 await t.test('nullable names/descriptions and integer values round-trip; omitted values generate UUID, zero and required timestamps',()=>{
  const out=sql(`begin;insert into auth.users values('${a}');
   insert into profiles(id,user_id,name) values('${a}','${a}',null);
   insert into daily_logs(user_id,profile_id,date) values('${a}','${a}',current_date);
   insert into meals(id,user_id,daily_log_id) select '${a}','${a}',id from daily_logs;
   insert into workouts(id,user_id,daily_log_id,activity_name) select '${a}','${a}',id,'Synthetic default' from daily_logs;
   select jsonb_build_array((select name is null and created_at is not null from profiles),
    (select id is not null and steps=0 and water_ml=0 and created_at is not null from daily_logs),
    (select description is null and calories=0 and created_at is not null from meals),
    (select duration_min=0 and calories_burned=0 and created_at is not null from workouts));
   update daily_logs set steps=null,water_ml=null;update meals set calories=null;update workouts set duration_min=null,calories_burned=null;
   select jsonb_build_array((select steps is null and water_ml is null from daily_logs),(select calories is null from meals),
    (select duration_min is null and calories_burned is null from workouts));rollback;`,'catalog');
  assert.deepEqual(out.split(/\r?\n/).map(s=>JSON.parse(s)),[[true,true,true,true],[true,true,true]]);
 });
 await t.test('initial schema plus all seven real migrations install the full application contract',()=>{
  sql(expand(proposal+'010_bootstrap.psql'),'stage');
  verifyColumns('stage');
  assert.equal(sql("select count(*) from pg_tables where schemaname='public' and tablename in('profiles','daily_logs','meals','workouts','coach_goals')",'stage'),'5');
  assert.equal(sql("select count(*) from pg_class where oid in('public.profiles'::regclass,'public.daily_logs'::regclass,'public.meals'::regclass,'public.workouts'::regclass,'public.coach_goals'::regclass,'ai_private.daily_usage'::regclass) and relrowsecurity",'stage'),'6');
  assert.equal(sql("select count(*) from pg_proc where oid in('public.delete_my_daily_records()'::regprocedure,'public.reserve_ai_quota(uuid,text,integer)'::regprocedure,'public.validate_coach_goal_change()'::regprocedure)",'stage'),'3');
  assert.equal(sql("select count(*) from pg_policies where schemaname='storage'",'stage'),'8');
  assert.equal(sql("select string_agg(id||':'||public::text||':'||file_size_limit,',' order by id) from storage.buckets",'stage'),'avatars:false:524288,meal-photos:false:1048576');
  assert.equal(sql("select column_default from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='onboarding_completed'",'stage'),'false');
  assert.throws(()=>sql(ack+baseline,'stage'),/already exist/);
 });
 const literal=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+v.replaceAll("'","''")+"'";
 const insert=(table,row)=>`insert into public.${table}(${Object.keys(row).join(',')})values(${Object.values(row).map(literal).join(',')});`;
 let fa,fb;
 await t.test('two synthetic owners, photos, goals and server-only quota work through the migrated SQL contract',()=>{
  sql(`insert into auth.users values('${a}'),('${b}')`,'stage');const date=sql('select current_date::text','stage');fa=fixtures(a,'A',date);fb=fixtures(b,'B',date);
  for(const[id,f]of [[a,fa],[b,fb]])sql(login(id)+insert('profiles',f.profile)+f.days.map(r=>insert('daily_logs',r)).join('')+f.meals.map(r=>insert('meals',r)).join('')+f.workouts.map(r=>insert('workouts',r)).join('')+f.goals.map(r=>insert('coach_goals',r)).join(''), 'stage');
  assert.throws(()=>sql(login(a)+`select public.reserve_ai_quota('${a}','text',30)`,'stage'),/permission denied/);
  assert.equal(sql(`set role service_role;select public.reserve_ai_quota('${a}','text',30)->>'allowed'`,'stage'),'true');
  sql(login(a)+`insert into storage.objects(bucket_id,name)values('avatars','${a}/profile.jpg')`,'stage');
  assert.equal(sql(login(b)+"select count(*) from storage.objects",'stage'),'0');
 });
 const cascadeCountsSQL='select jsonb_build_object('+[['a',a],['b',b]].flatMap(([label,id])=>[
  `'${label}Auth',(select count(*) from auth.users where id='${id}')`,
  ...['profiles','daily_logs','meals','workouts','coach_goals'].map(table=>`'${label}_${table}',(select count(*) from public.${table} where user_id='${id}')`),
  `'${label}Quota',(select count(*) from ai_private.daily_usage where user_id='${id}')`
 ]).join(',')+');';
 const assertCascades=()=>{
  const original=JSON.parse(sql(cascadeCountsSQL,'stage'));
  const cases=[
   [login(a)+`delete from daily_logs where id='${fa.days[0].id}';reset role;`,{a_daily_logs:1,a_meals:1,a_workouts:1}],
   [`delete from profiles where id='${a}';`,{a_profiles:0,a_daily_logs:0,a_meals:0,a_workouts:0}],
   [`delete from auth.users where id='${a}';`,{aAuth:0,a_profiles:0,a_daily_logs:0,a_meals:0,a_workouts:0,a_coach_goals:0,aQuota:0}]
  ];
  assert.equal(original.a_daily_logs,2);assert.equal(original.b_daily_logs,2);
  for(const[statement,changed]of cases){
   assert.deepEqual(JSON.parse(sql('begin;'+statement+cascadeCountsSQL+'rollback;','stage')),{...original,...changed});
   assert.deepEqual(JSON.parse(sql(cascadeCountsSQL,'stage')),original,'CASCADE probe must roll back');
  }
 };
 let legacyForeignKeys;
 await t.test('legacy CASCADE removes only A descendants for day, administrative profile and Auth-row deletion',()=>{
  legacyForeignKeys=JSON.parse(sql(foreignKeysSQL,'stage'));assertCascades();
  for(const table of ['profiles','daily_logs','meals','workouts'])assert.throws(()=>sql(`begin;update ${table} set created_at=null where user_id='${a}';rollback;`,'stage'),/not-null/);
 });
 const snapshot="select jsonb_build_object('profiles',(select jsonb_agg(to_jsonb(t) order by id) from profiles t),'days',(select jsonb_agg(to_jsonb(t) order by id) from daily_logs t),'meals',(select jsonb_agg(to_jsonb(t) order by id) from meals t),'workouts',(select jsonb_agg(to_jsonb(t) order by id) from workouts t),'goals',(select jsonb_agg(to_jsonb(t) order by id) from coach_goals t));";
 await t.test('preflight and real security upgrade preserve fixtures and reject cross-owner associations',()=>{
  const before=sql(snapshot,'stage');sql(expand('supabase/proposals/security-rls-v9-1/000_preflight.sql'),'stage');
  sql(expand('supabase/proposals/security-rls-v9-1/020_upgrade.sql'),'stage');
  sql(expand('supabase/proposals/security-rls-v9-1/030_postflight.sql'),'stage');assert.equal(sql(snapshot,'stage'),before);
  assert.equal(sql(login(a)+`select count(*) from profiles where id='${b}'`,'stage'),'0');
  assert.throws(()=>sql(login(a)+insert('meals',{...fa.meals[0],id:'11111111-1111-4111-8111-111111111111',daily_log_id:fb.days[0].id}),'stage'),/foreign key/);
  assert.throws(()=>sql(login(a)+`update profiles set user_id='${b}' where id='${a}'`,'stage'),/row-level security|check constraint/);
 });
 await t.test('upgrade preserves CASCADE, names, update actions and deferrability while replacing three FKs with owner composites',()=>{
  const actual=JSON.parse(sql(foreignKeysSQL,'stage'));
  const expected=legacyForeignKeys.map(f=>f.parent==='auth.users'?f:{...f,columns:[...f.columns,'user_id'],parentColumns:['id','user_id']});
  assert.deepEqual(actual,expected);verifyColumns('stage');assertCascades();
 });
 const binary=resolve(process.env.SECURITY_TEST_POSTGREST_BIN||('../security-tools/postgrest/postgrest'+(process.platform==='win32'?'.exe':'')));
 await t.test('real local PostgREST confirms nested reads and own writes after the NEW bootstrap; GoTrue/Storage HTTP still pending',
  {skip:!existsSync(binary)?'PostgREST binary required':false},async http=>{
  const api=await startPostgrest(http,pg,'stage',binary),ca=api.client(a),cb=api.client(b);
  const {data,error}=await ca.from('daily_logs').select('id,meals(*),workouts(*)');assert.ifError(error);assert.equal(data.length,2);assert.equal(data[0].meals.length,1);assert.equal(data[0].workouts.length,1);
  assert.deepEqual((await cb.from('profiles').select('id').eq('id',a)).data,[]);
  assert.ifError((await ca.from('meals').update({meal_details:'Synthetic edit'}).eq('id',fa.meals[0].id).select('id').single()).error);
  assert.ok((await cb.from('meals').update({meal_details:'Foreign'}).eq('id',fa.meals[0].id).select('id').single()).error);
  await api.stop();
 });
 await t.test('read-only recovery preserves rows and isolation; it covers base records, not the whole platform',()=>{
  const before=sql(snapshot,'stage');sql(expand('supabase/proposals/security-rls-v9-1/040_readonly_recovery.sql'),'stage');assert.equal(sql(snapshot,'stage'),before);
  assert.equal(sql(login(a)+'select count(*) from daily_logs','stage'),'2');assert.throws(()=>sql(login(a)+`update meals set calories=1 where id='${fa.meals[0].id}'`,'stage'),/permission denied/);
  assert.equal(sql("select has_column_privilege('authenticated','public.coach_goals','target','UPDATE')",'stage'),'t');
  assert.deepEqual(JSON.parse(sql(`begin;delete from auth.users where id='${a}';select jsonb_build_array(
   (select count(*)=0 from daily_logs where user_id='${a}'),(select count(*)=2 from daily_logs where user_id='${b}'));rollback;`,'stage')),[true,true]);
  assert.equal(sql(snapshot,'stage'),before,'Administrative CASCADE recovery probe must roll back');
 });
});
