#!/usr/bin/env bash
# Per-release (run as root on the EC2 box): (re)write the systemd unit for the Next.js
# app, store Supabase creds in the service env file, build web/, and restart the service.
# Idempotent — safe to run on every deploy. Node 22 + Caddy must already be installed
# (deploy/setup.sh does that once).
#
# Env:
#   APP   (default /opt/arundhati-erp)   — repo checkout
#   DATA  (default /var/lib/arundhati-erp) — service state (env file)
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — written to the env file when provided
set -euo pipefail
APP="${APP:-/opt/arundhati-erp}"
DATA="${DATA:-/var/lib/arundhati-erp}"
NODE=/usr/local/bin/node
NPM=/usr/local/bin/npm

id erp >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin erp
mkdir -p "$DATA"; chmod 700 "$DATA"; chown erp:erp "$DATA"
touch "$DATA/env"; chmod 600 "$DATA/env"; chown erp:erp "$DATA/env"

set_env() { # KEY VALUE — upsert into $DATA/env
  if grep -q "^$1=" "$DATA/env"; then
    sed -i "s|^$1=.*|$1=$2|" "$DATA/env"
  else
    echo "$1=$2" >> "$DATA/env"
  fi
}
[ -n "${SUPABASE_URL:-}" ] && set_env SUPABASE_URL "$SUPABASE_URL"
[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ] && set_env SUPABASE_SERVICE_ROLE_KEY "$SUPABASE_SERVICE_ROLE_KEY"
# Session-cookie signing key: made once, kept across deploys (changing it signs everyone out).
grep -q '^SESSION_SECRET=' "$DATA/env" || set_env SESSION_SECRET "$(openssl rand -hex 32)"
if ! grep -q '^SUPABASE_URL=' "$DATA/env" || ! grep -q '^SUPABASE_SERVICE_ROLE_KEY=' "$DATA/env"; then
  echo "WARNING: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in $DATA/env — /api/db will return {ok:false}."
fi

cat > /etc/systemd/system/arundhati-erp.service <<EOF
[Unit]
Description=CampusHub AIMS (Next.js)
After=network.target
[Service]
User=erp
WorkingDirectory=$APP/web
Environment=PORT=3000 NODE_ENV=production
EnvironmentFile=$DATA/env
ExecStart=$NODE $APP/web/node_modules/next/dist/bin/next start -p 3000
Restart=always
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$DATA $APP/web/.next
[Install]
WantedBy=multi-user.target
EOF

cd "$APP/web"
"$NPM" ci
"$NPM" run build
chown -R erp:erp "$APP/web/.next"

systemctl daemon-reload
systemctl enable arundhati-erp >/dev/null 2>&1 || true
systemctl restart arundhati-erp
echo "Released $(cd "$APP" && git rev-parse --short HEAD) — service restarted."
