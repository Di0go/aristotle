#!/usr/bin/env bash
# Gives Aristotle a clean URL: https://aristotle.test
#
# Same pattern as bancada.test and playground.test on this machine:
#   1. /etc/hosts maps aristotle.test to its own loopback address, 127.0.0.82.
#   2. /etc/aristotle.nft redirects 127.0.0.82:80 to Aristotle on 127.0.0.1:4747, and :443 to its HTTPS on :4748.
#   3. aristotle-nome.service loads that rule at boot.
#   4. Aristotle's certificate authority (from scripts/tls.sh, limited to aristotle.test) goes into the system
#      trust store (p11-kit), which Firefox and Chromium read. Then .gym/tls/installed tells the server
#      to send http://aristotle.test to https.
# It also takes out what the app had when it was the Mind Gym on gym.test: its hosts line, its nftables
# rule and unit, and its old authority (left by tls.sh as .gym/tls/retired-ca.crt).
#
# Run scripts/tls.sh first (as yourself), then as root:
#   pkexec bash /home/diogo/Projects/Learn/scripts/setup-hostname.sh
# Safe to run again.
# To undo: systemctl disable --now aristotle-nome.service, delete /etc/aristotle.nft and the unit,
# remove the aristotle.test lines from /etc/hosts, trust anchor --remove .gym/tls/ca.crt, and delete .gym/tls.
set -euo pipefail

NAME=aristotle.test
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TLS=$ROOT/.gym/tls

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: pkexec bash $0" >&2
  exit 1
fi

# 0. The old name, gym.test: its unit, rule, hosts lines and authority.
if [[ -f /etc/systemd/system/mindgym-nome.service ]]; then
  systemctl disable --now mindgym-nome.service || true
  rm -f /etc/systemd/system/mindgym-nome.service
  echo "Removed mindgym-nome.service"
fi
nft delete table ip mindgym 2>/dev/null || true
rm -f /etc/mindgym.nft
if grep -qE '(^#.*Mind Gym|\sgym\.test(\s|$))' /etc/hosts; then
  cp /etc/hosts /etc/hosts.bak-aristotle
  sed -i -E '/^# Mind Gym \(~\/Projects\/Learn\)/d; /^127\.0\.0\.82\s+gym\.test\s*$/d' /etc/hosts
  echo "Removed gym.test from /etc/hosts (backup: /etc/hosts.bak-aristotle)"
fi
if [[ -f $TLS/retired-ca.crt ]]; then
  trust anchor --remove "$TLS/retired-ca.crt" 2>/dev/null || true
  rm -f "$TLS/retired-ca.crt"
  echo "Stopped trusting the old gym.test authority"
fi

# 1. Hosts entry (only if missing).
if ! grep -qE '^[^#]*\saristotle\.test(\s|$)' /etc/hosts; then
  [[ -f /etc/hosts.bak-aristotle ]] || cp /etc/hosts /etc/hosts.bak-aristotle
  printf '\n# Aristotle (~/Projects/Learn): reencaminhado para 127.0.0.1:4747\n127.0.0.82 aristotle.test\n' >> /etc/hosts
  echo "Added aristotle.test to /etc/hosts"
else
  echo "aristotle.test already in /etc/hosts"
fi

# 2. Redirect rule.
cat > /etc/aristotle.nft <<'EOF'
#!/usr/bin/nft -f
# Aristotle: http(s)://aristotle.test -> 127.0.0.1:4747 (http) and :4748 (https)
destroy table ip aristotle
table ip aristotle {
  chain saida {
    type nat hook output priority -100; policy accept;
    ip daddr 127.0.0.82 tcp dport 80 redirect to :4747
    ip daddr 127.0.0.82 tcp dport 443 redirect to :4748
  }
}
EOF

# 3. Unit that loads it at boot.
cat > /etc/systemd/system/aristotle-nome.service <<'EOF'
[Unit]
Description=Aristotle: aristotle.test:80/443 para 127.0.0.1:4747/4748
After=nftables.service
PartOf=nftables.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/nft -f /etc/aristotle.nft
ExecStop=/usr/bin/nft delete table ip aristotle

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable aristotle-nome.service
systemctl restart aristotle-nome.service
echo "aristotle-nome.service: $(systemctl is-active aristotle-nome.service)"

# 4. Trust Aristotle's certificate authority, but only one that cannot sign anything other than aristotle.test.
if [[ ! -f $TLS/ca.crt ]]; then
  echo "No certificate yet: run 'bash $ROOT/scripts/tls.sh' as yourself, then this again." >&2
  exit 1
fi
if ! openssl x509 -in "$TLS/ca.crt" -noout -ext nameConstraints | grep -q "DNS:$NAME"; then
  echo "$TLS/ca.crt is not limited to $NAME: not trusting it. Run 'bash $ROOT/scripts/tls.sh' first." >&2
  exit 1
fi
trust anchor --remove "$TLS/ca.crt" 2>/dev/null || true
trust anchor --store "$TLS/ca.crt"
install -o "$(stat -c %U "$TLS")" -g "$(stat -c %G "$TLS")" -m 644 /dev/null "$TLS/installed"
echo "Trusted. Restart Aristotle (pnpm app restart) and open https://$NAME"
