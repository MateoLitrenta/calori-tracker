# V9.2: transactional daily records

## Status and deployment boundary

The SQL files under `supabase/proposals/transactional-records-v9-2/` are
review candidates, outside the executable migration chain. None has been applied
remotely. The older V9.1 `002_atomic_records.sql` is neither applied nor modified.
This change does not alter energy formulas, authentication, AI quotas or goals.

The new client uses the RPC protocol exclusively for record writes. A missing
snapshot RPC permits a **read-only** legacy read fallback; it never authorizes a
legacy write. `prepared`, `read_only`, an unavailable protocol and uncertain
protocol errors block new record mutations. A Preview against the current remote
schema therefore cannot certify writes or activate this proposal.

## RPC contract

All three public functions require the authenticated caller's JWT context. They
derive ownership from `auth.uid()`; no user/profile owner parameter is accepted.
PostgREST must call these volatile functions with POST, at READ COMMITTED.

`calori_record_snapshot_v1()` returns:

```json
{"protocol":"prepared|atomic|read_only","generation":"uuid","records":[]}
```

Each record contains the existing daily-log fields, `version` as decimal **text**,
and nested `meals` and `workouts`. The snapshot and generation are obtained under
the same shared global protocol lock and exclusive owner lock. The first snapshot
may initialize private owner state; this is not a read-only SQL transaction.

`calori_save_daily_record_v1(p_operation_id uuid, p_date date,
p_expected_version bigint, p_generation uuid, p_day jsonb)` returns:

```json
{"operation_id":"uuid","day_id":"uuid","version":"decimal text","generation":"uuid"}
```

Send `p_expected_version` as an exact decimal string, or null for an absent day.
Never pass it through a JavaScript Number. `p_day` requires exactly the keys
`steps`, `water_ml`, `weight`, `meals` and `workouts`. The arrays describe the whole
desired child collection, so omission of an existing child means deletion.

Meal objects accept `id`, `description`, `meal_type`, `calories`, `time_str`,
`meal_details` and `photo_path`. Workout objects accept `id`, `activity_name`,
`duration_min`, `calories_burned`, `workout_details`, `time_str`, `distance_km` and
`pace_str`. Child IDs are required and unique within their collection. Ownership,
parent IDs, dates, timestamps and unknown fields are rejected. Existing nullable
values are accepted; updates preserve existing child timestamps and legacy dates,
including NULL or a finite date different from the parent day. Ownership and
parent identity stay immutable; existing dates are not normalized automatically.
Newly inserted children derive their date/parent from the day.

Steps, water, calories, duration and expenditure are nullable, nonnegative
integers within the existing integer-column range. Weight is null or positive;
distance is null or nonnegative. Text fields are null or strings. A non-null meal
photo must have the caller's path prefix and an existing, RLS-visible metadata row
in `storage.objects` for `meal-photos`.

`calori_reset_daily_records_v1(p_operation_id uuid, p_generation uuid)` returns:

```json
{"operation_id":"uuid","generation":"uuid","deleted_days":0}
```

Reset deletes only the caller's days and their FK-cascaded children. It preserves
operation receipts, profiles, photos, goals and other users' records.

## Conflict and retry behavior

Every successful save or reset changes the account generation UUID. Save also
allocates a global monotonic bigint revision; rollback can leave harmless sequence
gaps. Together these prevent stale writes and delete/recreate ABA conflicts.
This deliberately rejects concurrent changes to different days of the same
account: simpler account-wide consistency trades away some write concurrency.

The private ledger is keyed by `(user_id, operation_id)`. Its server-generated
SHA-256 covers operation kind, generation, expected version/date and payload.
An exact retry returns its original receipt **before** checking current generation
or mode. Reusing an ID with different input fails. Keep the same ID and immutable
payload when resolving an uncertain response; never manufacture a new operation
to silently retry a conflict. A receipt describes a past committed operation,
not proof that the day still exists: refresh the snapshot after recovery/replay.
An old save replay after reset returns its receipt without recreating records.

The client makes at most one automatic replay after an uncertain transport result
(two identical RPC attempts). Further explicit submissions reuse the same pending
operation. An intervening authentication failure does not discard an operation
that may already have committed. A changed draft first resolves that operation;
it is not reported as saved until its own intention is submitted and confirmed.
Requests bind the initiating JWT, and an account/session epoch prevents late
responses or profile loads from publishing into another session.

There is no optimistic success: the shared store publishes a validated canonical
snapshot only after the durable receipt. Forms retain their base generation,
version, entry IDs, notes and uploads after failure. Rebasing requires explicit
review; a deleted entry is not silently recreated. Coach changes are limited to
keeping the explicitly confirmed batch's IDs/base across retries; model calls,
goals, quota logic and energy calculations are unchanged.

Errors are `PT409 / RECORD_CONFLICT`, `22023` for invalid input or operation-ID
reuse, `28000` for missing authentication, `25000` for unsupported isolation,
and `PT503 / RECORD_PROTOCOL_NOT_ACTIVE` or `RECORD_WRITES_PAUSED`. Unexpected
database failures roll back the whole function call, including private state and
receipt insertion. Do not reinterpret network failures as confirmed persistence.

Receipts have no TTL or automatic garbage collection. Storage growth and a future
retention design require review; removing receipts too early breaks durable retry
safety. Auth-account deletion still cascades that account's private rows.

## SECURITY DEFINER boundary

The public RPCs are owned by `calori_record_writer`, a NOLOGIN, NOBYPASSRLS role
that inherits `authenticated`. The grant direction is intentional: authenticated
clients are not members of the writer. The role is not a base-table owner.
It receives explicit record CUD privileges which survive revocation of the legacy
client grants; the existing V9.1 restrictive ownership gates and permissive
authenticated policies still enforce the caller's JWT identity.

Functions use an empty search path and qualified application objects. Private
helpers run as invokers inside that writer context. Private tables use RLS and
explicit minimal grants: the writer can read configuration, update its own
generation and insert/read its own receipts; it cannot change protocol mode or
delete receipts. Public/anon/client access to the private schema is revoked.
The public RPCs are executable only by authenticated clients, not PUBLIC/anon.

Run `000_operator_readonly.sql` with the intended operator before remote use.
The catalog-only check is separate from all modifying scripts. The observed
Calori operator is `postgres`, PostgreSQL 17.6, CREATEROLE but not superuser. It
owns the four application tables and can grant the required Storage access,
create private objects and administer membership in `authenticated`. It cannot
regrant `auth` schema USAGE. Preparation therefore inherits that access and
`auth.uid()` EXECUTE from `authenticated`, and asserts the effective privileges.
An explicit self-membership grant enables SET to the newly created writer role;
CREATE on the two schemas is temporary for function ownership transfer and is
revoked before commit. See `validation/transactional-records-v9-2-operator.json`
for the read-only evidence. No DDL was attempted remotely.

## Controlled rollout and safe recovery

1. Obtain separate approval for code integration and the coordinated deployment.
   Verify a current recoverable database/Auth/roles backup and all Storage bytes,
   their SHA-256 inventory, the current V9.1 postflight, the exact eight
   validated CASCADE FK relationships, supported roles and the current catalog.
   Run the rehearsed candidate only after independent deployment authorization.
2. Recheck `000_operator_readonly.sql` using the same secured operator/target.
   Apply `001_prepare.sql`. It reuses V9.1 postflight assertions and validates FK
   topology. It adds literal default version 1, private state/ledger/sequence and
   RPCs in `prepared` mode. Existing legacy writers still work; authenticated users
   do not need private sequence privileges. Prepared RPC writes reject new work.
   Users on the old frontend can still save during this phase.
3. Deploy and verify the new frontend in read-only record mode. Resolve the
   transition deliberately before activation; do not promise uninterrupted writes
   from already open tabs or old app versions. Users of the new frontend can
   sign in and read records, but record saving/reset is temporarily unavailable;
   their drafts remain available. Profile/goal/Auth policies are unchanged.
4. Apply `002_activate.sql` during a controlled window. It acquires the exclusive
   global advisory lock **before** the three table locks, invalidates all prepared
   generations and day revisions, revokes table **and column** direct record CUD,
   closes the legacy reset function, sets `atomic` and reloads PostgREST. It leaves
   profiles and V9.1 RLS unchanged. Ask authorized users to finish legacy saves
   and reload old tabs before this low-activity window. Table locks finish each
   SQL transaction, not a legacy form's multiple HTTP requests: an old in-flight
   multi-request save can be interrupted and require review. After commit old
   tabs fail closed and must reload/update. No JWT/key/session migration is
   needed: valid sessions remain valid, but clients need a fresh snapshot.
5. Verify fresh snapshots, confirmed saves, child edits/deletes, cross-user
   isolation, retries/conflicts and reset from two independent sessions. Check
   PostgREST schema reload and record preservation. Do not blindly rerun activation
   after an uncertain connection result. Check profile, Auth refresh, private
   photographs, goals and Coach with authorized sessions; monitor Supabase and
   Vercel errors before announcing that saves are available again. The first
   submission from a stale prepared screen may refresh and request review; it
   must not be presented as saved.
6. If necessary, explicitly apply `003_readonly_recovery.sql`. The same global
   gate waits for in-flight RPCs and switches to `read_only`, retaining isolation,
   closed legacy grants, data and receipts. Historical replay still works; new
   writes stop. Never restore legacy grants as an availability workaround.
   After activation, rolling the frontend back to a legacy build does not restore
   saving. Keep an atomic-compatible frontend, or stay in read-only mode while
   correcting the fault; no rollback may reopen the old grants.
7. After diagnosing and verifying the correction, obtain approval to run
   `004_resume.sql`, not `002_activate.sql` again. It requires `read_only`, takes
   the same exclusive protocol gate, checks V9.1, writer ownership/search paths
   and closed legacy grants, and invalidates only account generations. Day
   versions, receipts, records and photographs are retained. Fresh reads and new
   confirmed saves must succeed before reopening. Exact historical retries still
   return their original receipts; they are not evidence that new writes work.
   A failed assertion or lock timeout rolls back and leaves writes paused.

Use `psql` against the independently verified target with local secure credential
entry and verified TLS, never a password in shell arguments or committed env files:

```sh
psql -X --set=ON_ERROR_STOP=1 --file=supabase/proposals/transactional-records-v9-2/001_prepare.sql
# Deploy/verify the new client, then obtain activation approval.
psql -X --set=ON_ERROR_STOP=1 --file=supabase/proposals/transactional-records-v9-2/002_activate.sql
# Only if an approved recovery is needed:
psql -X --set=ON_ERROR_STOP=1 --file=supabase/proposals/transactional-records-v9-2/003_readonly_recovery.sql
# Only after the cause is corrected, verified, and resumption is approved:
psql -X --set=ON_ERROR_STOP=1 --file=supabase/proposals/transactional-records-v9-2/004_resume.sql
```

Cancel activation on a failed prerequisite, unverified backup, unexpected schema,
lock timeout or failed functional check. Check commit state after a lost SQL
connection; do not repeat a non-idempotent migration blindly. Before activation,
confirm there are no privileged/background legacy record writers bypassing the
normal client grants. No environment variable or automatic CI step activates SQL.

Storage bytes are external to the database transaction. Photo metadata checks
do not certify the object service or prevent later external deletion. Do not
automatically delete an ambiguous/shared photo after an uncertain record result.
The UI keeps an upload's immutable path/blob across retries. A lost upload
response can be recovered by comparing the existing bytes on an explicit retry,
without overwriting the object. Failed/abandoned uploads and old/shared photos
are conservatively retained, with pending cleanup reported to the user. This
avoids deleting an object that a committed or concurrent record may reference;
it does not promise zero orphaned files. Any later cleanup needs an authorized
inventory/backup, confirmed abandonment and stable reference checks while record
writes are paused. No automatic Storage garbage collector is introduced.

## Evidence and remaining checks

Native PostgreSQL 17.5: **13/13**, zero failures/skips, exercising prepare rollback,
legacy compatibility, activation locking/invalidation, nullable values, isolation,
atomic rollback, concurrent CAS/retries, bigint text revisions, reset, recovery
and safe resumption. A separate **1/1** permission rehearsal applies preparation,
activation and recovery as a non-superuser with the observed operator privileges.
Local PostgREST 16.5 plus PostgreSQL: **26/26**, zero failures/skips, including dropped
responses, reset races, foreign-child forgery and RLS-visible photo metadata.

Those native suites use synthetic identities, Auth/Storage SQL contract shims
and locally signed JWTs; their results alone do not certify GoTrue or Storage.
The original commit `38b88eb` passed 518/518 in Linux; the PR checks record the
complete suite for the final gate commit, including the new SQL regressions.

The separate official local Supabase stack gate passed **18/18** journeys with
zero omitted checks. It used real Auth signup/login/token renewal, two users and
independent same-user sessions, real PostgREST and Storage HTTP, and private photo
bytes with SHA-256 and strict cross-user denial checks. It applied V9.1 plus
`001_prepare.sql` as the official non-superuser `postgres`, exercised the old
writer, and mounted the actual React store and `db.ts` against real services in
both prepared and atomic modes. JSDOM and toast capture adapt presentation only;
Auth and persistence are not mocked. It also verified activation, nested reads,
edits/deletes, rollback, exact receipt replay after deliberately discarding an HTTP
response body, concurrent saves/reset, and `003` followed by `004`. Discarding a
body is a controlled lost-response scenario, not a certified physical TCP outage.

See `validation/transactional-records-v9-2-real-stack.json` for exact official
versions/digests, candidate hashes, results and cleanup. The first local attempt
stopped on an assertion whose exact cause was not captured; its cause remains
unconfirmed and that run is not counted as passed. The fresh successful rehearsal
waits a bounded time for authenticated OpenAPI readiness after schema changes;
it never reruns DDL automatically or accepts a network failure as an access denial.

Reproduce only in a new, unlinked disposable local stack, never a hosted target.
`scripts/transactional-records/real-stack-gate.mjs` enforces the dedicated project
name and loopback API, uses only anon-key clients plus real Auth sessions for all
user probes, and captures local CLI keys in memory without printing them. It
requires `CALORI_LOCAL_STACK_DIR`, and optionally `CALORI_SUPABASE_CLI`,
`CALORI_DOCKER_BIN` and `DOCKER_HOST`. The candidate SQL is applied locally through
`psql`; the test cannot be reused against Production. Its safe manifest includes
the exact initialization/start/cleanup commands and local-only settings.

The operator catalog evidence and official local service rehearsal close the
technical compatibility gate. They do not claim that V9.2 is deployed or that
modifying DDL has been tested on hosted Production. Code review/merge approval,
current recoverable backups, the low-activity window, independently authorized
SQL/frontend deployment and immediate real Production checks remain mandatory.
