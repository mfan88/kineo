#!/usr/bin/env bash
# Runs the pgTAP tests in supabase/tests against the migrations, in a throwaway
# Supabase Postgres container plus the Storage service (which creates the storage
# tables the logo migration needs). Needs Docker. Usage: pnpm test:db
set -euo pipefail

# Same Postgres image the Supabase CLI uses for this project.
IMAGE="public.ecr.aws/supabase/postgres:17.11.0.004"
# Same Storage version as infra/docker-compose.yml.
STORAGE_IMAGE="supabase/storage-api:v1.89.12"
NAME="kineo-test-db-$$"
STORAGE_NAME="kineo-test-storage-$$"
NETWORK="kineo-test-net-$$"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

cleanup() {
  docker rm -f "$STORAGE_NAME" "$NAME" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql_as() {
  local user="$1"
  shift
  docker exec -i "$NAME" psql -h localhost -d postgres -U "$user" -v ON_ERROR_STOP=1 -q "$@"
}

# Pulls an image, retrying with backoff: registries turn away bursts of pulls from
# shared CI machines ("toomanyrequests: Rate exceeded"). Already pulled: no request.
pull() {
  local image="$1" attempt=1
  if docker image inspect "$image" >/dev/null 2>&1; then
    return 0
  fi
  for wait in 10 30 60 120; do
    if docker pull --quiet "$image" >/dev/null; then
      return 0
    fi
    echo "Couldn't pull $image (attempt $attempt); trying again in ${wait}s..."
    sleep "$wait"
    attempt=$((attempt + 1))
  done
  docker pull --quiet "$image" >/dev/null
}

pull "$IMAGE"
pull "$STORAGE_IMAGE"

docker network create "$NETWORK" >/dev/null

echo "Starting $IMAGE..."
docker run -d --name "$NAME" --network "$NETWORK" --network-alias db \
  -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null

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

# Storage creates its own tables on first start, as on the server. Throwaway keys:
# nothing here is reachable from outside Docker.
psql_as supabase_admin -c "alter user supabase_storage_admin with password 'postgres'"
echo "Starting $STORAGE_IMAGE..."
docker run -d --name "$STORAGE_NAME" --network "$NETWORK" \
  -e DATABASE_URL=postgres://supabase_storage_admin:postgres@db:5432/postgres \
  -e ANON_KEY=test-anon-key -e SERVICE_KEY=test-service-key \
  -e AUTH_JWT_SECRET=test-jwt-secret-at-least-32-characters-long \
  -e POSTGREST_URL=http://db:3000 \
  -e STORAGE_BACKEND=file -e FILE_STORAGE_BACKEND_PATH=/var/lib/storage \
  -e GLOBAL_S3_BUCKET=kineo -e TENANT_ID=kineo -e REGION=local \
  -e FILE_SIZE_LIMIT=10485760 -e ENABLE_IMAGE_TRANSFORMATION=false \
  "$STORAGE_IMAGE" >/dev/null
ready=false
for _ in $(seq 1 90); do
  if psql_as postgres -tAc "select to_regclass('storage.objects') is not null and to_regprocedure('storage.foldername(text)') is not null" 2>/dev/null | grep -q t; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != true ]; then
  echo "Storage didn't create its tables. Its log:"
  docker logs "$STORAGE_NAME" 2>&1 | tail -20
  exit 1
fi

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

# The demo seed must still load with every lock in place, and a second run must
# change nothing.
echo "Loading seed.sql twice"
for run in 1 2; do
  if ! docker exec -i -e PGOPTIONS="-c app.seed_owner_id=user_seed_check" "$NAME" \
    psql -h localhost -d postgres -U postgres -v ON_ERROR_STOP=1 -q <"$ROOT/supabase/seed.sql"; then
    echo "seed.sql failed on run $run."
    status=1
  fi
done
seeded="$(psql_as postgres -tAc "select string_agg(number || ':' || status, ',' order by number) from public.invoices where owner_id = 'user_seed_check'")"
if [ "$seeded" = "1:paid,2:sent,3:draft" ]; then
  echo "ok - seed.sql loads, and a rerun changes nothing"
else
  echo "not ok - seed.sql invoices are \"$seeded\" (want 1:paid,2:sent,3:draft)"
  status=1
fi
fixed="$(psql_as postgres -tAc "select
  (select count(*) from public.profiles where owner_id = 'user_seed_check' and id = public.own_row_id('profiles', owner_id))
  + (select count(*) from public.practice_settings where owner_id = 'user_seed_check' and id = public.own_row_id('practice_settings', owner_id))
  + (select count(*) from public.invoice_styles where owner_id = 'user_seed_check' and id = public.own_row_id('invoice_styles', owner_id))")"
if [ "$fixed" = "3" ]; then
  echo "ok - seed.sql gives profile, settings and style their fixed IDs"
else
  echo "not ok - only $fixed of the seed's profile, settings and style rows have their fixed IDs"
  status=1
fi

if [ "$status" -ne 0 ]; then
  echo "Database tests failed."
else
  echo "All database tests passed."
fi
exit "$status"
