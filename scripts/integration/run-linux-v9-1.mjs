import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync,mkdirSync,openSync,closeSync,copyFileSync} from 'node:fs';
import {resolve,join} from 'node:path';

assert.equal(process.platform,'linux','This independent gate must run on Linux');
const output=resolve('integration-results');mkdirSync(output,{recursive:true});
const read=p=>readFileSync(p,'utf8');
const windows=JSON.parse(read('docs/integration-gate-v9-1-validation.json'));
const manifest=windows.combinedRuns[0].manifest;
const discovered=readdirSync('tests').filter(f=>f.endsWith('.test.mjs')).sort().map(f=>'tests/'+f);
assert.deepEqual(discovered,manifest.all);assert.deepEqual(manifest.batches.flat().sort(),discovered);
assert.equal(new Set(manifest.batches.flat()).size,37);assert.equal(manifest.batches.length,3);
assert.equal(execFileSync(join(process.env.COACH_TEST_POSTGRES_BIN,'postgres'),['--version'],{encoding:'utf8'}).trim(),'postgres (PostgreSQL) 17.5');
assert.match(execFileSync(process.env.SECURITY_TEST_POSTGREST_BIN,['--version'],{encoding:'utf8'}),/PostgREST 16\.5/);
copyFileSync(resolve(process.env.COACH_TEST_POSTGRES_BIN,'../../provenance.sha256'),join(output,'provenance.sha256'));
const info={platform:process.platform,node:process.version,postgres:'17.5',postgrest:'16.5',
 runnerOS:process.env.RUNNER_OS,imageOS:process.env.ImageOS,imageVersion:process.env.ImageVersion,
 inputs:JSON.parse(read(join(output,'inputs.json'))),manifest};
writeFileSync(join(output,'environment.json'),JSON.stringify(info,null,2)+'\n');

async function command(name,executable,args,env={}){
 const fd=openSync(join(output,name+'.log'),'w');
 const child=spawn(executable,args,{stdio:['ignore',fd,fd],env:{...process.env,FORCE_COLOR:'0',...env}});
 let spawnError=null;child.once('error',e=>{spawnError=e.code??e.name;});
 const status=await new Promise(done=>child.once('close',(code,signal)=>done({code,signal,spawnError})));
 closeSync(fd);return{name,...status};
}
async function tests(name,files,expected){
 const temporaryRoot=resolve(output,name+'-pg');mkdirSync(temporaryRoot,{recursive:true});
 const result=await command(name,process.execPath,['--test','--test-reporter=spec','--test-concurrency=1',...files],{COACH_TEST_POSTGRES_TMP:temporaryRoot});
 const log=read(join(output,name+'.log'));
 const counts=Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(key=>[key,Number(log.match(new RegExp('(?:ℹ|#) '+key+' (\\d+)'))?.[1]??NaN)]));
 const diagnostics=log.split(/\r?\n/).filter(line=>line.startsWith('LOCAL_POSTGREST_DIAGNOSTIC ')).map(line=>JSON.parse(line.slice('LOCAL_POSTGREST_DIAGNOSTIC '.length)));
 const leftoverPostgresDirectories=readdirSync(temporaryRoot);
 const record={...result,files,expected,...counts,diagnostics,leftoverPostgresDirectories};
 record.passed=result.code===0&&result.signal===null&&result.spawnError===null&&counts.tests===expected&&counts.pass===expected&&counts.fail===0&&counts.cancelled===0&&counts.skipped===0&&leftoverPostgresDirectories.length===0;
 writeFileSync(join(output,name+'.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({...record,diagnostics:diagnostics.length}));return record;
}

// Failures remain recorded; still execute the complete manifest and quality checks.
const focused=await tests('focused',['tests/security-hardening.test.mjs','tests/data-integrity-client.test.mjs','tests/data-integrity-postgres.test.mjs'],41);
const batches=await Promise.all(manifest.batches.map((files,i)=>tests('combined-'+i,files,windows.combinedRuns[0].results[i].tests)));
const totals=Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(key=>[key,batches.reduce((sum,b)=>sum+b[key],0)]));
const quality=[];
for(const[name,args]of [['frontend-types',['node_modules/typescript/bin/tsc','-b','--force']],['ai-types',['node_modules/typescript/bin/tsc','-p','api/ai/tsconfig.json','--noEmit']],['coach-types',['node_modules/typescript/bin/tsc','-p','api/coach/tsconfig.json','--noEmit']],['lint',['node_modules/oxlint/bin/oxlint','src','api','server','tests','scripts','*.ts','*.js']]])quality.push(await command(name,process.execPath,args));
quality.push(await command('build','npm',['run','build']));
quality.push(await command('diff-working','git',['diff','--check']));
quality.push(await command('diff-index','git',['diff','--cached','--check']));
const leftoverPostgrestConfigs=readdirSync(resolve('../security-tools')).filter(name=>name.startsWith('pgrst-test-'));
const passed=focused.passed&&batches.every(b=>b.passed)&&totals.tests===424&&quality.every(q=>q.code===0&&q.signal===null&&q.spawnError===null)&&leftoverPostgrestConfigs.length===0;
const result={gate:passed?'PASSED':'BLOCKED',...info,focused,batches,totals,quality,leftoverPostgrestConfigs,
 lintWarnings:(read(join(output,'lint.log')).match(/: warning /g)||[]).length,
 remoteSQLExecuted:false,productionModified:false,realUserData:false,authService:'Simulated session; real synthetic HMAC JWT verification in PostgREST',storageHTTP:false};
writeFileSync(join(output,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({gate:result.gate,totals,quality}));
process.exitCode=passed?0:1;
