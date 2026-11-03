-- Read-only assertions; also executed inside the upgrade, so a failed assertion rolls it back.
do $$
declare tbl regclass; role_name text; privilege text; col record;
begin
 foreach tbl in array array['public.profiles'::regclass,'public.daily_logs'::regclass,'public.meals'::regclass,'public.workouts'::regclass] loop
  foreach role_name in array array['anon','authenticated'] loop
   foreach privilege in array array['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
    if has_table_privilege(role_name,tbl,privilege) then raise exception 'Excess effective privilege (including inheritance): % % %',role_name,tbl,privilege; end if;
    if privilege='REFERENCES' then
     if has_any_column_privilege(role_name,tbl,'REFERENCES') then raise exception 'Excess effective column REFERENCES: % %',role_name,tbl; end if;
    end if;
   end loop;
  end loop;
  foreach privilege in array array['SELECT','INSERT','UPDATE','DELETE'] loop
   if has_table_privilege('anon',tbl,privilege) or
    (privilege in ('SELECT','INSERT','UPDATE') and has_any_column_privilege('anon',tbl,privilege)) then
    raise exception 'Unexpected effective anon access: % %',tbl,privilege;
   end if;
  end loop;
  for col in select attname from pg_attribute where attrelid=tbl and attnum>0 and not attisdropped and
   attname=any(array['id','user_id','profile_id','daily_log_id','date','created_at','updated_at'])
   and not (tbl='public.profiles'::regclass and attname in('id','user_id')) loop
   if has_column_privilege('authenticated',tbl,col.attname,'UPDATE') then raise exception 'Identity/date remains mutable: % %',tbl,col.attname; end if;
  end loop;
  if not has_table_privilege('authenticated',tbl,'SELECT') then raise exception 'Own-row confirmation requires SELECT: %',tbl; end if;
 end loop;
 if has_table_privilege('authenticated','public.profiles','DELETE') then raise exception 'Profile DELETE is not required by the client'; end if;
end;
$$;
