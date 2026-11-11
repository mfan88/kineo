-- Row-level security for every Kineō table, keyed on the Clerk user ID.
--
-- Supabase verifies Clerk session tokens (third-party auth); the Clerk user ID is the
-- token's `sub` claim. A signed-in practitioner can read, add, change and delete only
-- rows whose owner_id is their own Clerk user ID. Anonymous requests get nothing.
--
-- `(select ...)` around the claim lets Postgres work it out once per query instead of
-- once per row.

create function public.requesting_owner_id()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'sub', '');
$$;

comment on function public.requesting_owner_id() is
  'The Clerk user ID (JWT sub claim) of the signed-in practitioner, or null.';

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'practice_settings',
    'invoice_styles',
    'patients',
    'price_items',
    'invoices',
    'visits',
    'invoice_lines'
  ]
  loop
    -- Already enabled when the tables were created; repeated so this file alone
    -- guarantees it. Not FORCEd: admin roles (migrations, seed.sql) still bypass it,
    -- while the API roles (anon, authenticated) are always bound by it.
    execute format('alter table public.%I enable row level security', table_name);

    -- New rows belong to the signed-in practitioner unless the app says otherwise
    -- (and the insert policy rejects any other owner).
    execute format(
      'alter table public.%I alter column owner_id set default public.requesting_owner_id()',
      table_name
    );

    execute format('revoke all on public.%I from anon', table_name);

    execute format(
      'create policy %I on public.%I for select to authenticated
         using (owner_id = (select public.requesting_owner_id()))',
      table_name || '_select_own', table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (owner_id = (select public.requesting_owner_id()))',
      table_name || '_insert_own', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (owner_id = (select public.requesting_owner_id()))
         with check (owner_id = (select public.requesting_owner_id()))',
      table_name || '_update_own', table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (owner_id = (select public.requesting_owner_id()))',
      table_name || '_delete_own', table_name
    );
  end loop;
end;
$$;
