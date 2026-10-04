#!/usr/bin/env bash
# Gives the Mind Gym a clean URL: https://gym.test
#
# Same pattern as bancada.test and playground.test on this machine:
#   1. /etc/hosts maps gym.test to its own loopback address, 127.0.0.82.
#   2. /etc/mindgym.nft redirects 127.0.0.82:80 to the gym on 127.0.0.1:4747, and :443 to its HTTPS on :4748.
#   3. mindgym-nome.service loads that rule at boot.
#   4. The gym's certificate authority (from scripts/tls.sh, limited to gym.test) goes into the system
#      trust store (p11-kit), which Firefox and Chromium read. Then .gym/tls/installed tells the server
#      to send http://gym.test to https.
#
# Run scripts/tls.sh first (as yourself), then as root:
#   pkexec bash /home/diogo/Projects/Learn/scripts/setup-hostname.sh
# Safe to run again.
# To undo: systemctl disable --now mindgym-nome.service, delete /etc/mindgym.nft and the unit,
# remove the gym.test lines from /etc/hosts, trust anchor --remove .gym/tls/ca.crt, and delete .gym/tls.
set -euo pipefail

NAME=gym.test
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TLS=$ROOT/.gym/tls

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: pkexec bash $0" >&2
  exit 1
fi

# 1. Hosts entry (only if missing).
if ! grep -qE '^[^#]*\sgym\.test(\s|$)' /etc/hosts; then
  cp /etc/hosts /etc/hosts.bak-mindgym
  printf '\n# Mind Gym (~/Projects/Learn): reencaminhado para 127.0.0.1:4747\n127.0.0.82 gym.test\n' >> /etc/hosts
  echo "Added gym.test to /etc/hosts (backup: /etc/hosts.bak-mindgym)"
else
  echo "gym.test already in /etc/hosts"
fi

# 2. Redirect rule.
cat > /etc/mindgym.nft <<'EOF'
#!/usr/bin/nft -f
# Mind Gym: http(s)://gym.test -> 127.0.0.1:4747 (http) and :4748 (https)
destroy table ip mindgym
table ip mindgym {
  chain saida {
    type nat hook output priority -100; policy accept;
    ip daddr 127.0.0.82 tcp dport 80 redirect to :4747
    ip daddr 127.0.0.82 tcp dport 443 redirect to :4748
  }
}
EOF

# 3. Unit that loads it at boot.
cat > /etc/systemd/system/mindgym-nome.service <<'EOF'
[Unit]
Description=Mind Gym: gym.test:80/443 para 127.0.0.1:4747/4748
After=nftables.service
PartOf=nftables.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/nft -f /etc/mindgym.nft
ExecStop=/usr/bin/nft delete table ip mindgym

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable mindgym-nome.service
systemctl restart mindgym-nome.service
echo "mindgym-nome.service: $(systemctl is-active mindgym-nome.service)"

# 4. Trust the gym's certificate authority, but only one that cannot sign anything other than gym.test.
if [[ ! -f $TLS/ca.crt ]]; then
  echo "No certificate yet: run 'bash $ROOT/scripts/tls.sh' as yourself, then this again." >&2
  exit 1
fi
if ! openssl x509 -in "$TLS/ca.crt" -noout -ext nameConstraints | grep -q "DNS:$NAME"; then
  echo "$TLS/ca.crt is not limited to $NAME: not trusting it." >&2
  exit 1
fi
trust anchor --remove "$TLS/ca.crt" 2>/dev/null || true
trust anchor --store "$TLS/ca.crt"
install -o "$(stat -c %U "$TLS")" -g "$(stat -c %G "$TLS")" -m 644 /dev/null "$TLS/installed"
echo "Trusted. Restart the gym (pnpm gym restart) and open https://$NAME"
