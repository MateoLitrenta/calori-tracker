import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// Pass a local @electric-sql/pglite module URL to avoid adding a browser dependency.
const { PGlite } = await import(process.argv[2] || '@electric-sql/pglite');
const migration = await readFile(new URL('../migrations/202609110001_delete_daily_records.sql', import.meta.url), 'utf8');
const assertions = await readFile(new URL('./delete_daily_records.sql', import.meta.url), 'utf8');
const own = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
for (const action of ['cascade', 'restrict']) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as
      'select nullif(current_setting(''test.uid'', true), '''')::uuid';
    set test.uid = '${own}';
    create table public.profiles(id uuid primary key, activity_level text);
    create table public.daily_logs(id int primary key, user_id uuid, profile_id uuid references profiles);
    create table public.meals(id int primary key, user_id uuid, daily_log_id int references daily_logs on delete ${action});
    create table public.workouts(id int primary key, user_id uuid, daily_log_id int references daily_logs on delete ${action});
    insert into profiles values ('${own}', 'Activo'), ('${other}', 'Moderado');
    insert into daily_logs values (1, '${own}', '${own}'), (2, '${other}', '${other}');
    insert into meals values (1, '${own}', 1), (2, '${other}', 2), (3, '${own}', null);
    insert into workouts values (1, '${own}', 1), (2, '${other}', 2);
    grant usage on schema public, auth to authenticated;
    grant select, delete on all tables in schema public to authenticated;
    alter table daily_logs enable row level security;
    alter table meals enable row level security;
    alter table workouts enable row level security;
    create policy own_logs on daily_logs to authenticated using (user_id = auth.uid());
    create policy own_meals on meals to authenticated using (user_id = auth.uid());
    create policy own_workouts on workouts to authenticated using (user_id = auth.uid());
  `);
  await db.exec(migration);
  // Simulate a backend failure after child deletes: all changes must roll back.
  await db.exec("create function fail_delete() returns trigger language plpgsql as $$ begin raise exception 'Simulated failure'; end; $$; create trigger fail before delete on daily_logs for each row execute function fail_delete(); set role authenticated;");
  await assert.rejects(db.query('select public.delete_my_daily_records()'), /Simulated failure/);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int as n from meals')).rows[0].n, 3);
  assert.equal((await db.query('select count(*)::int as n from workouts')).rows[0].n, 2);
  await db.exec('drop trigger fail on daily_logs; drop policy own_logs on daily_logs; create policy own_logs on daily_logs for select to authenticated using (user_id = auth.uid()); set role authenticated');
  await assert.rejects(db.query('select public.delete_my_daily_records()'), /Daily records were not deleted/);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int as n from meals')).rows[0].n, 3);
  await db.exec('create policy delete_logs on daily_logs for delete to authenticated using (user_id = auth.uid()); set role authenticated');
  assert.equal((await db.query('select public.delete_my_daily_records() as ok')).rows[0].ok, true);
  await db.exec('reset role');
  await db.exec(assertions);
  assert.equal((await db.query(`select activity_level from profiles where id = '${own}'`)).rows[0].activity_level, 'Activo');
  await db.exec("set test.uid = ''");
  await assert.rejects(db.query('select public.delete_my_daily_records()'), /Authentication required/);
  await db.close();
  console.log(`PASS: ${action}, RLS/user isolation, orphan rows, rollback, profile preservation, unauthenticated rejection`);
}
