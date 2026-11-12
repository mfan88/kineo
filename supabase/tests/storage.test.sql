-- Logo storage tests: each practitioner can only reach files in their own folder
-- of the private `logos` bucket.
--
-- pgTAP, run by `pnpm test:db` (a throwaway Supabase Postgres plus the Storage
-- service, which creates the storage tables). One transaction, rolled back.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(15);

insert into storage.objects (bucket_id, name) values
  ('logos', 'user_test_a/logo-a.png'),
  ('logos', 'user_test_b/logo-b.png');

-- Runs `sql` as `authenticated` with the given Clerk user ID; returns the row count,
-- or the SQLSTATE if it failed. Same as the helper in rls.test.sql.
create function pg_temp.run_as(sub text, sql text)
returns text
language plpgsql
as $$
declare
  affected bigint;
  outcome text;
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    case when sub is null then '{"role":"authenticated"}'
         else json_build_object('sub', sub, 'role', 'authenticated')::text end,
    true
  );
  begin
    execute sql;
    get diagnostics affected = row_count;
    outcome := affected::text;
  exception when others then
    outcome := sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return outcome;
end;
$$;

select is(
  (select public from storage.buckets where id = 'logos'), false, 'the logos bucket is private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'logos'), 1048576::bigint,
  'logos are limited to 1 MB'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'logos'),
  array['image/png', 'image/jpeg', 'image/svg+xml'],
  'logos must be PNG, JPEG or SVG'
);

select is(
  pg_temp.run_as('user_test_a', $$select 1 from storage.objects where bucket_id = 'logos'$$),
  '1', 'user A sees only their own logo'
);
select is(
  pg_temp.run_as('user_test_a', $$select 1 from storage.objects where name = 'user_test_b/logo-b.png'$$),
  '0', 'user A can''t read user B''s logo'
);
select is(
  pg_temp.run_as(null, $$select 1 from storage.objects where bucket_id = 'logos'$$),
  '0', 'a token without a user ID sees no logos'
);

select is(
  pg_temp.run_as('user_test_a', $$insert into storage.objects (bucket_id, name) values ('logos', 'user_test_a/logo-new.png')$$),
  '1', 'user A can upload into their own folder'
);
select is(
  pg_temp.run_as('user_test_a', $$insert into storage.objects (bucket_id, name) values ('logos', 'user_test_b/sneaky.png')$$),
  '42501', 'user A can''t upload into user B''s folder'
);
select is(
  pg_temp.run_as('user_test_a', $$insert into storage.objects (bucket_id, name) values ('logos', 'sneaky.png')$$),
  '42501', 'uploads outside any folder are refused'
);

select is(
  pg_temp.run_as('user_test_a', $$update storage.objects set metadata = '{}' where name = 'user_test_a/logo-a.png'$$),
  '1', 'user A can replace their own logo'
);
select is(
  pg_temp.run_as('user_test_a', $$update storage.objects set metadata = '{}' where name = 'user_test_b/logo-b.png'$$),
  '0', 'user A can''t change user B''s logo'
);
select is(
  pg_temp.run_as('user_test_a', $$update storage.objects set name = 'user_test_b/moved.png' where name = 'user_test_a/logo-a.png'$$),
  '42501', 'user A can''t move a logo into user B''s folder'
);

-- Storage refuses direct SQL deletes; its API sets storage.allow_delete_query for
-- each delete, so do the same to test the folder rules behind it.
select is(
  pg_temp.run_as('user_test_a', $$delete from storage.objects where name = 'user_test_a/logo-a.png'$$),
  '42501', 'deletes only go through the Storage API'
);
set local storage.allow_delete_query = 'true';

select is(
  pg_temp.run_as('user_test_a', $$delete from storage.objects where name = 'user_test_b/logo-b.png'$$),
  '0', 'user A can''t delete user B''s logo'
);
select is(
  pg_temp.run_as('user_test_a', $$delete from storage.objects where name = 'user_test_a/logo-a.png'$$),
  '1', 'user A can delete their own logo'
);

select * from finish();
rollback;
