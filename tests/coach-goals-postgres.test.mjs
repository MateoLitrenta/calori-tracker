import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';

// Separate processes/connections are essential: PGlite cannot test MVCC races.
// Only a disposable loopback cluster is used, never a configured remote DB.
const bin = process.env.COACH_TEST_POSTGRES_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/17/bin' : '');
const executable = name => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
const own = '00000000-0000-0000-0000-000000000001';
const login = `set role authenticated; set "request.jwt.claim.sub"='${own}';`;
const insert = target => `insert into public.coach_goals(id,user_id,type,target,start_date,end_date)
  values('${randomUUID()}','${own}','workout_sessions',${target},current_date,current_date+6)`;
const delay = ms => new Promise(done => setTimeout(done, ms));

test('native PostgreSQL: migration rollback, trigger privileges, concurrent cap and expected-version updates',
  { skip: !bin || !existsSync(executable('initdb')) ? 'Set COACH_TEST_POSTGRES_BIN to run isolated native PostgreSQL races' : false, timeout: 90000 }, async t => {
    const tempBase = resolve(process.env.COACH_TEST_POSTGRES_TMP || tmpdir());
    const root = mkdtempSync(join(tempBase, 'calori-goals-pg-'));
    const data = join(root, 'data');
    const server = createServer(); await new Promise(done => server.listen(0, '127.0.0.1', done));
    const port = server.address().port; await new Promise(done => server.close(done));
    execFileSync(executable('initdb'), ['-D', data, '-U', 'coach_audit_admin', '-A', 'trust', '--encoding=UTF8', '--locale=C'], { windowsHide: true, stdio: 'pipe' });
    const postgres = spawn(executable('postgres'), ['-D', data, '-h', '127.0.0.1', '-p', String(port)], { windowsHide: true, stdio: ['ignore','ignore','pipe'] });
    let startupLog=''; postgres.stderr.on('data',chunk=>{startupLog+=chunk;});
    t.after(() => {
      execFileSync(executable('pg_ctl'), ['-D', data, 'stop', '-m', 'immediate', '-w'], { windowsHide: true, stdio: 'pipe' });
      const path = resolve(root), parent = tempBase;
      if (!path.startsWith(parent + sep) || !path.slice(parent.length + 1).startsWith('calori-goals-pg-')) throw new Error('Unsafe temporary cluster path');
      rmSync(path, { recursive: true, force: true });
    });
    const args = db => ['-X', '-qAt', '-h', '127.0.0.1', '-p', String(port), '-U', 'coach_audit_admin', '-d', db, '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
    const sql = (query, db = 'postgres') => execFileSync(executable('psql'), args(db), { input: query, encoding: 'utf8', windowsHide: true, timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    let ready = false, connectionError='';
    for (let i = 0; i < 100 && !ready; i++) { try { ready = sql('select 1') === '1'; } catch(error) { connectionError=String(error.stderr); await delay(50); } }
    assert.ok(ready, 'Disposable PostgreSQL started: '+startupLog+' '+connectionError);
    assert.equal(postgres.exitCode, null);
    const migration = readFileSync(new URL('../supabase/migrations/202610130001_coach_goals.sql', import.meta.url), 'utf8');
    sql('create role authenticated; create role anon; create database coach_failure;');
    const bootstrap = `create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${own}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid$$;
      grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`;
    sql(bootstrap); sql(bootstrap, 'coach_failure');
    assert.throws(() => sql(migration.replace(/commit;\s*$/i, 'select 1/0;\ncommit;'), 'coach_failure'), /division by zero/);
    assert.equal(sql("select to_regclass('public.coach_goals') is null and to_regprocedure('public.validate_coach_goal_change()') is null", 'coach_failure'), 't');
    sql(migration);
    assert.equal(sql("select has_function_privilege('authenticated','public.validate_coach_goal_change()','EXECUTE')"), 'f');
    sql(login + insert(1)); // Trigger works with EXECUTE revoked and SECURITY INVOKER.

    function session(query) {
      const child = spawn(executable('psql'), args('postgres'), { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      const state = { child, out: '', err: '' };
      child.stdout.on('data', chunk => { state.out += chunk; }); child.stderr.on('data', chunk => { state.err += chunk; });
      state.done = new Promise(done => child.on('close', code => done({ code, out: state.out.trim(), err: state.err })));
      child.stdin.write(query);
      return state;
    }
    async function until(condition, description) {
      for (let i = 0; i < 100; i++) { if (condition()) return; await delay(25); }
      assert.fail(description);
    }
    const waitForLock = label => until(() => sql(`select exists(select 1 from pg_stat_activity where application_name='${label}' and wait_event_type='Lock')`) === 't', 'Second transaction actually waits for the first');
    const finish = async (state, query = '') => { state.child.stdin.end(query); return state.done; };
    async function race(isolation = 'read committed') {
      sql('truncate public.coach_goals;');
      for (let i = 1; i <= 7; i++) sql(login + insert(i));
      const first = session(`begin; ${login} ${insert(8)}; select 'holding_eighth';\n`);
      await until(() => first.out.includes('holding_eighth'), 'First transaction inserted an uncommitted eighth goal');
      const second = session(`begin isolation level ${isolation}; ${login} set application_name='cap_race'; select count(*) from public.coach_goals; ${insert(9)}; commit;\n`);
      second.child.stdin.end();
      // READ COMMITTED waits on the advisory lock. REPEATABLE READ may be rejected safely before locking.
      if (isolation === 'read committed') await waitForLock('cap_race');
      else await until(() => second.out.includes('7'), 'Repeatable-read snapshot established before first commit');
      assert.equal((await finish(first, 'commit;\n')).code, 0);
      const result = await second.done;
      assert.notEqual(result.code, 0, `A concurrent ninth goal must fail under ${isolation}`);
      assert.match(result.err,isolation==='read committed'?/23514.*Too many active goals/:/25000.*Goal inserts require read committed isolation/);
      assert.equal(sql('select count(*) from public.coach_goals'), '8');
    }
    await race();
    await race('repeatable read');

    sql('truncate public.coach_goals;');
    const id = randomUUID();
    sql(login + `insert into public.coach_goals(id,user_id,type,target,start_date,end_date) values('${id}','${own}','workout_sessions',3,current_date,current_date+6);`);
    const first = session(`begin; ${login} update public.coach_goals set target=2 where id='${id}' and version=1 returning version; select 'holding_revision';\n`);
    await until(() => first.out.includes('holding_revision'), 'First update held before commit');
    const second = session(`${login} set application_name='version_race'; update public.coach_goals set target=4 where id='${id}' and version=1 returning version;\n`);
    second.child.stdin.end(); await waitForLock('version_race');
    assert.equal((await finish(first, 'commit;\n')).code, 0);
    const rejected = await second.done;
    assert.equal(rejected.code, 0); assert.equal(rejected.out, '', 'Stale WHERE version updates zero rows after lock release');
    assert.equal(sql(`select target||':'||version from public.coach_goals where id='${id}'`), '2:2');
  });
