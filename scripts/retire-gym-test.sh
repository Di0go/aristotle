#!/usr/bin/env bash
# Takes out what Aristotle had when it was the Mind Gym on gym.test: history, not infrastructure, so it stays here
# while the scripts that set up aristotle.test are the core's (node_modules/@organon/core/scripts, from app.json).
# Nothing to do on an install that never was the Mind Gym; safe to run again.
#
# As yourself: the old user service (mind-gym.service).
#   bash scripts/retire-gym-test.sh
# As root: the old hosts line, nftables rule and unit, and the old certificate authority in the trust store (the one
# the old scripts/tls.sh left as .aristotle/tls/retired-ca.crt, or a ca.crt still made for gym.test). Run it before
# the core's tls.sh, which deletes an authority made for another name without taking it out of the trust store.
#   pkexec bash "$PWD/scripts/retire-gym-test.sh"
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
TLS="${ARISTOTLE_TLS_DIR:-${ARISTOTLE_STATE_DIR:-$ROOT/.aristotle}/tls}"

if [[ $EUID -ne 0 ]]; then
  UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
  if [[ -f "$UNIT_DIR/mind-gym.service" ]]; then
    systemctl --user disable --now mind-gym.service || true
    rm -f "$UNIT_DIR/mind-gym.service"
    systemctl --user daemon-reload
    echo "Removed mind-gym.service"
  else
    echo "No mind-gym.service: nothing to do as yourself."
  fi
  echo "For /etc and the trust store, as root: pkexec bash $ROOT/scripts/retire-gym-test.sh"
  exit 0
fi

# $TLS belongs to the user, so anything there could change between a check and its use. Root reads each file once,
# into a private copy, and uses only that copy.
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
snapshot() { install -m 600 -o root -g root "$1" "$WORK/$(basename "$1")" && echo "$WORK/$(basename "$1")"; }

if [[ -f /etc/systemd/system/mindgym-nome.service ]]; then
  systemctl disable --now mindgym-nome.service || true
  rm -f /etc/systemd/system/mindgym-nome.service
  systemctl daemon-reload
  echo "Removed mindgym-nome.service"
fi
nft delete table ip mindgym 2>/dev/null || true
rm -f /etc/mindgym.nft
if grep -qE '(^#.*Mind Gym|\sgym\.test(\s|$))' /etc/hosts; then
  cp /etc/hosts /etc/hosts.bak-aristotle
  sed -i -E '/^# Mind Gym \(~\/Projects\/Learn\)/d; /^127\.0\.0\.82\s+gym\.test\s*$/d' /etc/hosts
  echo "Removed gym.test from /etc/hosts (backup: /etc/hosts.bak-aristotle)"
fi
for f in "$TLS/retired-ca.crt" "$TLS/ca.crt"; do
  [[ -f "$f" ]] || continue
  CA=$(snapshot "$f")
  # Only an authority made for gym.test: aristotle.test's own stays trusted.
  if openssl x509 -in "$CA" -noout -ext nameConstraints 2>/dev/null | grep -q 'DNS:gym\.test' || [[ "$f" == "$TLS/retired-ca.crt" ]]; then
    trust anchor --remove "$CA" 2>/dev/null || true
    echo "Stopped trusting the old gym.test authority ($(basename "$f"))"
    [[ "$f" == "$TLS/retired-ca.crt" ]] && rm -f "$f"
  fi
done
echo "Done: nothing of gym.test is left."
