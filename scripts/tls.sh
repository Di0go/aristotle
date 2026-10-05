#!/usr/bin/env bash
# Makes the certificate for https://aristotle.test, as the user (no root), in .aristotle/tls.
#
# Same pattern as playground.test on this machine: Aristotle gets its own certificate authority, and that
# authority carries nameConstraints, so it can only ever sign aristotle.test, even if its key leaves this folder.
# Browsers trust it once scripts/setup-hostname.sh has added it to the system trust store (p11-kit).
#
#   bash scripts/tls.sh
#
# Safe to run again: it keeps the authority (unless it was made for another name) and issues a fresh server
# certificate. Restart Aristotle after.
set -euo pipefail

NAME=${ARISTOTLE_HOSTNAME:-aristotle.test}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TLS=${ARISTOTLE_TLS_DIR:-${ARISTOTLE_STATE_DIR:-$ROOT/.aristotle}/tls}
mkdir -p "$TLS"
chmod 700 "$TLS"
cd "$TLS"

# An authority made for another name (the app was gym.test once) can't sign this one: retire it. Its
# certificate stays as retired-ca.crt so setup-hostname.sh can take it out of the trust store.
if [[ -f ca.crt ]] && ! openssl x509 -in ca.crt -noout -ext nameConstraints | grep -q "DNS:$NAME\b"; then
  mv ca.crt retired-ca.crt
  rm -f ca.key ca.srl installed
fi

if [[ ! -f ca.key ]]; then
  openssl req -x509 -newkey rsa:3072 -nodes -days 3650 -keyout ca.key -out ca.crt \
    -subj "/CN=Aristotle CA ($NAME only)" \
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
