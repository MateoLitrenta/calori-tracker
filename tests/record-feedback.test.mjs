import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mount, act, record, deferred, failure, nextGeneration } from './helpers/atomic-store-harness.mjs';

test('contextual success waits for receipt plus canonical reread and returns server CAS tokens', async t => {
  const s = await mount(t), wait = deferred(), commit = s.db.commitRecordIntent;
  s.db.commitRecordIntent = async (...args) => { await wait.promise; return commit(...args); };
  const confirmations = [], errors = []; let result;
  await act(() => { result = s.store.updateRecord(record.dateStr, { ...record, steps: 1000 }, {
    feedback: 'contextual', onConfirmed: (...args) => confirmations.push(args), onFailure: x => errors.push(x) }); });
  assert.equal(confirmations.length, 0); assert.equal(s.store.activeProfile.records[record.dateStr], undefined);
  await act(async () => { wait.resolve(); assert.equal(await result, true); });
  assert.equal(confirmations.length, 1); assert.equal(confirmations[0][0].steps, 1000);
  assert.equal(confirmations[0][0].version, s.store.activeProfile.records[record.dateStr].version);
  assert.equal(confirmations[0][1], s.store.activeProfile.recordGeneration); assert.deepEqual(errors, []); assert.deepEqual(s.errors, []);
});

test('a contextual conflict refreshes canonical data, keeps the submitted object and emits one local failure', async t => {
  const s = await mount(t), errors = [], draft = { ...record, steps: 1000 };
  s.db.commitRecordIntent = async () => { s.server.records[record.dateStr] = { ...record, steps: 9000, version: '8' }; throw failure('conflict'); };
  await act(async () => assert.equal(await s.store.updateRecord(record.dateStr, draft, {
    feedback: 'contextual', onFailure: x => errors.push(x), onConfirmed: () => assert.fail('No acknowledgement') }), false));
  assert.equal(errors.length, 1); assert.equal(errors[0].kind, 'conflict'); assert.equal(s.errors.length, 0);
  assert.equal(draft.steps, 1000); assert.equal(s.store.activeProfile.records[record.dateStr].steps, 9000);
});

test('repeated record failures use one stable toast ID', async t => {
  const s = await mount(t); s.db.commitRecordIntent = async () => { throw failure('ambiguous'); };
  await act(async () => { await s.store.updateRecord(record.dateStr, record); await s.store.updateRecord(record.dateStr, record); });
  assert.equal(s.notifications.length, 2); assert.ok(s.notifications[0].id); assert.equal(s.notifications[0].id, s.notifications[1].id);
});

test('contextual reset delegates its single error to the caller', async t => {
  const s = await mount(t); s.db.commitRecordIntent = async () => { throw failure('ambiguous'); };
  await act(async () => assert.rejects(s.store.resetData(), /reinicio/)); assert.equal(s.errors.length, 0);
});

test('a reset and recreation with the same day version cannot acknowledge an older generation', async t => {
  const s = await mount(t), errors = [], confirmed = [];
  s.db.commitRecordIntent = async (_owner, intent) => {
    s.server = { protocol: 'atomic', generation: '44444444-4444-4444-8444-444444444444', records: {
      [record.dateStr]: { ...record, generation: '44444444-4444-4444-8444-444444444444', version: '1', steps: 9000 } } };
    return { operation_id: intent.operationId, version: '1', generation: nextGeneration };
  };
  await act(async () => assert.equal(await s.store.updateRecord(record.dateStr, { ...record, steps: 500 }, {
    feedback: 'contextual', onFailure: x => errors.push(x), onConfirmed: x => confirmed.push(x) }), false));
  assert.equal(confirmed.length, 0); assert.equal(errors[0].kind, 'conflict');
  assert.equal(s.store.activeProfile.records[record.dateStr].steps, 9000);
});
