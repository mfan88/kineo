#!/usr/bin/env bash
# Encrypted backup of the Kineō server. Run by kineo-backup.timer every night, or by hand:
#   infra/backup/backup.sh
#
# Writes $BACKUP_DIR/kineo-<UTC timestamp>/ with three age-encrypted parts:
#   database.dump.age  public and kineo_meta schemas (tables, data, policies, grants)
#   storage.dump.age   Storage's bucket and file records
#   files.tar.age      the uploaded files themselves (logos, PDFs)
# Everything is streamed straight into age, so no unencrypted copy touches the disk.
# Only the public key (BACKUP_AGE_RECIPIENT) is on the server; the private key that
# can read backups stays with you. Keeps the newest BACKUP_KEEP backups.
#
# Not included (rebuildable or kept elsewhere): PowerSync's own working database,
# and infra/kineo.env, which you keep safe yourself.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INFRA="$ROOT/infra"
ENV_FILE="${KINEO_ENV_FILE:-$INFRA/kineo.env}"
PROJECT="${KINEO_COMPOSE_PROJECT:-kineo}"

fail() {
  printf 'Backup failed: %s\n' "$*" >&2
  exit 1
}
setting() { grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2- || true; }
compose() { docker compose --env-file "$ENV_FILE" -f "$INFRA/docker-compose.yml" -p "$PROJECT" "$@"; }

[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE doesn't exist."
command -v age >/dev/null 2>&1 || fail "age isn't installed (sudo apt install age)."

recipient="$(setting BACKUP_AGE_RECIPIENT)"
backup_dir="$(setting BACKUP_DIR)"
keep="$(setting BACKUP_KEEP)"
keep="${keep:-14}"
[[ "$recipient" == age1* ]] || fail "Set BACKUP_AGE_RECIPIENT (an age public key, age1…) in kineo.env."
[[ -n "$backup_dir" ]] || fail "Set BACKUP_DIR in kineo.env."
[[ "$keep" =~ ^[1-9][0-9]*$ ]] || fail "BACKUP_KEEP must be a whole number of at least 1."
mkdir -p "$backup_dir"
[[ -w "$backup_dir" ]] || fail "Can't write to $backup_dir."

db="$(compose ps -q db)"
[[ -n "$db" ]] || fail "The database container isn't running."
storage_volume="${PROJECT}_storage-data"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
final="$backup_dir/kineo-$stamp"
work="$backup_dir/.kineo-$stamp.partial"
umask 077
mkdir "$work"
trap 'rm -rf "$work"' EXIT

encrypt() { age --encrypt --recipient "$recipient" --output "$work/$1"; }

# Superuser for the dump, so every object and grant is readable.
docker exec "$db" pg_dump -U supabase_admin -d postgres --format=custom \
  --schema=public --schema=kineo_meta | encrypt database.dump.age
docker exec "$db" pg_dump -U supabase_admin -d postgres --format=custom --data-only \
  --table=storage.buckets --table=storage.objects | encrypt storage.dump.age
docker run --rm -v "$storage_volume:/data:ro" alpine:3.20 tar -C /data -cf - . | encrypt files.tar.age

# A part that's only an age header means the dump produced nothing.
for part in database.dump.age storage.dump.age files.tar.age; do
  [[ $(stat -c %s "$work/$part" 2>/dev/null || stat -f %z "$work/$part") -gt 300 ]] ||
    fail "$part came out empty."
done

mv "$work" "$final"
trap - EXIT
echo "Backup written: $final"

# Keep the newest $keep backups.
mapfile -t old < <(find "$backup_dir" -maxdepth 1 -type d -name 'kineo-*' | sort -r | tail -n +"$((keep + 1))")
for dir in "${old[@]}"; do
  rm -rf "$dir"
  echo "Removed old backup: $dir"
done
