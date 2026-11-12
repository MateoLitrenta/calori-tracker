// Manual local-only gate. No hosted target, Auth stand-ins or administrative user probes.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const stack=resolve(process.env.CALORI_LOCAL_STACK_DIR??'');
assert.equal(basename(stack),'v92-real-supabase-gate','Use the dedicated disposable local stack');
const config=readFileSync(resolve(stack,'supabase/config.toml'),'utf8');
assert.match(config,/project_id = "v92-real-supabase-gate"/);
assert.ok(!existsSync(resolve(stack,'supabase/.temp/project-ref')),'Hosted linking is forbidden');
const docker=process.env.CALORI_DOCKER_BIN??(process.platform==='win32'?'C:/Users/matel/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe':'docker');
const cli=process.env.CALORI_SUPABASE_CLI??(process.platform==='win32'?resolve(root,'../backup-tools/supabase-3.1.0/supabase.exe'):'supabase');
const container='supabase_db_v92-real-supabase-gate';
const env={...process.env};
if(!env.DOCKER_HOST&&process.platform==='win32')env.DOCKER_HOST='npipe:////./pipe/dockerDesktopLinuxEngine';
const dockerArgs=args=>[...(env.DOCKER_HOST?['--host',env.DOCKER_HOST]:[]),...args];
const run=(file,args,input)=>execFileSync(file,args,{cwd:root,env,input,encoding:'utf8',windowsHide:true,timeout:60000,stdio:['pipe','pipe','pipe']}).trim();
const statusText=run(cli,['status','--workdir',stack,'--agent','no','--output-format','text','-o','json']);
const status=JSON.parse(statusText.slice(statusText.indexOf('{'),statusText.lastIndexOf('}')+1));
const url=status.API_URL??status.api_url??status.api?.url;
const key=status.ANON_KEY??status.anon_key??status.api?.anon_key;
assert.equal(url,'http://127.0.0.1:56421','Only the isolated loopback API is allowed');
assert.ok(typeof key==='string'&&!key.startsWith('sb_secret_'),'A local anon key is required');
assert.equal(JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role,'anon');
const read=path=>readFileSync(resolve(root,path),'utf8');
const expand=path=>read(path).replace(/^\\set[^\n]*$/gm,'').replace(/^\\ir (\S+)\s*$/gm,(_,file)=>expand(resolve(dirname(path),file)));
const sql=query=>run(docker,dockerArgs(['exec','-i',container,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']),query);
const proposal='supabase/proposals/transactional-records-v9-2/';
const inputs=[
 'supabase/proposals/staging-v9-1/000_initial_schema.sql',
 ...readdirSync(resolve(root,'supabase/migrations')).filter(name=>name.endsWith('.sql')).sort().map(name=>'supabase/migrations/'+name),
 'supabase/proposals/security-rls-v9-1/020_upgrade.sql',
 ...['001_prepare.sql','002_activate.sql','003_readonly_recovery.sql','004_resume.sql'].map(name=>proposal+name),
 'scripts/transactional-records/frontend-gate.mjs','scripts/transactional-records/real-stack-gate.mjs',
 'src/lib/db.ts','src/hooks/useAppStore.ts'
].map(file=>({file,sha256:createHash('sha256').update(read(file)).digest('hex')}));
const results=[];let step='local target';const clients=[];
async function check(name,fn){step=name;await fn();results.push({name,result:'PASSED'});console.log('PASS '+name);}
const ok=async(query)=>{const r=await query;assert.ifError(r.error);return r.data;};
const denied=async(query,code)=>{const r=await query;assert.ok(r.error,'A forbidden operation unexpectedly succeeded');if(code)assert.equal(r.error.code,code);return r.error;};
const storageDenials=[];
async function deniedStorage(query){
 const error=await denied(query);assert.equal(error.name,'StorageApiError','A network/runtime failure is not evidence of Storage isolation');
 assert.ok([400,403,404].includes(Number(error.status)),'A server error is not evidence of Storage isolation');
 assert.ok([400,403,404].includes(Number(error.statusCode)),'Expected an explicit Storage denial/not-found code');
 storageDenials.push({status:Number(error.status),statusCode:Number(error.statusCode)});
}
const makeClient=()=>{const c=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});clients.push(c);return c;};
const accounts=[];
const photo=Buffer.from(read('tests/fixtures/staging-photo.base64').trim(),'base64');
const hash=b=>createHash('sha256').update(b).digest('hex');
const meal=(patch={})=>({id:randomUUID(),description:'Synthetic meal',meal_type:'Cena',calories:450,time_str:'21:00',meal_details:'Synthetic details',photo_path:null,...patch});
const workout=(patch={})=>({id:randomUUID(),activity_name:'Synthetic walk',duration_min:30,calories_burned:120,workout_details:'Synthetic details',time_str:'18:00',distance_km:3.5,pace_str:'8:34',...patch});
const payload=(patch={})=>({steps:6500,water_ml:1750,weight:70,meals:[meal()],workouts:[workout()],...patch});
const snapshot=client=>ok(client.rpc('calori_record_snapshot_v1'));
async function waitForSchema(client,paths){
 // NOTIFY reload is asynchronous. Only read OpenAPI while awaiting the DDL's
 // published surface; do not retry writes, DDL, authentication errors or 5xx.
 const session=(await ok(client.auth.getSession())).session;assert.ok(session?.access_token);
 for(let attempt=0;attempt<40;attempt++){
  const response=await fetch(url+'/rest/v1/',{headers:{apikey:key,Authorization:'Bearer '+session.access_token,Accept:'application/openapi+json'},signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,200,'OpenAPI readiness request failed');const doc=await response.json();
  if(paths.every(path=>Object.hasOwn(doc.paths??{},path)))return;
  await new Promise(done=>setTimeout(done,250));
 }
 assert.fail('PostgREST did not publish the expected schema within ten seconds');
}
const args=(s,date,day,patch={})=>({p_operation_id:randomUUID(),p_date:date,p_expected_version:s.records.find(r=>r.date===date)?.version??null,p_generation:s.generation,p_day:day,...patch});
let lostArgs,lostReceipt,preparedA;
try{
 await check('official PostgreSQL operator is not a superuser',async()=>{
  const r=JSON.parse(sql("select json_build_object('current_user',current_user,'super',rolsuper,'createrole',rolcreaterole,'version',version()) from pg_roles where rolname=current_user"));
  assert.equal(r.current_user,'postgres');assert.equal(r.super,false);assert.equal(r.createrole,true);
 });
 await check('bootstrap seven migrations and V9.1 hardening on real managed Auth/Storage schemas',async()=>{
  sql(expand('supabase/proposals/staging-v9-1/010_bootstrap.psql'));
  sql(expand('supabase/proposals/security-rls-v9-1/020_upgrade.sql'));
 });
 await check('two synthetic users sign up and renew real Auth sessions',async()=>{
  for(const label of ['a','b']){
   const client=makeClient(),credentials={email:`calori-v92-${label}@example.test`,password:randomBytes(24).toString('base64url')};
   const auth=await ok(client.auth.signUp(credentials));assert.ok(auth.user?.id&&auth.session);
   const owner=auth.user.id;assert.equal((await ok(client.auth.getUser())).user.id,owner);
   assert.equal((await ok(client.auth.refreshSession())).user.id,owner);
   await waitForSchema(client,['/profiles','/daily_logs','/meals','/workouts']);
   await ok(client.from('profiles').insert({id:owner,user_id:owner,name:'Synthetic '+label}).select('id').single());
   accounts.push({client,owner,credentials,avatar:owner+'/profile.jpg',photo:owner+'/'+randomUUID()+'.jpg'});
  }
  assert.notEqual(accounts[0].owner,accounts[1].owner);
 });
 await check('real Storage private bytes: own upload/read and foreign read/write rejection',async()=>{
  for(let i=0;i<2;i++){
   const a=accounts[i],other=accounts[1-i].client;
   for(const [bucket,path]of [['avatars',a.avatar],['meal-photos',a.photo]]){
    await ok(a.client.storage.from(bucket).upload(path,photo,{contentType:'image/jpeg',upsert:false}));
    assert.equal(hash(Buffer.from(await (await ok(a.client.storage.from(bucket).download(path))).arrayBuffer())),hash(photo));
    await deniedStorage(other.storage.from(bucket).download(path));
    await deniedStorage(other.storage.from(bucket).createSignedUrl(path,60));
    await deniedStorage(other.storage.from(bucket).upload(path,photo,{contentType:'image/jpeg',upsert:true}));
   }
  }
 });
 await check('prepare executes as the nonsuperuser PostgreSQL operator',async()=>{
  sql(expand(proposal+'001_prepare.sql'));
  await waitForSchema(accounts[0].client,['/rpc/calori_record_snapshot_v1','/rpc/calori_save_daily_record_v1','/rpc/calori_reset_daily_records_v1']);
 });
 await check('prepared protocol allows the old writer and rejects new record mutations',async()=>{
  for(const a of accounts){
   const legacy=await ok(a.client.from('daily_logs').insert({user_id:a.owner,profile_id:a.owner,date:'2026-11-01',steps:1000}).select('id').single());
   await ok(a.client.from('daily_logs').update({steps:2000}).eq('id',legacy.id).select('id').single());
   a.legacy={day:legacy.id,meal:randomUUID(),workout:randomUUID()};
   await ok(a.client.from('meals').insert({id:a.legacy.meal,user_id:a.owner,daily_log_id:legacy.id,date:'2026-11-01',description:'Legacy synthetic meal',calories:200,photo_path:a.photo}).select('id').single());
   await ok(a.client.from('workouts').insert({id:a.legacy.workout,user_id:a.owner,daily_log_id:legacy.id,date:'2026-11-01',activity_name:'Legacy synthetic walk',duration_min:10}).select('id').single());
   await ok(a.client.from('meals').update({calories:250}).eq('id',a.legacy.meal).select('id').single());
   await ok(a.client.from('workouts').update({duration_min:15}).eq('id',a.legacy.workout).select('id').single());
   const disposable=await ok(a.client.from('daily_logs').insert({user_id:a.owner,profile_id:a.owner,date:'2026-10-31'}).select('id').single());
   await ok(a.client.from('daily_logs').delete().eq('id',disposable.id).select('id').single());
   const s=await snapshot(a.client);assert.equal(s.protocol,'prepared');
   await denied(a.client.rpc('calori_save_daily_record_v1',args(s,'2026-11-02',payload())),'PT503');
   await denied(a.client.rpc('calori_reset_daily_records_v1',{p_operation_id:randomUUID(),p_generation:s.generation}),'PT503');
   if(a===accounts[0])preparedA=s;
  }
 });
 await check('prepared frontend blocks writes with real Auth and database transport',async()=>{
  const frontend=await import('./frontend-gate.mjs');await frontend.verifyPreparedFrontend({client:accounts[0].client,owner:accounts[0].owner});
 });
 await check('activation rejects prepared generations and disables old record writes',async()=>{
  sql(expand(proposal+'002_activate.sql'));
  await denied(accounts[0].client.rpc('calori_save_daily_record_v1',args(preparedA,'2026-11-02',payload())),'PT409');
  for(const a of accounts){
   const old=(await snapshot(a.client)).records[0];assert.ok(old);
   for(const q of [a.client.from('daily_logs').insert({user_id:a.owner,profile_id:a.owner,date:'2026-11-02'}),a.client.from('daily_logs').update({steps:1}).eq('id',old.id),a.client.from('daily_logs').delete().eq('id',old.id)])await denied(q,'42501');
   for(const [table,id,change,newRow]of [
    ['meals',a.legacy.meal,{calories:999},{id:randomUUID(),user_id:a.owner,daily_log_id:a.legacy.day,description:'Denied'}],
    ['workouts',a.legacy.workout,{duration_min:999},{id:randomUUID(),user_id:a.owner,daily_log_id:a.legacy.day,activity_name:'Denied'}]
   ])for(const q of [a.client.from(table).insert(newRow),a.client.from(table).update(change).eq('id',id),a.client.from(table).delete().eq('id',id)])await denied(q,'42501');
   await denied(a.client.rpc('delete_my_daily_records'));
   await ok(a.client.from('profiles').update({name:'Synthetic updated'}).eq('id',a.owner).select('id').single());
  }
 });
 await check('new frontend confirms a complete day using real Auth and RPCs',async()=>{
  const frontend=await import('./frontend-gate.mjs');await frontend.verifyAtomicFrontend({client:accounts[0].client,owner:accounts[0].owner});
 });
 await check('two users save complete isolated days with genuine Storage references',async()=>{
  for(const a of accounts){
   const p=payload({meals:[meal({photo_path:a.photo})]});
   const receipt=await ok(a.client.rpc('calori_save_daily_record_v1',args(await snapshot(a.client),'2026-11-03',p)));
   assert.equal(typeof receipt.version,'string');const day=(await snapshot(a.client)).records.find(r=>r.id===receipt.day_id);
   assert.equal(day.steps,p.steps);assert.equal(day.meals[0].photo_path,a.photo);assert.equal(day.workouts.length,1);
   const nested=await ok(a.client.from('daily_logs').select('id,meals(*),workouts(*)').eq('id',day.id).single());assert.equal(nested.meals.length,1);assert.equal(nested.workouts.length,1);
   const other=accounts.find(x=>x!==a);assert.deepEqual(await ok(other.client.from('daily_logs').select('id').eq('id',day.id)),[]);
  }
 });
 await check('complete replacement edits and removes nested children while retaining photo bytes',async()=>{
  const a=accounts[0],s=await snapshot(a.client),day=s.records.find(r=>r.date==='2026-11-03');
  const beforeTime=day.meals[0].created_at;
  const p=payload({meals:[meal({id:day.meals[0].id,description:'Edited synthetic notes',photo_path:a.photo})],workouts:[]});
  await ok(a.client.rpc('calori_save_daily_record_v1',args(s,day.date,p)));
  const changed=(await snapshot(a.client)).records.find(r=>r.id===day.id);assert.equal(changed.meals[0].created_at,beforeTime);assert.equal(changed.meals[0].description,p.meals[0].description);assert.equal(changed.workouts.length,0);
  assert.equal(hash(Buffer.from(await (await ok(a.client.storage.from('meal-photos').download(a.photo))).arrayBuffer())),hash(photo));
 });
 await check('database rollback after a workout-stage error preserves all day state and receipts',async()=>{
  const a=accounts[0],before=await snapshot(a.client),request=args(before,'2026-11-03',payload({steps:9999,workouts:[workout({activity_name:'SYNTHETIC_ROLLBACK'})]}));
  sql("create function public.synthetic_v92_failure() returns trigger language plpgsql as $$begin if NEW.activity_name='SYNTHETIC_ROLLBACK' then raise exception 'Synthetic rollback';end if;return NEW;end;$$;create trigger synthetic_v92_failure before insert or update on public.workouts for each row execute function public.synthetic_v92_failure();");
  try{await denied(a.client.rpc('calori_save_daily_record_v1',request));assert.deepEqual(await snapshot(a.client),before);assert.equal(sql(`select count(*) from calori_records_private.record_operations where operation_id='${request.p_operation_id}'`),'0');}
  finally{sql('drop trigger synthetic_v92_failure on public.workouts;drop function public.synthetic_v92_failure();');}
  await ok(a.client.rpc('calori_save_daily_record_v1',request));
 });
 await check('lost-response identical retry replays the original receipt once',async()=>{
  const a=accounts[0],s=await snapshot(a.client);lostArgs=args(s,'2026-11-04',payload({meals:[meal({photo_path:a.photo})]}));
  const session=(await ok(a.client.auth.getSession())).session;assert.ok(session?.access_token);
  const response=await fetch(url+'/rest/v1/rpc/calori_save_daily_record_v1',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(lostArgs),signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,200);await response.body?.cancel();
  lostReceipt=JSON.parse(sql(`select result::text from calori_records_private.record_operations where user_id='${a.owner}' and operation_id='${lostArgs.p_operation_id}'`));const after=await snapshot(a.client);
  assert.deepEqual(await ok(a.client.rpc('calori_save_daily_record_v1',structuredClone(lostArgs))),lostReceipt);assert.deepEqual(await snapshot(a.client),after);
  assert.equal(sql(`select count(*) from calori_records_private.record_operations where operation_id='${lostArgs.p_operation_id}'`),'1');
 });
 await check('real independent Auth sessions race with one winner and one version conflict',async()=>{
  const a=accounts[0],second=makeClient();assert.equal((await ok(second.auth.signInWithPassword(a.credentials))).user.id,a.owner);
  const initial=await snapshot(a.client),one=args(initial,'2026-11-05',payload()),two=args(initial,'2026-11-06',payload());
  const r=await Promise.all([a.client.rpc('calori_save_daily_record_v1',one),second.rpc('calori_save_daily_record_v1',two)]);
  assert.equal(r.filter(v=>!v.error).length,1);assert.equal(r.find(v=>v.error).error.code,'PT409');
  const current=await snapshot(a.client);await denied(a.client.rpc('calori_save_daily_record_v1',args(current,'2026-11-03',payload(),{p_expected_version:'1'})),'PT409');
 });
 await check('foreign photos and child IDs cannot be associated with another account',async()=>{
  const a=accounts[0],b=accounts[1],before=await snapshot(a.client),foreign=(await snapshot(b.client)).records.find(r=>r.date==='2026-11-03');
  await denied(a.client.rpc('calori_save_daily_record_v1',args(before,'2026-11-07',payload({meals:[meal({photo_path:b.photo})]}))),'22023');
  await denied(a.client.rpc('calori_save_daily_record_v1',args(before,'2026-11-07',payload({meals:[meal({id:foreign.meals[0].id})]}))),'PT409');
  assert.deepEqual(await snapshot(a.client),before);
 });
 await check('reset/save concurrency has one winner and reset receipts never resurrect days',async()=>{
  const a=accounts[0],b=accounts[1],otherBefore=await snapshot(b.client),s=await snapshot(a.client);
  const reset={p_operation_id:randomUUID(),p_generation:s.generation},save=args(s,'2026-11-08',payload());
  const results=await Promise.all([a.client.rpc('calori_reset_daily_records_v1',reset),a.client.rpc('calori_save_daily_record_v1',save)]);assert.equal(results.filter(r=>!r.error).length,1);assert.equal(results.find(r=>r.error).error.code,'PT409');
  if(results[0].error)await ok(a.client.rpc('calori_reset_daily_records_v1',{p_operation_id:randomUUID(),p_generation:(await snapshot(a.client)).generation}));
  assert.equal((await snapshot(a.client)).records.length,0);assert.deepEqual(await ok(a.client.rpc('calori_save_daily_record_v1',lostArgs)),lostReceipt);assert.equal((await snapshot(a.client)).records.length,0);assert.deepEqual(await snapshot(b.client),otherBefore);
  assert.equal(hash(Buffer.from(await (await ok(a.client.storage.from('meal-photos').download(a.photo))).arrayBuffer())),hash(photo));
 });
 await check('read-only recovery preserves receipts and blocks new writes',async()=>{
  sql(expand(proposal+'003_readonly_recovery.sql'));
  const a=accounts[0],s=await snapshot(a.client);assert.equal(s.protocol,'read_only');
  await denied(a.client.rpc('calori_save_daily_record_v1',args(s,'2026-11-09',payload())),'PT503');
  assert.deepEqual(await ok(a.client.rpc('calori_save_daily_record_v1',lostArgs)),lostReceipt);
 });
 await check('resume requires fresh generations, preserves history and never reopens legacy grants',async()=>{
  const a=accounts[0],before=await snapshot(a.client),receipts=sql('select count(*) from calori_records_private.record_operations');
  sql(expand(proposal+'004_resume.sql'));const current=await snapshot(a.client);assert.equal(current.protocol,'atomic');assert.notEqual(current.generation,before.generation);assert.deepEqual(current.records,before.records);assert.equal(sql('select count(*) from calori_records_private.record_operations'),receipts);
  await denied(a.client.rpc('calori_save_daily_record_v1',args(before,'2026-11-09',payload())),'PT409');
  await ok(a.client.rpc('calori_save_daily_record_v1',args(current,'2026-11-09',payload())));
  await denied(a.client.from('daily_logs').insert({user_id:a.owner,profile_id:a.owner,date:'2026-11-10'}),'42501');
  assert.deepEqual(await ok(a.client.rpc('calori_save_daily_record_v1',lostArgs)),lostReceipt);
 });
 const images=run(docker,dockerArgs(['ps','--filter','name=v92-real-supabase-gate','--format','{{.Names}} {{.Image}}'])).split(/\r?\n/).sort();
 const report={result:'PASSED',baseCommit:'38b88eb83db56b33005776f995a9dfc9528041b7',inputs,checks:results,passed:results.length,failed:0,skipped:0,actualAuthHTTP:true,actualStorageHTTP:true,actualPostgREST:true,storageDenials,syntheticPhotoSHA256:hash(photo),operator:'postgres (NOSUPERUSER)',postgres:sql('show server_version'),cli:run(cli,['--version']),images,target:url,productionModified:false,remoteSQLExecuted:false,cleanup:'pending explicit local stop'};
 writeFileSync(resolve(stack,'gate-result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({result:report.result,passed:report.passed,failed:0,skipped:0}));
}catch(error){
 const clean=value=>String(value??'').replace(/(?:sb_(?:secret|publishable)_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+|Bearer\s+\S+)/g,'[redacted]').slice(0,500);
 const diagnostic={code:error.code??null,actualCode:error.actual?.code??null,message:clean(error.actual?.message??error.message),sqlError:clean(String(error.stderr??'').split(/\r?\n/).find(line=>line.includes('ERROR:')))};
 writeFileSync(resolve(stack,'gate-result.json'),JSON.stringify({result:'FAILED',step,checks:results,diagnostic,productionModified:false,remoteSQLExecuted:false},null,2)+'\n');
 console.error(JSON.stringify(diagnostic));
 console.error('Local real-service gate failed at: '+step+' ('+(error.code??error.name??'Error')+'). Inspect only synthetic diagnostics locally.');process.exitCode=1;
}finally{for(const c of clients)await c.auth.signOut({scope:'local'});}
