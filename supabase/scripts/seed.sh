#!/usr/bin/env bash
# Loads supabase/seed.sql into a database, owned by your Clerk user ID so your dev
# login can see it. Usage: pnpm db:seed
#
# Reads from supabase/.env (git-ignored), or from the environment:
#   SEED_OWNER_ID      your development Clerk user ID (user_...)
#   SEED_DATABASE_URL  Postgres connection string for the target database
# Needs psql.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$ROOT/supabase/.env"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${SEED_OWNER_ID:?Set SEED_OWNER_ID (your dev Clerk user ID) in supabase/.env.}"
: "${SEED_DATABASE_URL:?Set SEED_DATABASE_URL in supabase/.env.}"

# Clerk user IDs are "user_" followed by letters and digits. Checking this also keeps
# the value safe to pass as a Postgres option.
if ! [[ "$SEED_OWNER_ID" =~ ^user_[A-Za-z0-9]+$ ]]; then
  echo "SEED_OWNER_ID doesn't look like a Clerk user ID (user_...)." >&2
  exit 1
fi

PGOPTIONS="-c app.seed_owner_id=$SEED_OWNER_ID" \
  psql "$SEED_DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/seed.sql"

echo "Seed data loaded for $SEED_OWNER_ID."
