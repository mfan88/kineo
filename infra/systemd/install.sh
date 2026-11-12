#!/usr/bin/env bash
# Installs kineo.service (start on boot) and the nightly backup timer. Run as root:
#   sudo infra/systemd/install.sh
# Safe to run again (e.g. after moving the repo).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

[[ $EUID -eq 0 ]] || {
  echo "Run as root: sudo $0" >&2
  exit 1
}
[[ -d /run/systemd/system ]] || {
  echo "This machine isn't running systemd." >&2
  exit 1
}
[[ -f "$ROOT/infra/kineo.env" ]] || {
  echo "Run infra/setup.sh first (infra/kineo.env doesn't exist yet)." >&2
  exit 1
}
[[ "$ROOT" != *"|"* ]] || {
  echo "The repo path can't contain '|'." >&2
  exit 1
}

install_unit() {
  local name="$1" target="/etc/systemd/system/$1"
  sed "s|@KINEO_ROOT@|$ROOT|g" "$ROOT/infra/systemd/$name" >"$target.tmp"
  chmod 644 "$target.tmp"
  mv "$target.tmp" "$target"
}

install_unit kineo.service
install_unit kineo-backup.service
install_unit kineo-backup.timer
systemctl daemon-reload
systemctl enable kineo.service
# The stack is normally already up from setup.sh; this marks the unit active.
systemctl start kineo.service
echo "kineo.service installed and enabled. Check it with: systemctl status kineo"

# Nightly backups, once there's a public key to encrypt them with.
if grep -q '^BACKUP_AGE_RECIPIENT=age1' "$ROOT/infra/kineo.env" && grep -q '^BACKUP_DIR=.' "$ROOT/infra/kineo.env"; then
  systemctl enable --now kineo-backup.timer
  echo "Nightly backups enabled. Next run: $(systemctl show kineo-backup.timer -p NextElapseUSecRealtime --value)"
else
  systemctl disable --now kineo-backup.timer >/dev/null 2>&1 || true
  echo "Nightly backups are off: set BACKUP_AGE_RECIPIENT and BACKUP_DIR in infra/kineo.env, then run this again."
fi
