#!/usr/bin/env bash
# One-time provisioning for a fresh Ubuntu 24.04 EC2 (arm64 or x86): Node 22 + Caddy
# (auto HTTPS) + the systemd service running the Next.js app in web/. Idempotent.
#
# Usage (as root):
#   DOMAIN=campushub.aims.ac.in \
#   REPO=https://github.com/umasuryasrinivas2468/arundhati-erp.git BRANCH=main \
#   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... \
#   bash deploy/setup.sh
#
# Run web/supabase-schema.sql once in Supabase -> SQL Editor before going live.
set -euo pipefail
: "${DOMAIN:?set DOMAIN}" "${REPO:?set REPO}"
BRANCH="${BRANCH:-main}"
APP=/opt/arundhati-erp DATA=/var/lib/arundhati-erp NODE_VER=v22.21.0

apt-get update -y
apt-get install -y git curl debian-keyring debian-archive-keyring apt-transport-https

# Node 22 (official binary; includes npm)
ARCH=$(dpkg --print-architecture); [ "$ARCH" = amd64 ] && ARCH=x64
if [ "$(/usr/local/bin/node -v 2>/dev/null || true)" != "$NODE_VER" ]; then
  curl -fsSL "https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-linux-$ARCH.tar.xz" | tar -xJ -C /usr/local --strip-components=1
fi
node -v

# Caddy (official apt repo) — gets and renews the Let's Encrypt cert by itself
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

[ -d "$APP/.git" ] || git clone --branch "$BRANCH" "$REPO" "$APP"

cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
  encode gzip
  reverse_proxy 127.0.0.1:3000
  header Strict-Transport-Security "max-age=31536000"
}
EOF
systemctl reload caddy || systemctl restart caddy

# Build + systemd unit + Supabase env + start (shared with the CI deploy).
APP="$APP" DATA="$DATA" \
  SUPABASE_URL="${SUPABASE_URL:-}" SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}" \
  bash "$APP/deploy/release.sh"

echo "Done. Check: curl -s https://$DOMAIN/api/db  (expect {\"ok\":true,...})"
