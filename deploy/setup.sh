#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 24.04 EC2 (arm64 or x86): Node 22 + Caddy (auto HTTPS) + systemd + nightly backups.
# Usage (as root):  DOMAIN=campushub.aims.ac.in REPO=https://github.com/<owner>/arundhati-erp.git BRANCH=main bash setup.sh
# Optional: BACKUP_BUCKET=my-bucket  (instance role needs s3:PutObject on it) to copy nightly backups off the box.
set -euo pipefail
: "${DOMAIN:?set DOMAIN}" "${REPO:?set REPO}"
BRANCH="${BRANCH:-main}"
APP=/opt/arundhati-erp DATA=/var/lib/arundhati-erp NODE_VER=v22.21.0

apt-get update -y
apt-get install -y git sqlite3 curl debian-keyring debian-archive-keyring apt-transport-https

# Node 22 (official binary; Ubuntu's apt node is too old for node:sqlite)
ARCH=$(dpkg --print-architecture); [ "$ARCH" = amd64 ] && ARCH=x64
curl -fsSL "https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-linux-$ARCH.tar.xz" | tar -xJ -C /usr/local --strip-components=1
node -v

# Caddy (official apt repo) — gets and renews the Let's Encrypt cert by itself
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y && apt-get install -y caddy

[ -n "${BACKUP_BUCKET:-}" ] && snap install aws-cli --classic

id erp >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin erp
mkdir -p "$DATA/backups" && chown -R erp:erp "$DATA" && chmod 700 "$DATA"
[ -d "$APP/.git" ] || git clone --branch "$BRANCH" "$REPO" "$APP"

cat > /etc/systemd/system/arundhati-erp.service <<EOF
[Unit]
Description=Arundhati ERP
After=network.target
[Service]
User=erp
WorkingDirectory=$APP
Environment=PORT=3000 DB_PATH=$DATA/erp.db NODE_ENV=production
ExecStart=/usr/local/bin/node $APP/server.js
Restart=always
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$DATA
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

# Nightly 02:30 backup: consistent SQLite copy, keep 14 days locally, optional S3 copy.
cat > /etc/cron.d/arundhati-erp-backup <<EOF
30 2 * * * erp f=$DATA/backups/erp-\$(date +\%F).db; sqlite3 $DATA/erp.db ".backup \$f" && gzip -f \$f && find $DATA/backups -name '*.gz' -mtime +14 -delete${BACKUP_BUCKET:+ && aws s3 cp \$f.gz s3://$BACKUP_BUCKET/arundhati-erp/}
EOF

systemctl daemon-reload
systemctl enable --now arundhati-erp
systemctl reload caddy || systemctl restart caddy
echo "Done. Import data once:  sudo -u erp DB_PATH=$DATA/erp.db node $APP/server.js import /path/to/export.json && systemctl restart arundhati-erp"
