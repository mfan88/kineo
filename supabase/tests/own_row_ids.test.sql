-- Fixed own-row IDs: Postgres computes the same IDs as @kineo/data's ownRowId, and
-- rows made before the migration were moved to them. pgTAP, run by `pnpm test:db`.
-- One transaction, rolled back.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

-- The same values packages/data/tests compute with ownRowId for user_seed_check.
select is(public.own_row_id('profiles', 'user_seed_check'),
  '3debc052-dd15-5085-89e1-349fbeebebab'::uuid, 'profile ID matches the apps');
select is(public.own_row_id('practice_settings', 'user_seed_check'),
  '3998afd7-56e5-56dc-a5b9-0febbf678123'::uuid, 'settings ID matches the apps');
select is(public.own_row_id('invoice_styles', 'user_seed_check'),
  '96c7a667-19c9-596e-b5dd-756bf996a790'::uuid, 'style ID matches the apps');

select is(
  has_function_privilege('authenticated', 'public.own_row_id(text, text)', 'execute'), false,
  'the apps can''t call it (they compute the IDs themselves)'
);

-- A row made with a random ID before the migration, moved by the same update.
insert into public.profiles (id, owner_id) values ('00000000-0000-4000-8000-0000000000c1', 'user_test_c');
update public.profiles set id = public.own_row_id('profiles', owner_id)
 where id <> public.own_row_id('profiles', owner_id);
select is(
  (select id from public.profiles where owner_id = 'user_test_c'),
  public.own_row_id('profiles', 'user_test_c'),
  'an older row is moved to its fixed ID'
);
select is(
  (select count(*)::int from public.profiles where id = '00000000-0000-4000-8000-0000000000c1'), 0,
  'and its old ID is gone'
);

select * from finish();
rollback;
