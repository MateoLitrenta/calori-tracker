import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {createHmac} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

// Test-only local service. The process binds port 0 itself; never release a
// borrowed port and race another listener or a client for the same number.
export async function startPostgrest(t,pg,database,executable,{port=0}={}){
 assert.ok(Number.isInteger(port)&&port>=0&&port<=65535,'Invalid test port');
 const parent=resolve('../security-tools'),dir=mkdtempSync(join(parent,'pgrst-test-'));
 const config=join(dir,'postgrest.conf'),secret='synthetic-test-only-secret-with-at-least-32-bytes';
 const redact=value=>String(value).replaceAll(secret,'[synthetic secret]')
  .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi,'[local connection]')
  .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[JWT]');
 const diagnostic={database,stage:'postgres-check',pgReady:false,requestedPort:port,portStrategy:port===0?'process-binds-zero':'explicit-test-port',
  pid:null,port:null,exit:null,signal:null,spawnError:null,stopRequested:false,
  envKeys:Object.keys(process.env).filter(key=>/^(PGRST_|PG|GHC)/.test(key))};
 let pgError;
 try{diagnostic.pgReady=pg.sql('select 1',database)==='1';}catch(error){pgError=error;}
 assert.ok(diagnostic.pgReady,'Local PostgreSQL unavailable: '+JSON.stringify({...diagnostic,error:pgError?.code??null}));
 writeFileSync(config,`db-uri="postgresql://pgrst_login@127.0.0.1:${pg.port}/${database}"\ndb-schemas="public"\ndb-anon-role="anon"\nserver-host="127.0.0.1"\nserver-port=${port}\njwt-secret="${secret}"\n`);
 diagnostic.stage='spawn';
 // Test config must win over unrelated developer settings, especially DB URIs.
 // Only this child's environment is filtered; process.env is never modified.
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^(PGRST_|PG|GHCRTS$)/.test(key)));
 const child=spawn(executable,[config],{windowsHide:true,env,stdio:['ignore','pipe','pipe']});
 diagnostic.pid=child.pid??null;
 let output='',closed=false,stopPromise,lastStatus=null;
 const collect=chunk=>{
  output=(output+chunk.toString()).slice(-16384);
  const match=output.match(/API server listening on 127\.0\.0\.1:(\d+)/);
  if(match)diagnostic.port=Number(match[1]);
 };
 child.stdout.on('data',collect);child.stderr.on('data',collect);
 child.once('error',error=>{diagnostic.spawnError={code:error.code??null,syscall:error.syscall??null};});
 child.once('exit',(code,signal)=>{diagnostic.exit=code;diagnostic.signal=signal;});
 const closePromise=new Promise(done=>child.once('close',()=>{closed=true;done();}));
 const emit=()=>console.info('LOCAL_POSTGREST_DIAGNOSTIC '+JSON.stringify({...diagnostic,lastStatus}));
 async function stop(){
  if(stopPromise)return stopPromise;
  stopPromise=(async()=>{
   if(!closed){diagnostic.stopRequested=true;child.kill();await closePromise;}
   diagnostic.stage=diagnostic.stopRequested?'stopped-by-test':diagnostic.stage;emit();
   const path=resolve(dir);
   if(!path.startsWith(parent+sep)||!path.slice(parent.length+1).startsWith('pgrst-test-'))throw Error('Unsafe config cleanup');
   rmSync(path,{recursive:true,force:true});
  })();return stopPromise;
 }
 t.after(stop);
 const deadline=Date.now()+30000;
 let ready=false;
 while(!closed&&!diagnostic.spawnError&&Date.now()<deadline){
  if(diagnostic.port){
   diagnostic.stage='http-readiness';
   try{
    const response=await fetch(`http://127.0.0.1:${diagnostic.port}/`,{signal:AbortSignal.timeout(1000)});
    lastStatus=response.status;await response.body?.cancel();ready=lastStatus===200;
   }catch{}
   if(ready)break;
  }
  await new Promise(done=>setTimeout(done,50));
 }
 if(!ready){
  diagnostic.stage=closed?'exited-before-ready':'readiness-failed';
  try{diagnostic.pgReadyAfter=pg.sql('select 1',database)==='1';}catch{diagnostic.pgReadyAfter=false;}
  try{diagnostic.pgConnections=pg.sql("select count(*)||'/'||current_setting('max_connections') from pg_stat_activity",database);}catch{diagnostic.pgConnections='unavailable';}
  diagnostic.postgres=pg.diagnostics?.();
  emit();throw Object.assign(new Error('Local PostgREST failed: '+JSON.stringify(diagnostic)+'\n'+redact(output)),{diagnostic:{...diagnostic}});
 }
 diagnostic.stage='ready';emit();
 const token=id=>{
  const head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const body=Buffer.from(JSON.stringify({sub:id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
  const input=head+'.'+body;return input+'.'+createHmac('sha256',secret).update(input).digest('base64url');
 };
 const url='http://127.0.0.1:'+diagnostic.port;
 const client=id=>createClient(url,'synthetic-publishable-key',{accessToken:async()=>token(id),
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:(input,init)=>fetch(String(input).replace('/rest/v1/','/'),init)}});
 return{url,token,client,stop};
}
