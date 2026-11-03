-- REVIEW / MANUAL RUN ONLY after authorization on the verified project.
-- Catalog metadata, not application rows, Auth users, or object names.
begin read only;
select current_database(),current_user,version();
select n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','ai_private','integrity_private') and c.relkind in ('r','p','v')
order by 1,2;
select schemaname,tablename,indexname,indexdef from pg_catalog.pg_indexes where schemaname='public' order by 2,3;
select nspname,nspacl from pg_catalog.pg_namespace where nspname in ('public','ai_private','integrity_private','storage');
select pg_get_userbyid(defaclrole),defaclnamespace::regnamespace,defaclobjtype,defaclacl from pg_catalog.pg_default_acl;
select n.nspname,c.relname,c.relacl from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where c.relkind='S' and n.nspname in ('public','integrity_private');
select table_schema,table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public'
and table_name in ('profiles','daily_logs','meals','workouts','coach_goals') order by 2,ordinal_position;
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_catalog.pg_policies where schemaname in ('public','storage') order by 1,2,3;
select table_schema,table_name,grantee,privilege_type from information_schema.table_privileges
where table_schema in ('public','storage','ai_private','integrity_private') order by 1,2,3,4;
select table_schema,table_name,column_name,grantee,privilege_type from information_schema.column_privileges
where table_schema='public' order by 2,3,4,5;
select n.nspname,c.relname,co.conname,pg_get_constraintdef(co.oid),co.convalidated
from pg_catalog.pg_constraint co join pg_catalog.pg_class c on c.oid=co.conrelid
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' order by 2,3;
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),p.prosecdef,
  pg_get_userbyid(p.proowner) as owner,p.proacl,p.proconfig
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','ai_private','integrity_private') order by 1,2;
select n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid)
from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and n.nspname='public' order by 2,3;
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id in ('avatars','meal-photos');
rollback;
