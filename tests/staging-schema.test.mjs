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
 for(const db of ['stage','injected']){sql('create database '+db);sql(read('tests/fixtures/staging-platform-contract.sql'),db);}
 await t.test('explicit acknowledgement, empty target and transactional baseline rollback are enforced',()=>{
  assert.throws(()=>sql(baseline,'stage'),/acknowledgement required/);
  assert.throws(()=>sql(ack+baseline.replace('commit;','select 1/0;commit;'),'injected'),/division by zero/);
  assert.equal(sql("select to_regclass('public.profiles') is null and to_regclass('auth.users') is not null",'injected'),'t');
  sql("insert into storage.buckets(id,name)values('avatars','avatars')",'injected');
  assert.throws(()=>sql(ack+baseline,'injected'),/buckets already exist/);
  assert.equal(sql("select to_regclass('public.profiles') is null and exists(select 1 from storage.buckets where id='avatars')",'injected'),'t');
 });
 await t.test('initial schema plus all seven real migrations install the full application contract',()=>{
  sql(expand(proposal+'010_bootstrap.psql'),'stage');
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
 const snapshot="select jsonb_build_object('profiles',(select jsonb_agg(to_jsonb(t) order by id) from profiles t),'days',(select jsonb_agg(to_jsonb(t) order by id) from daily_logs t),'meals',(select jsonb_agg(to_jsonb(t) order by id) from meals t),'workouts',(select jsonb_agg(to_jsonb(t) order by id) from workouts t),'goals',(select jsonb_agg(to_jsonb(t) order by id) from coach_goals t));";
 await t.test('preflight and real security upgrade preserve fixtures and reject cross-owner associations',()=>{
  const before=sql(snapshot,'stage');sql(expand('supabase/proposals/security-rls-v9-1/000_preflight.sql'),'stage');
  sql(expand('supabase/proposals/security-rls-v9-1/020_upgrade.sql'),'stage');
  sql(expand('supabase/proposals/security-rls-v9-1/030_postflight.sql'),'stage');assert.equal(sql(snapshot,'stage'),before);
  assert.equal(sql(login(a)+`select count(*) from profiles where id='${b}'`,'stage'),'0');
  assert.throws(()=>sql(login(a)+insert('meals',{...fa.meals[0],id:'11111111-1111-4111-8111-111111111111',daily_log_id:fb.days[0].id}),'stage'),/foreign key/);
  assert.throws(()=>sql(login(a)+`update profiles set user_id='${b}' where id='${a}'`,'stage'),/row-level security|check constraint/);
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
 });
});
