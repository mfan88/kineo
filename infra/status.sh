#!/usr/bin/env bash
# Health check for the Kineō server:
#   infra/status.sh            containers and local endpoints
#   infra/status.sh --public   also checks the public URLs through Caddy
# Exits 0 when everything is healthy, 1 otherwise. Prints no secrets.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA="$ROOT/infra"
ENV_FILE="${KINEO_ENV_FILE:-$INFRA/kineo.env}"
PROJECT="${KINEO_COMPOSE_PROJECT:-kineo}"
PUBLIC=false
[[ "${1:-}" == "--public" ]] && PUBLIC=true

compose() { docker compose --env-file "$ENV_FILE" -f "$INFRA/docker-compose.yml" -p "$PROJECT" "$@"; }
setting() { grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2-; }

problems=0
row() { printf '  %-28s %s\n' "$1" "$2"; }
ok() { row "$1" "ok${2:+ ($2)}"; }
bad() {
  row "$1" "PROBLEM: $2"
  problems=$((problems + 1))
}

# Calls a URL and checks the HTTP status is one of the expected ones.
check_http() {
  local label="$1" url="$2" expected="$3" code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" || true)"
  [[ "$code" == 000 ]] && code=""
  if [[ " $expected " == *" $code "* ]]; then ok "$label" "HTTP $code"; else bad "$label" "HTTP ${code:-no answer} (expected $expected)"; fi
}

[[ -f "$ENV_FILE" ]] || {
  echo "infra/kineo.env doesn't exist. Run infra/setup.sh first." >&2
  exit 1
}

echo "Containers"
for service in db rest storage powersync meta studio; do
  state="$(compose ps --format '{{.State}} {{.Health}}' "$service" 2>/dev/null | head -1)"
  case "$state" in
    "running healthy") ok "$service" ;;
    "") bad "$service" "not running" ;;
    *) bad "$service" "$state" ;;
  esac
done

echo "Local endpoints (127.0.0.1)"
# A table without a token: PostgREST answers 401, which shows it's up and refusing
# anonymous access. (Its root path lists the API to anyone; Caddy never serves it.)
check_http "REST API" "http://127.0.0.1:$(setting KINEO_REST_PORT)/patients" "401"
check_http "Storage" "http://127.0.0.1:$(setting KINEO_STORAGE_PORT)/status" "200"
check_http "PowerSync" "http://127.0.0.1:$(setting KINEO_SYNC_PORT)/probes/liveness" "200"

db="$(compose ps -q db 2>/dev/null)"
if [[ -n "$db" ]] && docker exec "$db" pg_isready -U postgres -h localhost -q; then
  ok "Postgres"
  pending="$(
    docker exec "$db" psql -U postgres -d postgres -tA -c "select filename from kineo_meta.applied_migrations" 2>/dev/null |
      sort | comm -13 - <(find "$ROOT/supabase/migrations" -maxdepth 1 -name '*.sql' -exec basename {} \; | sort) | wc -l | tr -d ' '
  )"
  if [[ "$pending" == 0 ]]; then ok "Migrations" "all applied"; else bad "Migrations" "$pending not applied; run infra/setup.sh"; fi
else
  bad "Postgres" "not accepting connections"
fi

if [[ "$PUBLIC" == true ]]; then
  echo "Public URLs (through Caddy)"
  check_http "API" "$(setting API_PUBLIC_URL)/rest/v1/patients" "401"
  check_http "API, unlisted path" "$(setting API_PUBLIC_URL)/" "404"
  check_http "Sync, unlisted path" "$(setting SYNC_PUBLIC_URL)/probes/liveness" "404"
fi

if [[ $problems -eq 0 ]]; then
  echo "All good."
else
  echo "$problems problem(s). Logs: docker compose -p $PROJECT -f infra/docker-compose.yml logs --tail 50 <service>"
  exit 1
fi
