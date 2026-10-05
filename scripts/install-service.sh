#!/usr/bin/env bash
# Runs Aristotle at login as a systemd user service, so https://aristotle.test (and Claude Code in its
# terminal drawer) is always there without starting anything first. No root needed.
#
#   bash scripts/install-service.sh
#
# To undo: systemctl --user disable --now aristotle.service && rm ~/.config/systemd/user/aristotle.service
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
NODE=$(command -v node)
UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$UNIT_DIR"

cat > "$UNIT_DIR/aristotle.service" <<UNIT
[Unit]
Description=Aristotle (https://aristotle.test)

[Service]
WorkingDirectory=$ROOT
ExecStart=$NODE $ROOT/server/index.ts
Restart=on-failure
RestartSec=2
# Claude Code lives in ~/.local/bin; a service doesn't get the login shell's PATH.
Environment=PATH=$HOME/.local/bin:$(dirname "$NODE"):/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=default.target
UNIT

# The service from when the app was the Mind Gym, if it is still there.
if [[ -f "$UNIT_DIR/mind-gym.service" ]]; then
  systemctl --user disable --now mind-gym.service || true
  rm -f "$UNIT_DIR/mind-gym.service"
fi

# Hand over from a server Claude Code started, if one is running.
"$NODE" "$ROOT/server/control.ts" stop || true

systemctl --user daemon-reload
systemctl --user enable --now aristotle.service
sleep 1
echo "aristotle.service: $(systemctl --user is-active aristotle.service)"
