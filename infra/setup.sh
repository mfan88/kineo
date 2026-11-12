#!/usr/bin/env bash
# Kineō server setup. Safe to run again at any time.
#
#   infra/setup.sh            first-time setup, or bring everything up to date
#   infra/setup.sh --seed     also load made-up demo data for SEED_OWNER_ID
#
# What it does:
#   1. Checks Docker, Docker Compose, curl, openssl and python3, and that the
#      Kineō ports on 127.0.0.1 are free (or already Kineō's).
#   2. Creates infra/kineo.env from infra/kineo.env.example (chmod 600), asks for
#      the values only you know, and generates every secret. Existing values are
#      never changed, except JWT_JWKS, which is rebuilt from Clerk's current keys.
#   3. Starts the database and Storage (which creates the storage tables some
#      migrations use), applies any supabase/migrations not yet applied
#      (recorded in kineo_meta.applied_migrations), then starts the rest.
#
# It never prints a secret. Settings for testing: KINEO_ENV_FILE (env file path),
# KINEO_COMPOSE_PROJECT (default kineo), KINEO_JWKS_URL (instead of Clerk's).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA="$ROOT/infra"
ENV_FILE="${KINEO_ENV_FILE:-$INFRA/kineo.env}"
EXAMPLE="$INFRA/kineo.env.example"
PROJECT="${KINEO_COMPOSE_PROJECT:-kineo}"
SEED=false

for arg in "$@"; do
  case "$arg" in
    --seed) SEED=true ;;
    -h | --help)
      sed -n '2,19p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$INFRA/docker-compose.yml" -p "$PROJECT" "$@"
}

# ─── 1. Checks ─────────────────────────────────────────────────────────────

say "Checking tools"
for tool in docker curl openssl python3; do
  command -v "$tool" >/dev/null 2>&1 || fail "$tool isn't installed."
done
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 isn't available (docker compose)."
docker info >/dev/null 2>&1 || fail "Can't reach Docker. Is it running, and are you in the docker group (or using sudo)?"

# ─── 2. Settings file ──────────────────────────────────────────────────────

if [[ ! -f "$ENV_FILE" ]]; then
  say "Creating $(basename "$ENV_FILE") from the template"
  (umask 077 && cp "$EXAMPLE" "$ENV_FILE")
fi
chmod 600 "$ENV_FILE"

# Reads a value from the settings file ("" if unset). Never echoed to the terminal.
get_env() {
  python3 - "$ENV_FILE" "$1" <<'PY'
import sys
path, key = sys.argv[1], sys.argv[2]
for line in open(path, encoding="utf-8"):
    if line.startswith(key + "="):
        print(line[len(key) + 1:].rstrip("\n"), end="")
        break
PY
}

# Sets KEY=value in the settings file, replacing the line or adding it.
# The value is passed on stdin so it never appears in the process list.
set_env() {
  printf '%s' "$2" | python3 -c '
import sys
path, key = sys.argv[1], sys.argv[2]
value = sys.stdin.read()
lines = open(path, encoding="utf-8").read().splitlines()
for i, line in enumerate(lines):
    if line.startswith(key + "="):
        lines[i] = f"{key}={value}"
        break
else:
    lines.append(f"{key}={value}")
open(path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
' "$ENV_FILE" "$1"
}

# Asks for a value you set, unless it's already there. $3 is a suggested default.
ask() {
  local key="$1" prompt="$2" default="${3:-}" value
  value="$(get_env "$key")"
  if [[ -n "$value" ]]; then return; fi
  if [[ ! -t 0 ]]; then
    [[ -n "$default" ]] || fail "$key is empty in $(basename "$ENV_FILE"). Set it and run again."
    value="$default"
  else
    read -r -p "$prompt${default:+ [$default]}: " value
    value="${value:-$default}"
  fi
  [[ -n "$value" ]] || fail "$key is required."
  set_env "$key" "$value"
}

say "Checking your settings"
ask API_PUBLIC_URL "Public URL of the API" "https://api.getkineo.work"
ask SYNC_PUBLIC_URL "Public URL of PowerSync" "https://sync.getkineo.work"
ask CLERK_DOMAIN "Clerk Frontend API domain, without https://"
ask POWERSYNC_JWT_AUDIENCE "Audience (aud) for PowerSync tokens" "getkineo-sync"
ask KINEO_DATA_DIR "Folder for all Kineō data (database and uploads)" "/mnt/nvme/kineo"

clerk_domain="$(get_env CLERK_DOMAIN)"
clerk_domain="${clerk_domain#https://}"
clerk_domain="${clerk_domain%%/*}"
set_env CLERK_DOMAIN "$clerk_domain"

# ─── Data folder ───────────────────────────────────────────────────────────

data_dir="$(get_env KINEO_DATA_DIR)"
data_dir="${data_dir%/}"
[[ "$data_dir" == /* ]] || fail "KINEO_DATA_DIR must be an absolute path (e.g. /mnt/nvme/kineo)."
set_env KINEO_DATA_DIR "$data_dir"

# Refuse to put the data on the system disk: that almost always means the SSD isn't
# mounted, and the database would quietly start empty on the wrong disk. Set
# KINEO_ALLOW_SYSTEM_DISK=1 only if you really want it on the system disk.
if command -v findmnt >/dev/null 2>&1 && [[ "${KINEO_ALLOW_SYSTEM_DISK:-}" != 1 ]]; then
  existing="$data_dir"
  while [[ ! -e "$existing" ]]; do existing="$(dirname "$existing")"; done
  mount_point="$(findmnt -no TARGET -T "$existing")"
  [[ "$mount_point" != / ]] ||
    fail "$data_dir would be on the system disk, not a separate drive. Is the SSD mounted? (Check with: findmnt -T $(dirname "$data_dir"))"
fi

for sub in db db-config storage; do
  mkdir -p "$data_dir/$sub"
done
chmod 700 "$data_dir"

# Random letters and digits (safe inside URLs and SQL).
random_alnum() { openssl rand -hex "$1"; }

# Generates a secret only if it isn't set yet.
generate() {
  local key="$1" value="$2"
  if [[ -z "$(get_env "$key")" ]]; then
    set_env "$key" "$value"
    say "Generated $key"
  fi
}

# A new database password only works for a new database: the old one keeps the
# password it was created with. Stop rather than start a stack that can't log in.
if [[ -z "$(get_env POSTGRES_PASSWORD)" ]] && docker volume inspect "${PROJECT}_db-data" >/dev/null 2>&1; then
  fail "A Kineō database already exists (volume ${PROJECT}_db-data) but $(basename "$ENV_FILE") has no POSTGRES_PASSWORD.
Restore the settings file from your backup instead of creating a new one.
(Only if you want to wipe all data: docker volume rm ${PROJECT}_db-data, then run setup again.)"
fi
generate POSTGRES_PASSWORD "$(random_alnum 24)"
generate JWT_SECRET "$(random_alnum 32)"
generate POWERSYNC_DB_PASSWORD "$(random_alnum 24)"
generate POWERSYNC_STORAGE_PASSWORD "$(random_alnum 24)"
generate PG_META_CRYPTO_KEY "$(random_alnum 24)"
[[ -n "$(get_env JWT_EXPIRY)" ]] || set_env JWT_EXPIRY 3600
for port_key in KINEO_REST_PORT:55321 KINEO_STORAGE_PORT:55322 KINEO_STUDIO_PORT:55323 \
  KINEO_DB_PORT:55324 KINEO_SYNC_PORT:55325; do
  [[ -n "$(get_env "${port_key%%:*}")" ]] || set_env "${port_key%%:*}" "${port_key##*:}"
done

# Long-lived HS256 keys for the anon and service_role roles, signed with JWT_SECRET.
sign_role_key() {
  KINEO_JWT_SECRET="$(get_env JWT_SECRET)" python3 - "$1" <<'PY'
import base64, hashlib, hmac, json, os, sys, time
def b64(data): return base64.urlsafe_b64encode(data).rstrip(b"=").decode()
now = int(time.time())
header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
payload = b64(json.dumps({"role": sys.argv[1], "iss": "kineo", "iat": now,
                          "exp": now + 10 * 365 * 24 * 3600}, separators=(",", ":")).encode())
signature = hmac.new(os.environ["KINEO_JWT_SECRET"].encode(), f"{header}.{payload}".encode(),
                     hashlib.sha256).digest()
print(f"{header}.{payload}.{b64(signature)}", end="")
PY
}
generate ANON_KEY "$(sign_role_key anon)"
generate SERVICE_ROLE_KEY "$(sign_role_key service_role)"

# JWT_JWKS: Clerk's public keys plus the stack's own HS256 key, rebuilt every run so
# Clerk key rotations are picked up.
jwks_url="${KINEO_JWKS_URL:-https://$clerk_domain/.well-known/jwks.json}"
say "Fetching Clerk's public keys"
clerk_jwks="$(curl -fsS --max-time 15 "$jwks_url")" ||
  fail "Couldn't fetch $jwks_url. Check CLERK_DOMAIN and the server's internet access."
jwks="$(printf '%s' "$clerk_jwks" | KINEO_JWT_SECRET="$(get_env JWT_SECRET)" python3 -c '
import base64, json, os, sys
keys = json.load(sys.stdin).get("keys", [])
if not any(k.get("kty") in ("RSA", "EC", "OKP") for k in keys):
    sys.exit("No public signing keys found at the JWKS URL.")
secret = os.environ["KINEO_JWT_SECRET"].encode()
keys.append({"kty": "oct", "k": base64.urlsafe_b64encode(secret).rstrip(b"=").decode(), "alg": "HS256"})
print(json.dumps({"keys": keys}, separators=(",", ":")), end="")
')" || fail "Clerk's key set at $jwks_url wasn't usable."
set_env JWT_JWKS "$jwks"

# ─── Port check ────────────────────────────────────────────────────────────

port_in_use() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltnH "sport = :$1" | grep -q .
  else
    lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  fi
}

running_kineo_ports="$(compose ps --format '{{.Ports}}' 2>/dev/null || true)"
for key in KINEO_REST_PORT KINEO_STORAGE_PORT KINEO_STUDIO_PORT KINEO_DB_PORT KINEO_SYNC_PORT; do
  port="$(get_env "$key")"
  if port_in_use "$port" && ! grep -q "127.0.0.1:$port->" <<<"$running_kineo_ports"; then
    fail "Port $port ($key) is already used by something else. Pick a free one in $(basename "$ENV_FILE")."
  fi
done

compose config --quiet || fail "docker-compose.yml didn't accept the settings."

# ─── 3. Database and migrations ────────────────────────────────────────────

# Storage creates its own tables (storage.objects, storage.buckets) on first start,
# and migrations add Kineō's bucket and rules to them, so start it first. (It brings
# up PostgREST too, which it depends on; neither needs Kineō's tables to start.)
say "Starting the database and Storage"
compose up -d --wait db storage

db_container="$(compose ps -q db)"
psql_db() { docker exec -i "$db_container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

psql_db <<'SQL'
create schema if not exists kineo_meta;
create table if not exists kineo_meta.applied_migrations (
  filename text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
);
revoke all on schema kineo_meta from public;
SQL

applied=0
for file in "$ROOT"/supabase/migrations/*.sql; do
  name="$(basename "$file")"
  sum="$(openssl dgst -sha256 -r "$file" | cut -d' ' -f1)"
  recorded="$(psql_db -tA -c "select checksum from kineo_meta.applied_migrations where filename = '$name'")"
  if [[ -n "$recorded" ]]; then
    [[ "$recorded" == "$sum" ]] ||
      fail "$name changed after it was applied. Add a new migration instead of editing an old one."
    continue
  fi
  say "Applying $name"
  {
    echo "begin;"
    cat "$file"
    echo
    echo "insert into kineo_meta.applied_migrations (filename, checksum) values ('$name', '$sum');"
    echo "commit;"
  } | psql_db
  applied=$((applied + 1))
done
# PostgREST caches the database's layout; have it reload to see new tables.
psql_db -c "notify pgrst, 'reload schema'"
say "Migrations up to date ($applied applied this run)"

if [[ "$SEED" == true ]]; then
  owner="${SEED_OWNER_ID:-$(get_env SEED_OWNER_ID)}"
  [[ "$owner" =~ ^user_[A-Za-z0-9]+$ ]] ||
    fail "Set SEED_OWNER_ID to your Clerk user ID (user_…) to load demo data."
  say "Loading made-up demo data for $owner"
  docker exec -i -e PGOPTIONS="-c app.seed_owner_id=$owner" "$db_container" \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q <"$ROOT/supabase/seed.sql"
fi

# ─── Everything else ───────────────────────────────────────────────────────

say "Starting PostgREST, Storage, PowerSync and Studio"
# Recreate services whose settings changed (e.g. a rebuilt JWT_JWKS).
compose up -d --wait

# Keep it running across reboots.
if [[ -d /run/systemd/system && "$ENV_FILE" == "$INFRA/kineo.env" && "$PROJECT" == kineo ]]; then
  if [[ $EUID -eq 0 ]]; then
    "$INFRA/systemd/install.sh"
  elif ! systemctl is-enabled --quiet kineo.service 2>/dev/null; then
    say "To start Kineō on boot, run: sudo $INFRA/systemd/install.sh"
  fi
fi

say "Done. Kineō is running."
compose ps --format 'table {{.Service}}\t{{.Status}}'
cat <<EOF

Next:
  - Link the Caddy drop-in if you haven't:
      sudo ln -sf "$INFRA/caddy/kineo.caddy" /etc/caddy/sites.d/kineo.caddy
      sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
  - Studio (admin) is on 127.0.0.1:$(get_env KINEO_STUDIO_PORT); reach it with
      ssh -L $(get_env KINEO_STUDIO_PORT):127.0.0.1:$(get_env KINEO_STUDIO_PORT) <server>
EOF
