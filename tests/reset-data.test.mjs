import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

let state;
let index;
let remove;
globalThis.__resetHarness = {
  react: {
    useState() { const slot = index++; return [state[slot], value => {
      state[slot] = typeof value === 'function' ? value(state[slot]) : value;
    }]; },
    useEffect() {},
  },
  db: { deleteUserRecords: () => remove() },
};
let source = await readFile(new URL('../src/hooks/useAppStore.ts', import.meta.url), 'utf8');
source = source.replace("import { useState, useEffect } from 'react';",
  'const {useState, useEffect} = globalThis.__resetHarness.react;')
  .replace("import * as db from '../lib/db';", 'const db = globalThis.__resetHarness.db;')
  .replace("import { supabase } from '../lib/supabase';", 'const supabase = {};')
  .replace("import toast from 'react-hot-toast';", 'const toast = {};')
  .replace("'../utils/helpers'", JSON.stringify(new URL('../src/utils/helpers.ts', import.meta.url).href));
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { useAppStore: runHook } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const profile = { id: 'u', activity: 'Activo', name: 'Test', records: { today: { meals: [1] } } };
function setup() { state = [{ id: 'u' }, profile, false]; index = 0; return runHook(); }

test('reset waits for backend, clears records only, and preserves profile settings', async () => {
  let resolve;
  remove = () => new Promise(done => { resolve = done; });
  const store = setup();
  const pending = store.resetData();
  assert.equal(state[1], profile);
  resolve();
  await pending;
  assert.deepEqual(state[1], { ...profile, records: {} });
});
test('reset failure retains local records and rejects for the UI error state', async () => {
  remove = async () => { throw new Error('Backend unavailable'); };
  await assert.rejects(setup().resetData(), /Backend unavailable/);
  assert.equal(state[1], profile);
});
test('a completed reset does not clear a different profile after account change', async () => {
  let resolve;
  remove = () => new Promise(done => { resolve = done; });
  const pending = setup().resetData();
  const other = { ...profile, id: 'other' };
  state[1] = other;
  resolve();
  await pending;
  assert.equal(state[1], other);
});
