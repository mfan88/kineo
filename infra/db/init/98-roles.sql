-- Sets the passwords of the service roles the stack logs in as. Runs once, when the
-- database is first created. Adapted from Supabase's self-hosting setup (Apache-2.0).
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
