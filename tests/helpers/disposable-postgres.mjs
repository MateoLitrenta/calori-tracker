import {spawn,execFileSync} from 'node:child_process';
import {existsSync,mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
const bin=process.env.COACH_TEST_POSTGRES_BIN||(process.platform==='win32'?'C:/Program Files/PostgreSQL/17/bin':'');
const exe=name=>join(bin,name+(process.platform==='win32'?'.exe':''));
export const postgresUnavailable=!bin||!existsSync(exe('initdb'))?'Set COACH_TEST_POSTGRES_BIN to test native PostgreSQL locally':false;
export const delay=ms=>new Promise(done=>setTimeout(done,ms));
export async function disposablePostgres(t){
  const parent=resolve(process.env.COACH_TEST_POSTGRES_TMP||tmpdir()); mkdirSync(parent,{recursive:true});
  const root=mkdtempSync(join(parent,'calori-integrity-pg-')),data=join(root,'data');
  const socket=createServer();await new Promise((done,reject)=>{socket.once('error',reject);socket.listen(0,'127.0.0.1',done);});
  const port=socket.address().port;await new Promise(done=>socket.close(done));
  execFileSync(exe('initdb'),['-D',data,'-U','integrity_admin','-A','trust','--encoding=UTF8','--locale=C'],{windowsHide:true,stdio:'pipe'});
  const server=spawn(exe('postgres'),['-D',data,'-h','127.0.0.1','-p',String(port)],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  let log='';server.stderr.on('data',chunk=>{log+=chunk;});
  t.after(()=>{
    execFileSync(exe('pg_ctl'),['-D',data,'stop','-m','immediate','-w'],{windowsHide:true,stdio:'pipe'});
    const target=resolve(root);
    if(!target.startsWith(parent+sep)||!target.slice(parent.length+1).startsWith('calori-integrity-pg-'))throw Error('Unsafe cleanup path');
    rmSync(target,{recursive:true,force:true});
  });
  const args=db=>['-X','-qAt','-h','127.0.0.1','-p',String(port),'-U','integrity_admin','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'];
  const sql=(query,db='postgres')=>execFileSync(exe('psql'),args(db),{input:query,encoding:'utf8',windowsHide:true,timeout:15000,stdio:['pipe','pipe','pipe']}).trim();
  let ready=false,connectionError='';
  for(let i=0;i<100&&!ready;i++){try{ready=sql('select 1')==='1';}catch(error){connectionError=String(error.stderr);await delay(50);}}
  assert.ok(ready,'Disposable PostgreSQL started: '+log+' Connection: '+connectionError);
  function session(query){
    const child=spawn(exe('psql'),args('postgres'),{windowsHide:true,stdio:['pipe','pipe','pipe']});
    const state={child,out:'',err:''};
    child.stdout.on('data',c=>{state.out+=c;});child.stderr.on('data',c=>{state.err+=c;});
    state.done=new Promise(done=>child.on('close',code=>done({code,out:state.out.trim(),err:state.err})));
    child.stdin.write(query);return state;
  }
  async function until(condition,message){for(let i=0;i<150;i++){if(condition())return;await delay(20);}assert.fail(message);}
  return{sql,session,until};
}
