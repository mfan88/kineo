-- One profile, practice settings and invoice style row per practitioner, with a
-- fixed ID worked out from their Clerk user ID. A first save on any device then
-- writes the same row, and the server merges them instead of refusing a second one.
--
-- The ID is a version 5 UUID of "<table>:<user ID>" in Kineō's namespace, exactly
-- as @kineo/data's ownRowId computes it (packages/data/src/ownRowId.ts); never
-- change the namespace.

create function public.own_row_id(table_name text, owner text)
returns uuid
language sql
immutable
strict
set search_path = ''
as $$
  select extensions.uuid_generate_v5(
    '6f0b8c1e-3d2a-4c5b-9e8f-7a1d2c3b4e5f'::uuid,
    table_name || ':' || owner
  );
$$;

-- Used by migrations and the seed only; the apps compute the same IDs themselves.
revoke all on function public.own_row_id(text, text) from public, anon, authenticated;

-- Rows made before this get their fixed ID now. Sync passes the change on to devices.
update public.profiles
   set id = public.own_row_id('profiles', owner_id)
 where id <> public.own_row_id('profiles', owner_id);
update public.practice_settings
   set id = public.own_row_id('practice_settings', owner_id)
 where id <> public.own_row_id('practice_settings', owner_id);
update public.invoice_styles
   set id = public.own_row_id('invoice_styles', owner_id)
 where id <> public.own_row_id('invoice_styles', owner_id);
