import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Execute the real persistence functions against a minimal Supabase boundary.
// This verifies payloads/round trips without writing a production user's data.
let row;
let error;
let confirmedRow;
let updates = [];
globalThis.__profileTestSupabase = {
  from(table) {
    let updating = false;
    const chain = {
      select() { return chain; },
      or() { return table === 'daily_logs' ? Promise.resolve({ data: [], error: null }) : chain; },
      maybeSingle() { return Promise.resolve({ data: row, error: null }); },
      update(payload) {
        updating = true;
        updates.push(payload);
        if (!error) row = { ...row, ...payload };
        return chain;
      },
      upsert(payload) { row = payload; return chain; },
      single() { return Promise.resolve({ data: updating && confirmedRow !== undefined ? confirmedRow : row, error }); },
      then(resolve, reject) { return Promise.resolve({ data: row, error }).then(resolve, reject); },
    };
    return chain;
  },
};
const source = (await readFile(new URL('../src/lib/db.ts', import.meta.url), 'utf8'))
  .replace("import { supabase } from './supabase';", 'const supabase = globalThis.__profileTestSupabase;')
  .replace("'../utils/helpers'", JSON.stringify(new URL('../src/utils/helpers.ts', import.meta.url).href));
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { fetchUserData, syncProfile, completeOnboarding, deleteUserRecords } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('new-user default is persisted; saved activity survives fresh fetches', async () => {
  row = null;
  const initial = await fetchUserData('test-user', 'test@example.com');
  assert.equal(initial.activity, 'Sedentario');
  assert.equal(row.activity_level, 'Sedentario');
  assert.equal(initial.onboarding_completed, false);
  assert.equal(row.onboarding_completed, false);
  for (const activity of ['Moderado', 'Activo']) {
    await syncProfile({ ...initial, activity });
    assert.equal(row.activity_level, activity);
    assert.equal((await fetchUserData('test-user')).activity, activity);
    assert.equal((await fetchUserData('test-user')).activity, activity);
  }
  assert.equal((await fetchUserData('test-user')).onboarding_completed, false);
});

test('legacy/invalid values load safely; failed saves reject', async () => {
  row = { id: 'test-user', activity_level: 'unknown' };
  assert.equal((await fetchUserData('test-user')).activity, 'Sedentario');
  assert.equal((await fetchUserData('test-user')).onboarding_completed, true);
  error = new Error('Simulated database failure');
  const originalError = console.error;
  console.error = () => {};
  try { await assert.rejects(syncProfile({ id: 'test-user', activity: 'Moderado' }), /Simulated/); }
  finally { error = undefined; console.error = originalError; }
});

const personalDetails = { name: '  Ana  ', age: 32, sex: 'Femenino', height: 167.5, weight: 63.2 };

test('onboarding persists personal details, preserves existing settings, and survives a fresh fetch', async () => {
  row = { id: 'test-user', onboarding_completed: false, goal: 'Mantenimiento', activity_level: 'Activo', avatar_path: 'avatar.jpg' };
  updates = [];
  await completeOnboarding('test-user', personalDetails);
  assert.deepEqual(updates, [{ name: 'Ana', age: 32, gender: 'Femenino', height_cm: 167.5, weight_kg: 63.2, onboarding_completed: true }]);
  const reloaded = await fetchUserData('test-user');
  assert.equal(reloaded.onboarding_completed, true);
  assert.equal(reloaded.name, 'Ana');
  assert.equal(reloaded.height, 167.5);
  assert.equal(reloaded.weight, 63.2);
  assert.equal(reloaded.activity, 'Activo');
  assert.equal(reloaded.goal, 'Mantenimiento');
  assert.equal(reloaded.avatar_path, 'avatar.jpg');
  await completeOnboarding('test-user', personalDetails);
  assert.deepEqual(await fetchUserData('test-user'), reloaded);
});

test('invalid personal data never reaches the onboarding write boundary', async () => {
  updates = [];
  for (const invalid of [{ name: '  ' }, { age: 0 }, { age: -1 }, { age: 12.5 }, { age: NaN },
    { sex: '' }, { height: 0 }, { height: Infinity }, { weight: -1 }, { weight: NaN }]) {
    await assert.rejects(completeOnboarding('test-user', { ...personalDetails, ...invalid }), /datos personales/);
  }
  assert.deepEqual(updates, []);
});

test('onboarding rejects failed writes and missing backend confirmation', async () => {
  row = { id: 'test-user', onboarding_completed: false };
  error = new Error('Onboarding unavailable');
  try {
    await assert.rejects(completeOnboarding('test-user', personalDetails), /Onboarding unavailable/);
    assert.equal(row.onboarding_completed, false);
  } finally { error = undefined; }
  try {
    for (const response of [null, { id: 'test-user' }, { id: 'test-user', onboarding_completed: false }]) {
      confirmedRow = response;
      await assert.rejects(completeOnboarding('test-user', personalDetails), /confirmar el guardado/);
    }
  } finally { confirmedRow = undefined; }
});

test('deletion requires explicit backend confirmation and propagates failures', async () => {
  for (const result of [{ data: true, error: null }, { data: false, error: null },
    { data: null, error: null }, { data: null, error: new Error('Delete failed') }]) {
    globalThis.__profileTestSupabase.rpc = async name => {
      assert.equal(name, 'delete_my_daily_records');
      return result;
    };
    if (result.data === true) await deleteUserRecords();
    else await assert.rejects(deleteUserRecords());
  }
});
