import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mount,act,record,nextGeneration,deferred,failure} from './helpers/atomic-store-harness.mjs';

test('reset waits for its receipt and canonical read, preserving profile settings',async t=>{
 const s=await mount(t);await act(async()=>assert.equal(await s.store.updateRecord(record.dateStr,record),true));
 const before=s.store.activeProfile,gate=deferred(),commit=s.db.commitRecordIntent;
 s.db.commitRecordIntent=async(...args)=>{await gate.promise;return commit(...args);};let pending;
 await act(()=>{pending=s.store.resetData();});assert.equal(s.store.activeProfile,before);
 await act(()=>gate.resolve());await act(()=>pending);assert.deepEqual(s.store.activeProfile.records,{});assert.equal(s.store.activeProfile.activity,before.activity);
});
test('reset failure retains records and rejects for the UI error state',async t=>{
 const s=await mount(t);await act(async()=>s.store.updateRecord(record.dateStr,record));const before=s.store.activeProfile;
 s.db.commitRecordIntent=async()=>{throw failure('ambiguous');};await act(async()=>assert.rejects(s.store.resetData(),/reinicio/));assert.equal(s.store.activeProfile,before);
});
test('a completed reset cannot clear another account after identity change',async t=>{
 const s=await mount(t),gate=deferred(),commit=s.db.commitRecordIntent;
 s.db.commitRecordIntent=async(...args)=>{await gate.promise;return commit(...args);};let pending;
 await act(()=>{pending=s.store.resetData();});const rejected=assert.rejects(pending,/reinicio/);
 await act(()=>s.emit('SIGNED_IN',{user:{id:'B'}}));const other=s.store.activeProfile;
 await act(()=>gate.resolve());await act(()=>rejected);assert.equal(s.store.activeProfile,other);
});
test('a concurrent device save makes reset re-read and preserve the newer records',async t=>{
 const s=await mount(t);s.server={protocol:'atomic',generation:nextGeneration,records:{[record.dateStr]:{...record,steps:999,version:'5',generation:nextGeneration}}};
 await act(async()=>assert.rejects(s.store.resetData(),/reinicio/));assert.equal(s.store.activeProfile.records[record.dateStr].steps,999);assert.equal(s.mutationCount,0);
});
test('reset is blocked while a local save is pending',async t=>{
 const s=await mount(t),gate=deferred(),commit=s.db.commitRecordIntent;s.db.commitRecordIntent=async(...args)=>{await gate.promise;return commit(...args);};let pending;
 await act(()=>{pending=s.store.updateRecord(record.dateStr,record);});await assert.rejects(s.store.resetData(),/guardado en curso/);
 await act(()=>gate.resolve());await act(()=>pending);assert.equal(s.calls.length,1);
});
test('a stale reset callback from account A never resets the currently active account B',async t=>{
 const s=await mount(t),oldReset=s.store.resetData;await act(async()=>s.emit('SIGNED_IN',{user:{id:'B'}}));
 await assert.rejects(oldReset(),/sesión activa/);assert.equal(s.calls.length,0);assert.equal(s.store.activeProfile.user_id,'B');
});
