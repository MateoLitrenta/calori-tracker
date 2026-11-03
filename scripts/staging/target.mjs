import assert from 'node:assert/strict';
import {resolve,dirname,join,isAbsolute,relative} from 'node:path';
import {existsSync,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export const productionRef='ziclplqhbrpvcqjjqoau'; // Public ref used by the current frontend.
export function stagingTarget(env){
 const ref=env.CALORI_STAGING_PROJECT_REF;
 assert.ok(ref&&ref!==productionRef,'A distinct staging project ref is required');
 assert.equal(env.CALORI_STAGING_ACK,'synthetic-only:'+ref,'Explicit staging acknowledgement required');
 let url;try{url=new URL(env.CALORI_STAGING_URL);}catch{throw Error('Invalid staging API URL');}
 assert.ok(!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/','Unexpected API URL components');
 if(ref==='local')assert.ok(env.CALORI_STAGING_ALLOW_LOCAL==='1'&&url.origin==='http://127.0.0.1:54321','Local stack must be explicitly acknowledged');
 else assert.ok(/^[a-z0-9]{20}$/.test(ref)&&url.origin===`https://${ref}.supabase.co`,'API URL must match the approved staging ref');
 const key=env.CALORI_STAGING_PUBLISHABLE_KEY;
 assert.ok(typeof key==='string'&&!key.startsWith('sb_secret_'),'Browser publishable key required');
 let anon=false;try{anon=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='anon';}catch{}
 assert.ok(key.startsWith('sb_publishable_')||anon,'Never use a service-role/secret key in the frontend or fixture client');
 return{ref,url:url.origin,key};
}
export function syntheticCredentials(env){
 return['A','B'].map(label=>{
  const email=env['CALORI_STAGING_EMAIL_'+label],password=env['CALORI_STAGING_PASSWORD_'+label];
  assert.equal(email,`calori-staging-${label.toLowerCase()}@example.test`,'Only the two dedicated synthetic accounts are permitted');
  assert.ok(password?.length>=16,'Use a separate generated test password of at least 16 characters');
  return{email,password};
 });
}
export function outsideGit(path){
 assert.ok(isAbsolute(path),'Use an absolute private output path');
 const absolute=resolve(path);let parent=existsSync(absolute)?absolute:dirname(absolute);
 while(!existsSync(parent)){const next=dirname(parent);assert.notEqual(next,parent);parent=next;}
 const canonical=realpathSync(parent);
 let cursor=canonical;
 while(true){assert.ok(!existsSync(join(cursor,'.git')),'Private fixture state must be outside every Git repository');const next=dirname(cursor);if(next===cursor)break;cursor=next;}
 const repo=fileURLToPath(new URL('../../',import.meta.url)),rel=relative(repo,absolute);
 assert.ok(rel.startsWith('..')||isAbsolute(rel),'Private output must be outside the repository');
 return absolute;
}
