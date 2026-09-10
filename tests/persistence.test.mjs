import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Execute the real persistence functions against a minimal Supabase boundary.
// This verifies payloads/round trips without writing a production user's data.
let row;
let error;
globalThis.__profileTestSupabase = {
  from(table) {
    const chain = {
      select() { return chain; },
      or() { return table === 'daily_logs' ? Promise.resolve({ data: [], error: null }) : chain; },
      maybeSingle() { return Promise.resolve({ data: row, error: null }); },
      update(payload) { if (!error) row = { ...row, ...payload }; return { or: async () => ({ error }) }; },
      upsert(payload) { row = payload; return chain; },
      single() { return Promise.resolve({ data: row, error: null }); },
    };
    return chain;
  },
};
const source = (await readFile(new URL('../src/lib/db.ts', import.meta.url), 'utf8'))
  .replace("import { supabase } from './supabase';", 'const supabase = globalThis.__profileTestSupabase;')
  .replace("'../utils/helpers'", JSON.stringify(new URL('../src/utils/helpers.ts', import.meta.url).href));
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { fetchUserData, syncProfile } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('new-user default is persisted; saved activity survives fresh fetches', async () => {
  row = null;
  const initial = await fetchUserData('test-user', 'test@example.com');
  assert.equal(initial.activity, 'Sedentario');
  assert.equal(row.activity_level, 'Sedentario');
  for (const activity of ['Moderado', 'Activo']) {
    await syncProfile({ ...initial, activity });
    assert.equal(row.activity_level, activity);
    assert.equal((await fetchUserData('test-user')).activity, activity);
    assert.equal((await fetchUserData('test-user')).activity, activity);
  }
});

test('legacy/invalid values load safely; failed saves reject', async () => {
  row = { id: 'test-user', activity_level: 'unknown' };
  assert.equal((await fetchUserData('test-user')).activity, 'Sedentario');
  error = new Error('Simulated database failure');
  const originalError = console.error;
  console.error = () => {};
  try { await assert.rejects(syncProfile({ id: 'test-user', activity: 'Moderado' }), /Simulated/); }
  finally { error = undefined; console.error = originalError; }
});
