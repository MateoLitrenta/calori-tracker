\set ON_ERROR_STOP on
-- Catalog-only operator gate. No rows from application/Auth/Storage tables.
-- Run with the SAME operator and target intended for 001_prepare.sql.
begin read only;
select jsonb_build_object(
 'operator',current_user,
 'session_user',session_user,
 'server_version',current_setting('server_version'),
 'superuser',(select rolsuper from pg_roles where rolname=current_user),
 'create_role',(select rolcreaterole from pg_roles where rolname=current_user),
 'database_create',has_database_privilege(current_user,current_database(),'CREATE'),
 'public_create_grant_option',has_schema_privilege(current_user,'public','CREATE WITH GRANT OPTION'),
 'authenticated_admin',exists(select 1 from pg_auth_members where roleid='authenticated'::regrole and member=current_user::regrole and admin_option),
 'authenticated_usage',pg_has_role(current_user,'authenticated','USAGE'),
 'auth_usage',has_schema_privilege(current_user,'auth','USAGE'),
 'auth_usage_grant_option',has_schema_privilege(current_user,'auth','USAGE WITH GRANT OPTION'),
 'authenticated_auth_usage',has_schema_privilege('authenticated','auth','USAGE'),
 'authenticated_uid_execute',has_function_privilege('authenticated','auth.uid()','EXECUTE'),
 'auth_users_references',has_column_privilege(current_user,'auth.users','id','REFERENCES'),
 'storage_usage_grant_option',has_schema_privilege(current_user,'storage','USAGE WITH GRANT OPTION'),
 'storage_objects_select_grant_option',has_table_privilege(current_user,'storage.objects','SELECT WITH GRANT OPTION'),
 'application_tables',(select jsonb_agg(jsonb_build_object(
   'name',relname,'owner',pg_get_userbyid(relowner),
   'operator_owns',pg_has_role(current_user,relowner,'USAGE'),
   'cud_grant_options',has_table_privilege(current_user,oid,'INSERT WITH GRANT OPTION')
    and has_table_privilege(current_user,oid,'UPDATE WITH GRANT OPTION')
    and has_table_privilege(current_user,oid,'DELETE WITH GRANT OPTION')
  ) order by relname) from pg_class where oid=any(array[
   'public.profiles'::regclass,'public.daily_logs'::regclass,
   'public.meals'::regclass,'public.workouts'::regclass])),
 'candidate_name_unused',to_regnamespace('calori_records_private') is null
  and not exists(select 1 from pg_roles where rolname='calori_record_writer')
) as operator_catalog;
rollback;
