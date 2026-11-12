-- Roles and storage for PowerSync. Runs once, when the database is first created.
-- The `powersync` publication itself is a migration (it needs the tables), see
-- supabase/migrations/*_powersync_publication.sql.
\set replication_password `echo "$POWERSYNC_DB_PASSWORD"`
\set storage_password `echo "$POWERSYNC_STORAGE_PASSWORD"`

-- Reads changes from Kineō's tables. Read-only; BYPASSRLS because replication sees
-- every practitioner's rows, and the sync streams then send each person only their own.
CREATE ROLE powersync_role WITH REPLICATION BYPASSRLS LOGIN PASSWORD :'replication_password';
GRANT USAGE ON SCHEMA public TO powersync_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_role;
-- Tables the migrations create later (they run as postgres).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO powersync_role;

-- PowerSync's own working data, in a separate database on the same server, so it
-- stays out of the main database and its backups. It can always be rebuilt.
CREATE ROLE powersync_storage_user WITH LOGIN PASSWORD :'storage_password';
CREATE DATABASE powersync_storage OWNER powersync_storage_user;
REVOKE ALL ON DATABASE powersync_storage FROM PUBLIC;
