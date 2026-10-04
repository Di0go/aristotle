#!/usr/bin/env bash
# Gives the Mind Gym a clean URL: http://gym.test
#
# Same pattern as bancada.test and playground.test on this machine:
#   1. /etc/hosts maps gym.test to its own loopback address, 127.0.0.82.
#   2. /etc/mindgym.nft redirects 127.0.0.82:80 to the gym on 127.0.0.1:4747.
#   3. mindgym-nome.service loads that rule at boot.
#
# Run as root (pkexec bash /home/diogo/Projects/Learn/scripts/setup-hostname.sh). Safe to run again.
# To undo: systemctl disable --now mindgym-nome.service, delete /etc/mindgym.nft and the unit,
# and remove the gym.test lines from /etc/hosts.
set -euo pipefail

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
# Mind Gym: http://gym.test -> 127.0.0.1:4747
destroy table ip mindgym
table ip mindgym {
  chain saida {
    type nat hook output priority -100; policy accept;
    ip daddr 127.0.0.82 tcp dport 80 redirect to :4747
  }
}
EOF

# 3. Unit that loads it at boot.
cat > /etc/systemd/system/mindgym-nome.service <<'EOF'
[Unit]
Description=Mind Gym: gym.test:80 para 127.0.0.1:4747
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
