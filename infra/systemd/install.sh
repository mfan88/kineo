#!/usr/bin/env bash
# Installs and enables kineo.service so the stack starts on boot. Run as root:
#   sudo infra/systemd/install.sh
# Safe to run again (e.g. after moving the repo).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UNIT=/etc/systemd/system/kineo.service

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

sed "s|@KINEO_ROOT@|$ROOT|g" "$ROOT/infra/systemd/kineo.service" >"$UNIT.tmp"
chmod 644 "$UNIT.tmp"
mv "$UNIT.tmp" "$UNIT"
systemctl daemon-reload
systemctl enable kineo.service
# The stack is normally already up from setup.sh; this marks the unit active.
systemctl start kineo.service
echo "kineo.service installed and enabled. Check it with: systemctl status kineo"
