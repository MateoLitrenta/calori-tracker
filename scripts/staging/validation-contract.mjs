import assert from 'node:assert/strict';

export function validateManifest(files, historicalFiles) {
 assert.equal(new Set(files).size,files.length,'Discovered test files must be unique');
 const required=[...historicalFiles,'tests/staging-schema.test.mjs'];
 for(const file of required)assert.ok(files.includes(file),'Required historical test missing: '+file);
 return{requiredHistoricalFiles:required,files};
}

export function parseTestCounts(log) {
 return Object.fromEntries(['tests','pass','fail','skipped','cancelled','todo'].map(key=>
  [key,Number(log.match(new RegExp('(?:ℹ|#) '+key+' (\\d+)'))?.[1]??NaN)]));
}

export function testRunPassed(counts,expected) {
 return Number.isInteger(counts.tests)&&counts.tests>0&&counts.pass===counts.tests&&
  (expected===undefined||counts.tests===expected)&&
  ['fail','skipped','cancelled','todo'].every(key=>counts[key]===0);
}
