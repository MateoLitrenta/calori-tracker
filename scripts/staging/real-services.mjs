// Prepared for an explicitly authorized staging ONLY. Never run by CI or on Production.
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {stagingTarget,syntheticCredentials,outsideGit} from './target.mjs';
import {fixtures} from './fixtures.mjs';

const mode=process.argv[2];
assert.ok(['seed','verify','readonly'].includes(mode),'Choose seed, verify or readonly');
const target=stagingTarget(process.env),credentials=syntheticCredentials(process.env);
const file=outsideGit(process.env.CALORI_STAGING_FIXTURE_FILE??'');
if(mode==='verify')assert.equal(process.env.CALORI_STAGING_POSTFLIGHT,'passed','Run reviewed SQL postflight before security probes');
if(mode==='readonly')assert.equal(process.env.CALORI_STAGING_RECOVERY,'applied','Acknowledge the reviewed read-only recovery');
const photo=Buffer.from(readFileSync(new URL('../../tests/fixtures/staging-photo.base64',import.meta.url),'utf8').trim(),'base64');
const digest=b=>createHash('sha256').update(b).digest('hex');
const hash=digest(photo);
assert.equal(hash,'46ddde3566b226a51725da01de880938b1e9ad8737d22d25e954836aa133b4b1');
const clients=credentials.map(()=>createClient(target.url,target.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
 global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}}));
let step='configuration';
async function ok(query,label){step=label;const result=await query;if(result.error)throw Error(label+' was not confirmed');return result.data;}
async function row(query,label){const data=await ok(query.select('id').single(),label);assert.ok(data?.id,label+' returned no identity');return data;}
async function denied(query,label){step=label;const r=await query;assert.ok(r.error||r.data===null||(Array.isArray(r.data)&&r.data.length===0),label+' unexpectedly succeeded');}
let failure;
try{
 const owners=[];
 for(let i=0;i<2;i++){
  const signed=await ok(clients[i].auth.signInWithPassword(credentials[i]),'Synthetic sign-in');
  assert.ok(signed.user?.id&&signed.session,'Real Auth session missing');
  const checked=await ok(clients[i].auth.getUser(),'Auth getUser');assert.equal(checked.user.id,signed.user.id);
  owners.push(signed.user.id);
 }
 assert.notEqual(owners[0],owners[1]);
 let state;
 if(existsSync(file))state=JSON.parse(readFileSync(file,'utf8'));
 else{
  assert.equal(mode,'seed','Seed receipt required');
  const date=new Date().toISOString().slice(0,10);
  state={projectRef:target.ref,owners:owners.map((id,i)=>({id,label:i?'B':'A',fixtures:fixtures(id,i?'B':'A',date)}))};
  // No passwords, access tokens, refresh tokens or signed URLs in this receipt.
  writeFileSync(file,JSON.stringify(state,null,2)+'\n',{flag:'wx',mode:0o600});
 }
 assert.equal(state.projectRef,target.ref);assert.deepEqual(state.owners.map(x=>x.id),owners);
 if(mode==='seed'){
  for(let i=0;i<2;i++){
   const client=clients[i],f=state.owners[i].fixtures;
   await ok(client.from('profiles').upsert(f.profile,{onConflict:'id',ignoreDuplicates:true}).select('id').maybeSingle(),'Profile initialization');
   const profile=await ok(client.from('profiles').select('id,user_id').eq('id',owners[i]).single(),'Winning profile confirmation');
   assert.equal(profile.id,owners[i]);assert.equal(profile.user_id,owners[i]);
   for(const[table,records,immutable]of [['daily_logs',f.days,['id','user_id','profile_id','date']],['meals',f.meals,['id','user_id','daily_log_id','date']],['workouts',f.workouts,['id','user_id','daily_log_id','date']]]){
    for(const record of records){
     const existing=await ok(client.from(table).select('id').eq('id',record.id).maybeSingle(),'Fixture lookup');
     if(existing)await row(client.from(table).update(Object.fromEntries(Object.entries(record).filter(([key])=>!immutable.includes(key)))).eq('id',record.id),'Fixture update');
     else await row(client.from(table).insert(record),'Fixture insert');
    }
   }
   for(const goal of f.goals){const existing=await ok(client.from('coach_goals').select('id').eq('id',goal.id).maybeSingle(),'Goal lookup');if(!existing)await row(client.from('coach_goals').insert(goal),'Goal insert');}
   for(const[bucket,path]of [['avatars',f.profile.avatar_path],...f.meals.map(m=>['meal-photos',m.photo_path])])await ok(client.storage.from(bucket).upload(path,photo,{upsert:true,contentType:'image/jpeg'}),'Synthetic photo upload');
  }
 }else{
  for(let i=0;i<2;i++){
   const client=clients[i],f=state.owners[i].fixtures,other=state.owners[1-i];
   const refreshed=await ok(client.auth.refreshSession(),'Session refresh');assert.equal(refreshed.user.id,owners[i]);
   const own=await ok(client.from('daily_logs').select('id,meals(*),workouts(*)').in('id',f.days.map(d=>d.id)),'Nested daily read');
   assert.equal(own.length,2);for(const day of own){assert.ok(day.meals.some(m=>m.id===f.meals.find(m=>m.daily_log_id===day.id).id));assert.ok(day.workouts.length>=1);}
   for(const table of ['profiles','daily_logs','meals','workouts','coach_goals'])assert.deepEqual(await ok(client.from(table).select('id').eq('user_id',other.id),'Cross-owner visibility'),[]);
   if(mode==='readonly'){
    await denied(client.from('meals').update({meal_details:'Read-only probe'}).eq('id',f.meals[0].id).select('id').single(),'Read-only own write');continue;
   }
   await denied(client.from('profiles').update({name:'Foreign probe'}).eq('id',other.id).select('id').single(),'Foreign profile write');
   await denied(client.from('profiles').update({user_id:other.id}).eq('id',owners[i]).select('id').single(),'Identity transfer');
   const probe={...f.meals[0],id:randomUUID(),daily_log_id:other.fixtures.days[0].id};
   step='Cross-owner day association';const association=await client.from('meals').insert(probe).select('id').single();
   if(!association.error){await client.from('meals').delete().eq('id',probe.id);throw Error('Foreign day association unexpectedly succeeded');}
   for(const[bucket,path]of [['avatars',f.profile.avatar_path],['meal-photos',f.meals[0].photo_path]]){
    const signed=await ok(client.storage.from(bucket).createSignedUrl(path,60),'Own private signed URL');
    const response=await fetch(signed.signedUrl,{signal:AbortSignal.timeout(15000)});assert.equal(response.status,200);assert.equal(digest(Buffer.from(await response.arrayBuffer())),hash);
    await denied(clients[1-i].storage.from(bucket).createSignedUrl(path,60),'Foreign private signed URL');
   }
   const goal=await ok(client.from('coach_goals').select('*').eq('id',f.goals[0].id).single(),'Own goal read');
   const changed=await ok(client.from('coach_goals').update({target:goal.target===31?30:goal.target+1}).eq('id',goal.id).eq('version',goal.version).select('*').single(),'Versioned goal update');
   assert.equal(changed.version,goal.version+1);
   await denied(client.from('coach_goals').update({target:goal.target}).eq('id',goal.id).eq('version',goal.version).select('id').single(),'Stale goal update');
   await row(client.from('coach_goals').update({target:goal.target}).eq('id',goal.id).eq('version',changed.version),'Goal restore');
  }
 }
}catch{failure=Error('Staging rehearsal failed during '+step+'. Inspect the synthetic target locally; no automatic retry was performed.');}
const closed=await Promise.allSettled(clients.map(client=>client.auth.signOut({scope:'local'})));
if(failure)throw failure;
assert.ok(closed.every(r=>r.status==='fulfilled'&&!r.value.error),'Session cleanup was not confirmed');
console.log('Synthetic staging '+mode+' completed; no credentials or signed URLs logged.');
