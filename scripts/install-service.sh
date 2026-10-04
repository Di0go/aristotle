#!/usr/bin/env bash
# Runs the Mind Gym at login as a systemd user service, so http://gym.test (and Claude Code in its
# terminal drawer) is always there without starting anything first. No root needed.
#
#   bash scripts/install-service.sh
#
# To undo: systemctl --user disable --now mind-gym.service && rm ~/.config/systemd/user/mind-gym.service
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
NODE=$(command -v node)
UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$UNIT_DIR"

cat > "$UNIT_DIR/mind-gym.service" <<UNIT
[Unit]
Description=Mind Gym (http://gym.test)

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

# Hand over from a server Claude Code started, if one is running.
"$NODE" "$ROOT/server/control.ts" stop || true

systemctl --user daemon-reload
systemctl --user enable --now mind-gym.service
sleep 1
echo "mind-gym.service: $(systemctl --user is-active mind-gym.service)"
