-- Invoice logos in Supabase Storage: a private bucket, one folder per practitioner
-- (named with their Clerk user ID), and row-level security so each practitioner
-- can only read and write files in their own folder.
--
-- storage.buckets and storage.objects are created by the Storage service on its
-- first start; infra/setup.sh starts Storage before applying migrations.

-- PNG, JPEG or SVG up to 1 MB: the same rule the apps check (@kineo/shared logo.ts).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', false, 1048576, array['image/png', 'image/jpeg', 'image/svg+xml'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy logos_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = public.requesting_owner_id());

create policy logos_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = public.requesting_owner_id());

create policy logos_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = public.requesting_owner_id())
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = public.requesting_owner_id());

create policy logos_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = public.requesting_owner_id());
