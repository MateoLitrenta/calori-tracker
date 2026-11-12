import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ensureMealPhotoUploaded,reviewEntryBase,snapshotEntryRecord} from '../src/lib/entrySubmission.ts';

const record={dateStr:'2026-11-11',date:new Date('2026-11-11T12:00:00'),meals:[],workouts:[],steps:0,water:0,version:'9007199254740993',generation:'generation-one'};
test('entry snapshots retain bigint version strings and require review for version, generation and date changes',()=>{
 const base=snapshotEntryRecord(record,record.generation);assert.equal(base.version,'9007199254740993');
 assert.notEqual(base.meals,record.meals);assert.notEqual(base.workouts,record.workouts);
 assert.equal(reviewEntryBase(base,record,record.generation,()=>assert.fail('No change to review')),base);
 for(const latest of [{...record,version:'9007199254740994'},{...record,generation:'generation-two'},{...record,dateStr:'2026-11-12'}]){
  assert.equal(reviewEntryBase(base,latest,latest.generation,()=>false),null);
  const accepted=reviewEntryBase(base,latest,latest.generation,()=>true);assert.equal(accepted.version,latest.version);assert.equal(accepted.generation,latest.generation);assert.equal(accepted.dateStr,latest.dateStr);
 }
});

test('an uploaded meal photo is reused without another upload or download during a DB retry',async()=>{
 const blob=new Blob(['synthetic bytes']),intent={blob,path:'owner/new-photo.jpg',attempted:false,uploaded:false};let uploads=0;
 const storage={upload:async(path,body,options)=>{uploads++;assert.equal(path,intent.path);assert.equal(body,blob);assert.deepEqual(options,{contentType:'image/jpeg'});return{error:null};},download:async()=>assert.fail('No read is needed for a confirmed upload')};
 assert.equal(await ensureMealPhotoUploaded(storage,intent),intent.path);assert.equal(await ensureMealPhotoUploaded(storage,intent),intent.path);assert.equal(uploads,1);
});

test('a lost upload response cannot save immediately; explicit retry verifies exact bytes without upsert',async()=>{
 const blob=new Blob(['synthetic bytes']),intent={blob,path:'owner/retry-photo.jpg',attempted:false,uploaded:false};let uploads=0,reads=0;
 const storage={upload:async(_path,_body,options)=>{uploads++;assert.equal(options.upsert,undefined);return{error:new Error('Upload response unavailable')};},download:async()=>{reads++;return{data:blob,error:null};}};
 await assert.rejects(ensureMealPhotoUploaded(storage,intent),/confirmar/);assert.equal(intent.uploaded,false);assert.equal(reads,0);
 assert.equal(await ensureMealPhotoUploaded(storage,intent),intent.path);assert.equal(uploads,2);assert.equal(reads,1);assert.equal(intent.uploaded,true);
});

test('a different object at the retained path is never overwritten or accepted as the draft photo',async()=>{
 const intent={blob:new Blob(['wanted']),path:'owner/retry-photo.jpg',attempted:true,uploaded:false};
 const storage={upload:async(_path,_body,options)=>{assert.equal(options.upsert,undefined);return{error:new Error('Already exists')};},download:async()=>({data:new Blob(['other']),error:null})};
 await assert.rejects(ensureMealPhotoUploaded(storage,intent),/confirmar/);assert.equal(intent.uploaded,false);
});
