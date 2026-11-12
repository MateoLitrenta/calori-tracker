import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HabitDraftController } from '../src/lib/habitDraft.ts';

const date = '2026-11-12';
const initial = () => ({ dateStr: date, date: new Date(date + 'T12:00:00'), generation: 'generation-1', version: '1',
  steps: 0, water: 0, meals: [{ id: 'existing', name: 'Existing meal', calories: 400 }], workouts: [] });
function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const state = { latest: initial(), calls: [], changes: 0 };
  state.controller = new HabitDraftController(() => state.latest, (day, record, options) => {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    state.calls.push({ day, record: structuredClone(record), options, resolve }); return promise;
  }, () => { state.changes++; });
  state.flush = () => t.mock.timers.tick(400);
  state.finish = async (index, success, kind = 'ambiguous') => {
    const call = state.calls[index];
    if (success) {
      state.latest = { ...structuredClone(call.record), version: String(Number(state.latest.version) + 1), generation: 'generation-' + (index + 2) };
      call.options.onConfirmed(state.latest, state.latest.generation);
    } else call.options.onFailure({ kind, message: 'Synthetic failure' });
    call.resolve(success); await Promise.resolve(); await Promise.resolve();
  };
  t.after(() => state.controller.dispose()); return state;
}

test('rapid steps and water changes share one debounce and preserve every increment', async t => {
  const s = setup(t), c = s.controller;
  for (let i = 0; i < 6; i++) { c.add(date, 'steps', 500); c.add(date, 'water', 250); }
  assert.equal(s.calls.length, 0); assert.equal(c.view(date).status, 'editing'); s.flush();
  assert.equal(s.calls.length, 1); assert.equal(s.calls[0].record.steps, 3000); assert.equal(s.calls[0].record.water, 1500);
  assert.equal(c.view(date).status, 'saving'); await s.finish(0, true); assert.equal(c.view(date).status, 'saved');
});

test('increments while a response is pending serialize against the confirmed canonical version', async t => {
  const s = setup(t), c = s.controller;
  c.add(date, 'steps', 500); s.flush(); c.add(date, 'steps', 500); c.add(date, 'water', 250); s.flush();
  assert.equal(s.calls.length, 1); assert.equal(c.view(date).steps, 1000);
  await s.finish(0, true); s.flush(); assert.equal(s.calls.length, 2);
  assert.equal(s.calls[1].record.steps, 1000); assert.equal(s.calls[1].record.water, 250);
  assert.equal(s.calls[1].record.version, '2'); assert.equal(s.calls[1].record.generation, s.latest.generation);
  assert.deepEqual(s.calls[1].record.meals, initial().meals);
  await s.finish(1, true); assert.equal(c.view(date).status, 'saved');
});

test('an uncertain response pauses, preserves newer input and replays the identical payload on explicit retry', async t => {
  const s = setup(t), c = s.controller;
  c.add(date, 'water', 250); s.flush(); await s.finish(0, false);
  c.add(date, 'water', 250); t.mock.timers.tick(10000);
  assert.equal(s.calls.length, 1); assert.equal(c.view(date).water, 500); assert.equal(c.view(date).status, 'unconfirmed');
  c.retry(date); assert.equal(s.calls.length, 2); assert.deepEqual(s.calls[1].record, s.calls[0].record);
  await s.finish(1, true); s.flush(); assert.equal(s.calls[2].record.water, 500);
});

test('a known validation failure sends the corrected input on explicit retry', async t => {
  const s = setup(t), c = s.controller;
  c.set(date, 'steps', 500.5); s.flush(); await s.finish(0, false, 'invalid');
  c.set(date, 'steps', 500); c.retry(date);
  assert.equal(s.calls[1].record.steps, 500); assert.equal(s.calls[1].record.version, '1');
});

test('a true conflict keeps the draft, shows latest untouched values and requires a reviewed version', t => {
  const s = setup(t), c = s.controller;
  c.add(date, 'steps', 500); s.latest = { ...s.latest, version: '2', generation: 'other-device', water: 1000,
    meals: [...s.latest.meals, { id: 'other-device-meal' }] }; s.flush();
  assert.equal(s.calls.length, 0); assert.equal(c.view(date).status, 'conflict');
  assert.equal(c.view(date).steps, 500); assert.equal(c.view(date).water, 1000);
  const displayed = structuredClone(s.latest); s.latest = { ...s.latest, version: '3' };
  assert.equal(c.review(date, displayed), false); assert.equal(s.calls.length, 0);
  assert.equal(c.review(date, s.latest), true); s.flush();
  assert.equal(s.calls[0].record.steps, 500); assert.equal(s.calls[0].record.water, 1000);
  assert.equal(s.calls[0].record.version, '3'); assert.equal(s.calls[0].record.meals.length, 2);
});

test('server conflicts never automatically retry; cancel restores canonical values', async t => {
  const s = setup(t), c = s.controller;
  c.add(date, 'steps', 500); s.flush(); s.latest = { ...s.latest, version: '2', steps: 9000 };
  await s.finish(0, false, 'conflict'); t.mock.timers.tick(10000);
  assert.equal(s.calls.length, 1); assert.equal(c.view(date).steps, 500);
  c.discard(date); assert.equal(c.view(date).steps, 9000); assert.equal(c.view(date).status, undefined);
});

test('inline editing captures its baseline before blur and detects changes while typing', t => {
  const s = setup(t), c = s.controller;
  c.begin(date); s.latest = { ...s.latest, version: '2', steps: 9000 };
  c.set(date, 'steps', 7000); s.flush();
  assert.equal(s.calls.length, 0); assert.equal(c.view(date).status, 'conflict'); assert.equal(c.view(date).steps, 7000);
});

test('Strict Mode effect reconnect preserves a usable controller and no-op edits never claim a save', t => {
  const s = setup(t), c = s.controller;
  c.dispose(); c.connect(); c.begin(date); c.set(date, 'steps', 0);
  assert.equal(c.view(date).status, undefined); assert.equal(s.calls.length, 0);
  c.add(date, 'steps', 500); s.flush(); assert.equal(s.calls.length, 1);
});

test('a boolean without canonical acknowledgement cannot announce success or invent a version', async t => {
  const s = setup(t), c = s.controller;
  c.add(date, 'steps', 500); s.flush(); s.calls[0].resolve(true); await Promise.resolve(); await Promise.resolve();
  assert.equal(c.view(date).status, 'unconfirmed'); assert.equal(c.view(date).steps, 500); assert.equal(s.latest.version, '1');
});

test('unmount or identity change cancels queued work and never sends a follow-up', async t => {
  const s = setup(t), c = s.controller;
  c.add(date, 'steps', 500); s.flush(); c.add(date, 'water', 250); c.dispose(); await s.finish(0, true); t.mock.timers.tick(10000);
  assert.equal(s.calls.length, 1);
});

test('an old account completion cannot resume or unlock the next owner queue', async t => {
  const s = setup(t), c = s.controller;
  c.add(date, 'steps', 500); s.flush();
  c.resetOwner(); c.connect(); c.add(date, 'water', 250); s.flush();
  assert.equal(s.calls.length, 2); assert.equal(c.view(date).steps, 0);
  await s.finish(0, false); assert.equal(c.view(date).status, 'saving');
  c.add(date, 'water', 250); s.flush(); assert.equal(s.calls.length, 2);
  await s.finish(1, true); s.flush(); assert.equal(s.calls.length, 3); assert.equal(s.calls[2].record.water, 500);
});
