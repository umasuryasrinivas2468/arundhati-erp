#!/usr/bin/env bash
# One-time setup / idempotent reconfigure for a fresh Ubuntu 24.04 EC2 (arm64 or x86):
# Node 22 + Caddy (auto HTTPS) + systemd running the Next.js app in web/.
#
# Usage (as root), first time or to re-apply after switching to Next.js:
#   DOMAIN=campushub.aims.ac.in \
#   REPO=https://github.com/<owner>/arundhati-erp.git BRANCH=main \
#   SUPABASE_URL=https://xxxx.supabase.co \
#   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
#   bash deploy/setup.sh
#
# SUPABASE_* are written to the service env file on first run (and whenever passed again).
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

id erp >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin erp
mkdir -p "$DATA" && chown -R erp:erp "$DATA" && chmod 700 "$DATA"
[ -d "$APP/.git" ] || git clone --branch "$BRANCH" "$REPO" "$APP"

# Service env file: Supabase credentials the Next.js /api/db route reads.
touch "$DATA/env"; chmod 600 "$DATA/env"; chown erp:erp "$DATA/env"
set_env() { # key value — upsert into $DATA/env
  grep -q "^$1=" "$DATA/env" && sed -i "s|^$1=.*|$1=$2|" "$DATA/env" || echo "$1=$2" >> "$DATA/env"
}
[ -n "${SUPABASE_URL:-}" ] && set_env SUPABASE_URL "$SUPABASE_URL"
[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ] && set_env SUPABASE_SERVICE_ROLE_KEY "$SUPABASE_SERVICE_ROLE_KEY"
if ! grep -q '^SUPABASE_URL=' "$DATA/env" || ! grep -q '^SUPABASE_SERVICE_ROLE_KEY=' "$DATA/env"; then
  echo "WARNING: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in $DATA/env — the app will return {ok:false} until they are."
fi

# Build the Next.js app and let the service user write the runtime cache.
cd "$APP/web"
/usr/local/bin/npm ci
/usr/local/bin/npm run build
chown -R erp:erp "$APP/web/.next"

cat > /etc/systemd/system/arundhati-erp.service <<EOF
[Unit]
Description=CampusHub AIMS (Next.js)
After=network.target
[Service]
User=erp
WorkingDirectory=$APP/web
Environment=PORT=3000 NODE_ENV=production
EnvironmentFile=$DATA/env
ExecStart=/usr/local/bin/node $APP/web/node_modules/next/dist/bin/next start -p 3000
Restart=always
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$DATA $APP/web/.next
[Install]
WantedBy=multi-user.target
EOF

cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
  encode gzip
  reverse_proxy 127.0.0.1:3000
  header Strict-Transport-Security "max-age=31536000"
}
EOF

systemctl daemon-reload
systemctl enable --now arundhati-erp
systemctl restart arundhati-erp
systemctl reload caddy || systemctl restart caddy
echo "Done. Check: curl -s https://$DOMAIN/api/db  (expect {\"ok\":true,...})"
