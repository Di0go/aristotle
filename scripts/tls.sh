#!/usr/bin/env bash
# Makes the certificate for https://aristotle.test, as the user (no root), in .aristotle/tls.
#
# Aristotle gets its own certificate authority, and that
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
TLS="${ARISTOTLE_TLS_DIR:-${ARISTOTLE_STATE_DIR:-$ROOT/.aristotle}/tls}"
mkdir -p "$TLS"
chmod 700 "$TLS"
cd "$TLS"

# The names an authority may sign for, one per line, exactly as openssl prints them.
permitted() {
  openssl x509 -in "$1" -noout -ext nameConstraints 2>/dev/null | sed -n '/Permitted:/,/Excluded:/{/DNS:\|IP:\|email:\|URI:\|DirName:/p}' | tr -d ' '
}

# An authority made for anything but $NAME alone (the app was gym.test once) is retired. Its certificate
# stays as retired-ca.crt so setup-hostname.sh can take it out of the trust store.
if [[ -f ca.crt ]] && [[ "$(permitted ca.crt)" != "DNS:$NAME" ]]; then
  mv ca.crt retired-ca.crt
  rm -f ca.key ca.srl installed
fi

# The authority, made once: it may sign only certificates for $NAME, and nothing below it may sign at all.
if [[ ! -f ca.key ]]; then
  openssl req -x509 -newkey rsa:3072 -nodes -days 3650 -keyout ca.key -out ca.crt \
    -subj "/CN=Aristotle CA ($NAME only)" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "nameConstraints=critical,permitted;DNS:$NAME" 2>/dev/null
fi

# A fresh server certificate for $NAME, signed by the authority, then a check that it verifies.
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
