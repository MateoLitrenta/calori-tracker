import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../../',import.meta.url));
const base='8cbade05cc9339fd405421d88c5c5445f7931ace';
const pr70='3bc5d62cd3ab4cf921b9e4a795d8295a58ff0e24';
const target=resolve(process.argv[2]??'');
assert.ok(process.argv[2]&&!existsSync(target),'Use a new disposable worktree path');
const git=(cwd,...args)=>execFileSync('git',['-c','safe.directory='+cwd.replaceAll('\\','/'),...args],{cwd,maxBuffer:8*1024*1024});
const pr71=git(root,'rev-parse','HEAD').toString().trim();
git(root,'cat-file','-e',pr70+'^{commit}');
const patch=git(root,'diff','--binary',base,pr71);
git(root,'worktree','add','--detach',target,pr70);
execFileSync('git',['-c','safe.directory='+target.replaceAll('\\','/'),'apply','--index','-'],{cwd:target,input:patch});
const manifest=JSON.parse(readFileSync(join(target,'tests/fixtures/security-rls/pr70-source.json'),'utf8'));
const hashes={};
for(const[source,fixture]of [['src/lib/db.ts','pr70-db.ts.json'],['src/hooks/useAppStore.ts','pr70-useAppStore.ts.json']]){
 const actual=readFileSync(join(target,source),'utf8').replaceAll('\r\n','\n');
 assert.equal(actual,JSON.parse(readFileSync(join(target,'tests/fixtures/security-rls',fixture),'utf8')).replaceAll('\r\n','\n'));
 hashes[source]=createHash('sha256').update(actual).digest('hex');assert.equal(hashes[source],manifest[source]);
}
// Same adapter used in the Windows gate: load real source, preserve every assertion.
const test=join(target,'tests/security-hardening.test.mjs');
let source=readFileSync(test,'utf8');
for(const[old,replacement]of [["JSON.parse(read('tests/fixtures/security-rls/pr70-db.ts.json'))","read('src/lib/db.ts')"],["JSON.parse(read('tests/fixtures/security-rls/pr70-useAppStore.ts.json'))","read('src/hooks/useAppStore.ts')"]]){
 assert.equal(source.split(old).length,2,'Exactly one source loader to adapt');source=source.replace(old,replacement);
}
writeFileSync(test,source);
const record={base,pr70,pr71,combinedTree:git(target,'write-tree').toString().trim(),actualSourceHashes:hashes,
 adapter:'Only the two test loaders use actual PR70 files; no persistence implementation is simulated.'};
mkdirSync(join(target,'integration-results'),{recursive:true});
writeFileSync(join(target,'integration-results/inputs.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify(record));
