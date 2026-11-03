import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readdirSync,readFileSync,writeFileSync,mkdirSync,openSync,closeSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
assert.equal(process.platform,'linux','Use the validated Linux runtime');
const output=resolve('staging-results');mkdirSync(output,{recursive:true});
const files=readdirSync('tests').filter(f=>f.endsWith('.test.mjs')).sort().map(f=>'tests/'+f);
const prior=JSON.parse(readFileSync('docs/integration-gate-v9-1-validation.json','utf8')).combinedRuns[0].manifest.all;
assert.deepEqual(files,[...prior,'tests/staging-schema.test.mjs'].sort());
const checks=[];
async function run(name,executable,args){
 const fd=openSync(join(output,name+'.log'),'w');
 const child=spawn(executable,args,{stdio:['ignore',fd,fd],env:{...process.env,FORCE_COLOR:'0'}});
 let spawnError=null;child.once('error',e=>{spawnError=e.code??e.name;});
 const status=await new Promise(done=>child.once('close',(code,signal)=>done({code,signal,spawnError})));
 closeSync(fd);const result={name,...status};checks.push(result);console.log(JSON.stringify(result));return result;
}
await run('focused',process.execPath,['--test','--test-reporter=spec','tests/staging-schema.test.mjs']);
await run('complete',process.execPath,['--test','--test-reporter=spec','--test-concurrency=1',...files]);
for(const[name,args]of [['frontend-types',['node_modules/typescript/bin/tsc','-b','--force']],['ai-types',['node_modules/typescript/bin/tsc','-p','api/ai/tsconfig.json','--noEmit']],['coach-types',['node_modules/typescript/bin/tsc','-p','api/coach/tsconfig.json','--noEmit']],['lint',['node_modules/oxlint/bin/oxlint','src','api','server','tests','scripts','*.ts','*.js']]])await run(name,process.execPath,args);
await run('build','npm',['run','build']);await run('diff','git',['diff','--check']);
const counts=name=>Object.fromEntries(['tests','pass','fail','skipped','cancelled','todo'].map(k=>[k,Number(readFileSync(join(output,name+'.log'),'utf8').match(new RegExp('(?:ℹ|#) '+k+' (\\d+)'))?.[1]??NaN)]));
const focused=counts('focused'),complete=counts('complete');
const migrations=readdirSync('supabase/migrations').sort().map(file=>({file,sha256:createHash('sha256').update(readFileSync('supabase/migrations/'+file)).digest('hex')}));
const cleanup=readdirSync(process.env.COACH_TEST_POSTGRES_TMP);
const result={commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,
 postgres:execFileSync(join(process.env.COACH_TEST_POSTGRES_BIN,'postgres'),['--version'],{encoding:'utf8'}).trim(),
 postgrest:execFileSync(process.env.SECURITY_TEST_POSTGREST_BIN,['--version'],{encoding:'utf8'}).trim(),files,migrations,focused,complete,checks,cleanup,
 actualGoTrue:false,actualStorageHTTP:false,actualLocalPostgREST:true,actualLocalPostgreSQL:true,remoteSQLExecuted:false,productionModified:false,
 lintWarnings:(readFileSync(join(output,'lint.log'),'utf8').match(/(?:^::warning(?: |::)|: warning )/gm)||[]).length};
const passed=checks.every(c=>c.code===0&&c.signal===null&&c.spawnError===null)&&focused.tests===10&&focused.pass===10&&complete.tests===434&&complete.pass===434&&focused.skipped+focused.cancelled+complete.skipped+complete.cancelled===0&&cleanup.length===0;
result.result=passed?'PASSED':'BLOCKED';writeFileSync(join(output,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));process.exitCode=passed?0:1;
