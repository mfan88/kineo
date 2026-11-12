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

# Run git as the repo's owner: git refuses repos owned by another user, so a
# plain `sudo git pull` would fail.
repo_git() {
  local owner
  owner="$(stat -c %U "$ROOT")"
  if [[ $EUID -eq 0 && "$owner" != root ]]; then
    sudo -u "$owner" git -C "$ROOT" "$@"
  else
    git -C "$ROOT" "$@"
  fi
}

before="$(repo_git rev-parse HEAD)"
say "Pulling the latest code"
repo_git pull --ff-only
after="$(repo_git rev-parse HEAD)"

say "Pulling images"
compose pull --quiet

say "Applying migrations and settings"
"$INFRA/setup.sh" </dev/null

changed() { [[ "$before" != "$after" ]] && ! repo_git diff --quiet "$before" "$after" -- "$@"; }

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
