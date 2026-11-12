#!/usr/bin/env bash
# Runs the pgTAP tests in supabase/tests against the migrations, in a throwaway
# Supabase Postgres container. Needs Docker. Usage: pnpm test:db
set -euo pipefail

# Same Postgres image the Supabase CLI uses for this project.
IMAGE="public.ecr.aws/supabase/postgres:17.11.0.004"
NAME="kineo-test-db-$$"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

psql_as() {
  local user="$1"
  shift
  docker exec -i "$NAME" psql -h localhost -d postgres -U "$user" -v ON_ERROR_STOP=1 -q "$@"
}

echo "Starting $IMAGE..."
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null

# The image runs its own setup after first becoming ready, so wait for the API roles.
for _ in $(seq 1 60); do
  if docker exec "$NAME" psql -h localhost -U supabase_admin -d postgres -tAc \
    "select 1 from pg_roles where rolname = 'authenticated'" 2>/dev/null | grep -q 1; then
    break
  fi
  sleep 1
done
sleep 2

# On a full Supabase stack the auth service creates auth.jwt(); Kineō's server (and
# this bare image) don't run it, so use the same definition the server installs.
psql_as supabase_admin <"$ROOT/infra/db/init/99-auth-jwt.sql"

for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "Applying $(basename "$migration")"
  psql_as postgres <"$migration"
done

status=0
for test in "$ROOT"/supabase/tests/*.sql; do
  echo "Running $(basename "$test")"
  output="$(psql_as postgres -tA <"$test" 2>&1)" || status=1
  echo "$output"
  if grep -qE '^not ok|^# Looks like' <<<"$output"; then
    status=1
  fi
done

if [ "$status" -ne 0 ]; then
  echo "Database tests failed."
else
  echo "All database tests passed."
fi
exit "$status"
