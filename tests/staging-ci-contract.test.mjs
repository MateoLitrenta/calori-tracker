import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateManifest,parseTestCounts,testRunPassed} from '../scripts/staging/validation-contract.mjs';

test('staging CI includes added tests while requiring every historical file and the staging gate',()=>{
 const historical=['tests/legacy.test.mjs'],files=[...historical,'tests/staging-schema.test.mjs','tests/new-regression.test.mjs'];
 assert.deepEqual(validateManifest(files,historical),{requiredHistoricalFiles:[...historical,'tests/staging-schema.test.mjs'],files});
 assert.throws(()=>validateManifest(files.slice(1),historical),/Required historical test missing/);
 assert.throws(()=>validateManifest(historical,historical),/Required historical test missing/);
 assert.throws(()=>validateManifest([...files,files[0]],historical),/must be unique/);
});

test('staging CI accepts changing complete counts only when all discovered tests pass',()=>{
 for(const tests of [1,438,451,600])assert.equal(testRunPassed({tests,pass:tests,fail:0,skipped:0,cancelled:0,todo:0}),true);
 const good={tests:451,pass:451,fail:0,skipped:0,cancelled:0,todo:0};
 for(const key of ['fail','skipped','cancelled','todo'])assert.equal(testRunPassed({...good,[key]:1}),false);
 for(const counts of [{...good,pass:450},{...good,tests:0,pass:0},{...good,tests:NaN},{...good,skipped:undefined}])assert.equal(testRunPassed(counts),false);
 assert.equal(testRunPassed({...good,tests:14,pass:14},14),true);
 assert.equal(testRunPassed(good,14),false,'The focused staging gate must retain its fourteen tests');
});

test('staging CI parses native spec/TAP totals and fails closed on missing or unsuccessful results',()=>{
 for(const prefix of ['ℹ','#']){
  const log=['tests 451','pass 451','fail 0','skipped 0','cancelled 0','todo 0'].map(line=>prefix+' '+line).join('\n');
  const counts=parseTestCounts(log);assert.equal(counts.tests,451);assert.equal(testRunPassed(counts),true);
  assert.equal(testRunPassed(parseTestCounts(log.replace('pass 451','pass 450'))),false);
 }
 assert.equal(testRunPassed(parseTestCounts('No test report')),false);
});
