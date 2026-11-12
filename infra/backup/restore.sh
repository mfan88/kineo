#!/usr/bin/env bash
# Restores a Kineō backup into the running stack, replacing its data:
#   infra/backup/restore.sh <backup folder> <age private key file>
#
# Typical use: a new server (or a wiped one) where infra/setup.sh has created a
# fresh stack. The current data in public, kineo_meta and Storage is replaced.
# PowerSync is restarted afterwards so it re-reads everything.
#
# The private key is only read, never copied. Decrypted data is streamed straight
# into the database and Storage volume, never written to disk unencrypted.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INFRA="$ROOT/infra"
ENV_FILE="${KINEO_ENV_FILE:-$INFRA/kineo.env}"
PROJECT="${KINEO_COMPOSE_PROJECT:-kineo}"

fail() {
  printf 'Restore failed: %s\n' "$*" >&2
  exit 1
}
say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
compose() { docker compose --env-file "$ENV_FILE" -f "$INFRA/docker-compose.yml" -p "$PROJECT" "$@"; }

[[ $# -eq 2 ]] || fail "Usage: $0 <backup folder> <age private key file>"
backup="${1%/}"
identity="$2"
for part in database.dump.age storage.dump.age files.tar.age; do
  [[ -f "$backup/$part" ]] || fail "$backup/$part is missing."
done
[[ -r "$identity" ]] || fail "Can't read the key file $identity."
command -v age >/dev/null 2>&1 || fail "age isn't installed (sudo apt install age)."
[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE doesn't exist. Run infra/setup.sh first."

decrypt() { age --decrypt --identity "$identity" "$backup/$1"; }
# Check the key works before changing anything.
decrypt database.dump.age 2>/dev/null | head -c 5 | grep -q PGDMP || fail "That key can't decrypt this backup."

db="$(compose ps -q db)"
[[ -n "$db" ]] || fail "The database container isn't running. Run infra/setup.sh first."

# Read every part all the way through before changing anything.
say "Checking the backup"
for part in database.dump.age storage.dump.age; do
  decrypt "$part" | docker exec -i "$db" pg_restore --list >/dev/null 2>&1 ||
    fail "$part is damaged or unreadable. Nothing was changed."
done
decrypt files.tar.age | tar -tf - >/dev/null 2>&1 || fail "files.tar.age is damaged or unreadable. Nothing was changed."

# If a part still fails while streaming, end the transaction with an error so the
# database rolls back instead of committing a partial restore.
abort_sql() { printf "do \$\$ begin raise exception 'Kineō restore: %s could not be read'; end \$\$;\n" "$1"; }
psql_admin() { docker exec -i "$db" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

if [[ -t 0 ]]; then
  read -r -p "This replaces all Kineō data on this server with $backup. Type 'restore' to continue: " answer
  [[ "$answer" == restore ]] || fail "Cancelled."
fi

say "Stopping the API, Storage and PowerSync"
compose stop rest storage powersync
# If anything below fails, start them again: the database step is one transaction,
# so a failed restore leaves the previous data in place.
trap 'echo "Restore failed; the previous data is unchanged. Starting services again." >&2; compose up -d >/dev/null 2>&1' ERR

say "Restoring the database and Storage records (one transaction: all or nothing)"
publication="$(find "$ROOT/supabase/migrations" -name '*_powersync_publication.sql' | head -1)"
[[ -n "$publication" ]] || fail "The powersync publication migration is missing from supabase/migrations."
{
  # Restore as a temporary superuser role. A brand-new role has no default
  # privileges, so restored tables get exactly the grants in the backup (Supabase's
  # defaults would otherwise re-grant every table to anon). Everything is handed to
  # postgres at the end; DROP ROLE fails, and rolls everything back, if anything
  # would be left behind.
  cat <<'SQL'
create role kineo_restore superuser nologin;
set role kineo_restore;
SQL
  # Clear Kineō's objects. public itself belongs to the image and stays.
  cat <<'SQL'
drop schema if exists kineo_meta cascade;
drop publication if exists powersync;
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop table if exists public.%I cascade', r.tablename);
  end loop;
  for r in select p.oid::regprocedure as fn from pg_proc p
           where p.pronamespace = 'public'::regnamespace loop
    execute format('drop function if exists %s cascade', r.fn);
  end loop;
end $$;
SQL
  # The dumped schemas as SQL, with their original owners. public already exists.
  { decrypt database.dump.age | docker exec -i "$db" pg_restore -f - |
    grep -vE '^(CREATE SCHEMA public;|ALTER SCHEMA public OWNER TO .*;|COMMENT ON SCHEMA public IS .*;)$'; } ||
    abort_sql database.dump.age
  # Database-level objects outside the dumped schemas, from the migrations.
  cat "$publication"
  # Storage's bucket and file records, without firing its triggers.
  echo "truncate storage.objects, storage.buckets cascade;"
  echo "set session_replication_role = replica;"
  decrypt storage.dump.age | docker exec -i "$db" pg_restore --data-only -f - || abort_sql storage.dump.age
  echo "set session_replication_role = origin;"
  cat <<'SQL'
alter publication powersync owner to postgres;
reset role;
drop role kineo_restore;
SQL
} | psql_admin --single-transaction

say "Restoring uploaded files"
docker run --rm -i -v "${PROJECT}_storage-data:/data" alpine:3.20 \
  sh -c 'find /data -mindepth 1 -delete && tar -C /data -xf -' < <(decrypt files.tar.age)

trap - ERR
say "Starting the API, Storage and PowerSync"
compose up -d --wait
compose restart powersync >/dev/null
say "Restore complete. Check with: infra/status.sh"
