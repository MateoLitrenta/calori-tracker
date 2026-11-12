import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mount,act,record,generation,nextGeneration,deferred,failure} from './helpers/atomic-store-harness.mjs';

test('a delayed initial session never replaces a newer account event',async t=>{
 const initial=deferred(),s=await mount(t,()=>initial.promise);await act(()=>s.emit('SIGNED_IN',{user:{id:'B'}}));
 await act(()=>initial.resolve({data:{session:{user:{id:'A'}}}}));assert.equal(s.store.user.id,'B');assert.equal(s.store.activeProfile.user_id,'B');
});
test('a delayed initial session never restores a signed-out account',async t=>{
 const initial=deferred(),s=await mount(t,()=>initial.promise);await act(()=>s.emit('SIGNED_OUT',null));
 await act(()=>initial.resolve({data:{session:{user:{id:'A'}}}}));assert.equal(s.store.user,null);assert.equal(s.store.activeProfile,null);
});
test('initial session read failure settles loading without publishing an account',async t=>{
 const s=await mount(t,async()=>{throw Error('offline');});assert.equal(s.store.loading,false);assert.equal(s.store.user,null);
});
test('an in-flight account write blocks another day and never publishes an optimistic success',async t=>{
 const s=await mount(t),gate=deferred(),commit=s.db.commitRecordIntent;let count=0;
 s.db.commitRecordIntent=async(...args)=>{count++;await gate.promise;return commit(...args);};let first;
 await act(()=>{first=s.store.updateRecord(record.dateStr,{...record,steps:700});});
 assert.equal(s.store.activeProfile.records[record.dateStr],undefined);
 await act(async()=>assert.equal(await s.store.updateRecord('2026-11-12',{...record,dateStr:'2026-11-12'}),false));
 assert.equal(count,1);await act(()=>gate.resolve());await act(async()=>assert.equal(await first,true));
 assert.equal(s.store.activeProfile.records[record.dateStr].steps,700);
});
test('an ambiguous response retains the exact intention for explicit retry and preserves the caller draft',async t=>{
 const s=await mount(t),commit=s.db.commitRecordIntent,draft={...record,steps:900};let firstId;
 s.db.commitRecordIntent=async(_owner,intent)=>{firstId=intent.operationId;throw failure('ambiguous');};
 await act(async()=>assert.equal(await s.store.updateRecord(record.dateStr,draft),false));
 assert.equal(s.store.activeProfile.records[record.dateStr],undefined);assert.equal(draft.steps,900);
 s.db.commitRecordIntent=async(owner,intent)=>{assert.equal(intent.operationId,firstId);return commit(owner,intent);};
 await act(async()=>assert.equal(await s.store.updateRecord(record.dateStr,draft),true));assert.equal(s.mutationCount,1);
});
test('an ambiguous intention is retained across a later failed authentication attempt',async t=>{
 const s=await mount(t),commit=s.db.commitRecordIntent;let original;
 s.db.commitRecordIntent=async(_owner,intent)=>{original=intent.operationId;throw failure('ambiguous');};
 await act(async()=>assert.equal(await s.store.updateRecord(record.dateStr,record),false));
 s.db.commitRecordIntent=async(_owner,intent)=>{assert.equal(intent.operationId,original);throw failure('session');};
 await act(async()=>assert.equal(await s.store.updateRecord(record.dateStr,record),false));
 s.db.commitRecordIntent=async(owner,intent)=>{assert.equal(intent.operationId,original);return commit(owner,intent);};
 await act(async()=>assert.equal(await s.store.updateRecord(record.dateStr,record),true));assert.equal(s.mutationCount,1);
});
test('a changed draft first resolves the previous ambiguous intention, never claims the new content was saved',async t=>{
 const s=await mount(t),commit=s.db.commitRecordIntent;let id;
 s.db.commitRecordIntent=async(_owner,intent)=>{id=intent.operationId;throw failure('ambiguous');};
 await act(async()=>assert.equal(await s.store.updateRecord(record.dateStr,{...record,steps:100}),false));
 s.db.commitRecordIntent=async(owner,intent)=>{assert.equal(intent.operationId,id);return commit(owner,intent);};
 await act(async()=>assert.equal(await s.store.updateRecord(record.dateStr,{...record,steps:999}),false));
 assert.equal(s.store.activeProfile.records[record.dateStr].steps,100);assert.equal(s.mutationCount,1);
});
test('conflict re-reads server state without changing or silently rebasing the submitted draft',async t=>{
 const s=await mount(t),draft={...record,steps:100};
 s.server={protocol:'atomic',generation:nextGeneration,records:{[record.dateStr]:{...record,steps:800,version:'4',generation:nextGeneration}}};
 await act(async()=>assert.equal(await s.store.updateRecord(record.dateStr,draft),false));
 assert.equal(s.store.activeProfile.records[record.dateStr].steps,800);assert.equal(draft.steps,100);assert.equal(draft.generation,generation);
 await act(async()=>assert.equal(await s.store.updateRecord(record.dateStr,draft),false));assert.equal(s.mutationCount,0);
 await act(async()=>assert.equal(await s.store.updateRecord(record.dateStr,{...draft,version:'4',generation:nextGeneration}),true));
});
test('an acknowledged commit with failed refresh is retried with its original receipt, not duplicated',async t=>{
 const s=await mount(t),read=s.db.fetchRecordSnapshot;s.db.fetchRecordSnapshot=async()=>{throw Error('read failed');};
 await act(async()=>assert.equal(await s.store.updateRecord(record.dateStr,record),false));assert.equal(s.mutationCount,1);
 s.db.fetchRecordSnapshot=read;await act(async()=>assert.equal(await s.store.updateRecord(record.dateStr,record),true));
 assert.equal(s.mutationCount,1);assert.equal(s.calls[0].intent.operationId,s.calls[1].intent.operationId);
});
test('logout/account change during a save cannot publish or confirm into the next account',async t=>{
 const s=await mount(t),gate=deferred(),commit=s.db.commitRecordIntent;
 s.db.commitRecordIntent=async(...args)=>{await gate.promise;return commit(...args);};let pending;
 await act(()=>{pending=s.store.updateRecord(record.dateStr,record);});await act(()=>s.emit('SIGNED_IN',{user:{id:'B'}}));
 await act(()=>gate.resolve());await act(async()=>assert.equal(await pending,false));assert.equal(s.store.activeProfile.user_id,'B');assert.deepEqual(s.store.activeProfile.records,{});
});
test('signing back into the same account does not accept a result from the previous session epoch',async t=>{
 const s=await mount(t),gate=deferred(),commit=s.db.commitRecordIntent;
 s.db.commitRecordIntent=async(...args)=>{await gate.promise;return commit(...args);};let pending;
 await act(()=>{pending=s.store.updateRecord(record.dateStr,record);});await act(()=>s.emit('SIGNED_OUT',null));await act(()=>s.emit('SIGNED_IN',{user:{id:'A'}}));
 await act(()=>gate.resolve());await act(async()=>assert.equal(await pending,false));assert.deepEqual(s.store.activeProfile.records,{});
});
test('profile failure retains shared profile and rejects a foreign profile before writing',async t=>{
 const s=await mount(t),before=s.store.activeProfile;let calls=0;s.db.syncProfile=async()=>{calls++;throw Error('No confirmed row');};
 await act(async()=>assert.rejects(s.store.updateProfile({...before,name:'Draft'}),/No confirmed row/));assert.equal(s.store.activeProfile,before);
 await assert.rejects(s.store.updateProfile({...before,id:'B',user_id:'B'}),/perfil activo/);assert.equal(calls,1);
});
test('a delayed profile save cannot replace newer record tokens with its older form snapshot',async t=>{
 const s=await mount(t),gate=deferred(),before=s.store.activeProfile;s.db.syncProfile=async()=>gate.promise;let pending;
 await act(()=>{pending=s.store.updateProfile({...before,name:'Updated profile'});});
 await act(async()=>assert.equal(await s.store.updateRecord(record.dateStr,record),true));
 const current=s.store.activeProfile;await act(()=>gate.resolve());await act(()=>pending);
 assert.equal(s.store.activeProfile.name,'Updated profile');assert.equal(s.store.activeProfile.recordGeneration,current.recordGeneration);
 assert.equal(s.store.activeProfile.records,current.records);assert.equal(s.store.activeProfile.recordProtocol,'atomic');
});
test('date mismatch is rejected before any persistence request',async t=>{
 const s=await mount(t);await act(async()=>assert.equal(await s.store.updateRecord('2026-11-12',record),false));assert.equal(s.calls.length,0);
});
test('a delayed callback captured by account A cannot start a save as the newly active account B',async t=>{
 const s=await mount(t),oldSave=s.store.updateRecord;await act(async()=>s.emit('SIGNED_IN',{user:{id:'B'}}));
 await act(async()=>assert.equal(await oldSave(record.dateStr,record),false));assert.equal(s.calls.length,0);assert.equal(s.store.activeProfile.user_id,'B');
});
test('an old profile fetch resolving in the same batch as an account event is never published',async t=>{
 const s=await mount(t),old=deferred(),next=deferred();
 s.db.fetchUserData=id=>id==='A'?old.promise:next.promise;
 await act(async()=>{s.emit('SIGNED_OUT',null);});
 await act(async()=>{s.emit('SIGNED_IN',{user:{id:'A'}});});
 await act(async()=>{s.emit('SIGNED_IN',{user:{id:'B'}});old.resolve({id:'A',user_id:'A',name:'Private A',records:{}});});
 assert.notEqual(s.store.activeProfile?.user_id,'A');
 await act(async()=>next.resolve({id:'B',user_id:'B',name:'B',records:{}}));assert.equal(s.store.activeProfile.user_id,'B');
});
