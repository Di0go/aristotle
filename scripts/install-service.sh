#!/usr/bin/env bash
# Runs Aristotle at login as a systemd user service, so https://aristotle.test (and Claude Code in its
# terminal drawer) is always there without starting anything first. No root needed.
#
#   bash scripts/install-service.sh
#
# The service runs the checkout this script is in. `pnpm release` runs it from the release copy, with
# ARISTOTLE_DATA_DIR and ARISTOTLE_STATE_DIR pointing back at your working checkout's data/ and .aristotle/,
# so the code that serves you is a fixed release while the data stays where it always was.
# Safe to run again: it rewrites the unit and restarts the service.
#
# To undo: systemctl --user disable --now aristotle.service && rm ~/.config/systemd/user/aristotle.service
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
NODE=$(command -v node)
UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$UNIT_DIR"

# Pass the data and state folders on to the service when they are set (pnpm release sets them).
EXTRA_ENV=""
for var in ARISTOTLE_DATA_DIR ARISTOTLE_STATE_DIR; do
  if [[ -n "${!var:-}" ]]; then EXTRA_ENV+="Environment=$var=${!var}"$'\n'; fi
done

# Node keeps the compiled server here, so a restart starts about a third faster. Emptied on every install (each
# release), so it never fills with entries for code that no longer runs.
CACHE="${ARISTOTLE_STATE_DIR:-$ROOT/.aristotle}/compile-cache"
rm -rf "$CACHE"
mkdir -p -m 700 "$CACHE"

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
Environment=NODE_COMPILE_CACHE=$CACHE
${EXTRA_ENV}
[Install]
WantedBy=default.target
UNIT

# The service from when the app was the Mind Gym, if it is still there.
if [[ -f "$UNIT_DIR/mind-gym.service" ]]; then
  systemctl --user disable --now mind-gym.service || true
  rm -f "$UNIT_DIR/mind-gym.service"
fi

# Hand over from a server Claude Code started, if one is running and the service isn't yet.
if ! systemctl --user is-enabled --quiet aristotle.service; then
  "$NODE" "$ROOT/server/control.ts" stop || true
fi

# Load the unit and (re)start it, then say what is running.
systemctl --user daemon-reload
systemctl --user enable aristotle.service
systemctl --user restart aristotle.service
sleep 1
echo "aristotle.service: $(systemctl --user is-active aristotle.service), running $ROOT"
