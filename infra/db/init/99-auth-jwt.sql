-- auth.jwt(): the claims of the request's token, which the row-level security
-- policies read (the Clerk user ID is the `sub` claim). On a full Supabase stack the
-- Auth service creates this function; Kineō signs in with Clerk instead and doesn't
-- run Supabase Auth, so it's created here with Supabase's definition.
-- Also used by supabase/scripts/test-db.sh, so tests and the server match.
create or replace function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

grant execute on function auth.jwt() to anon, authenticated, service_role;
