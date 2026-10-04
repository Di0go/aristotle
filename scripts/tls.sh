#!/usr/bin/env bash
# Makes the certificate for https://gym.test, as the user (no root), in .gym/tls.
#
# Same pattern as playground.test on this machine: the gym gets its own certificate authority, and that
# authority carries nameConstraints, so it can only ever sign gym.test, even if its key leaves this folder.
# Browsers trust it once scripts/setup-hostname.sh has added it to the system trust store (p11-kit).
#
#   bash scripts/tls.sh
#
# Safe to run again: it keeps the authority and issues a fresh server certificate. Restart the gym after.
set -euo pipefail

NAME=${GYM_HOSTNAME:-gym.test}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TLS=${GYM_TLS_DIR:-$ROOT/.gym/tls}
mkdir -p "$TLS"
chmod 700 "$TLS"
cd "$TLS"

if [[ ! -f ca.key ]]; then
  openssl req -x509 -newkey rsa:3072 -nodes -days 3650 -keyout ca.key -out ca.crt \
    -subj "/CN=Mind Gym CA ($NAME only)" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "nameConstraints=critical,permitted;DNS:$NAME" 2>/dev/null
fi

openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj "/CN=$NAME" 2>/dev/null
cat > server.ext <<EOF
basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:$NAME
EOF
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days 825 -out server.crt -extfile server.ext 2>/dev/null
rm -f server.csr server.ext
chmod 600 ca.key server.key
openssl verify -CAfile ca.crt server.crt
echo "Certificate in $TLS. Browsers trust it after: pkexec bash $ROOT/scripts/setup-hostname.sh"
