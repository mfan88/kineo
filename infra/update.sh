#!/usr/bin/env bash
# Updates the Kineō server to the latest commit and applies it:
#   infra/update.sh
# Pulls the repo (fast-forward only), pulls pinned images, runs setup.sh (new
# migrations, refreshed Clerk keys, recreated containers), restarts PowerSync if
# its config changed, then reports status. Your data and kineo.env are untouched.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA="$ROOT/infra"
ENV_FILE="$INFRA/kineo.env"
compose() { docker compose --env-file "$ENV_FILE" -f "$INFRA/docker-compose.yml" -p kineo "$@"; }
say() { printf '\033[1m==>\033[0m %s\n' "$*"; }

[[ -f "$ENV_FILE" ]] || {
  echo "infra/kineo.env doesn't exist. Run infra/setup.sh first." >&2
  exit 1
}

before="$(git -C "$ROOT" rev-parse HEAD)"
say "Pulling the latest code"
git -C "$ROOT" pull --ff-only
after="$(git -C "$ROOT" rev-parse HEAD)"

say "Pulling images"
compose pull --quiet

say "Applying migrations and settings"
"$INFRA/setup.sh" </dev/null

changed() { [[ "$before" != "$after" ]] && ! git -C "$ROOT" diff --quiet "$before" "$after" -- "$@"; }

if changed infra/powersync; then
  say "PowerSync config changed: restarting PowerSync"
  compose restart powersync
fi

if changed infra/caddy; then
  say "The Caddy snippet changed. Reload Caddy to apply it:"
  echo "    sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy"
fi

if changed infra/systemd; then
  say "The systemd unit changed. Reinstall it with: sudo $INFRA/systemd/install.sh"
fi

"$INFRA/status.sh"
