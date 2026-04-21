#!/bin/bash
# ============================================================
# Platform Status Dashboard — DigitalOcean Droplet Setup
#
# One-time setup script. Run as root on a fresh Ubuntu 22.04/24.04 droplet.
#
# Usage:
#   ssh root@YOUR_DROPLET_IP
#   curl -sSL https://raw.githubusercontent.com/riteshthawkar/platform-status-monitoring-dashboard/main/deploy/setup.sh | bash
#
#   OR copy this file and run:
#   chmod +x setup.sh && ./setup.sh
#
# What this does:
#   1. Creates a deploy user (dashuser)
#   2. Installs Node.js 20 LTS, PM2, build tools
#   3. Clones the repo and builds the app
#   4. Sets up Nginx reverse proxy with SSL (Let's Encrypt)
#   5. Configures the in-process health check scheduler
#   6. Starts the app via PM2 with auto-restart
#   7. Configures UFW firewall
# ============================================================

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────
APP_NAME="status-dashboard"
APP_USER="dashuser"
APP_DIR="/home/${APP_USER}/app"
DATA_DIR="/home/${APP_USER}/status-dashboard-data"
BACKUP_DIR="/home/${APP_USER}/status-dashboard-backups"
DB_PATH="${DATA_DIR}/status.db"
REPO_URL="https://github.com/riteshthawkar/platform-status-monitoring-dashboard.git"
NODE_VERSION="20"
PORT=3000
BACKUP_CRON="15 2 * * *"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
info() { echo -e "${CYAN}[→]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Platform Status Dashboard — Server Setup"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  err "Please run as root: sudo ./setup.sh"
fi

# ─── Step 1: System update ───────────────────────────────────
info "Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq
log "System updated"

# ─── Step 2: Install essential packages ──────────────────────
info "Installing essential packages..."
apt-get install -y -qq \
  curl wget git build-essential python3 sqlite3 awscli \
  nginx certbot python3-certbot-nginx \
  ufw htop
log "Essential packages installed"

# ─── Step 3: Install Node.js 20 LTS ─────────────────────────
info "Installing Node.js ${NODE_VERSION}..."
if ! command -v node &> /dev/null || [[ "$(node -v)" != v${NODE_VERSION}* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y -qq nodejs
fi
log "Node.js $(node -v) installed"
log "npm $(npm -v) installed"

# ─── Step 4: Install PM2 globally ────────────────────────────
info "Installing PM2..."
npm install -g pm2
log "PM2 $(pm2 -v) installed"

# ─── Step 5: Create app user ────────────────────────────────
info "Creating app user: ${APP_USER}..."
if ! id "${APP_USER}" &>/dev/null; then
  adduser --disabled-password --gecos "" "${APP_USER}"
  log "User ${APP_USER} created"
else
  warn "User ${APP_USER} already exists, skipping"
fi

# ─── Step 6: Clone repository ────────────────────────────────
info "Cloning repository..."
if [ -d "${APP_DIR}" ]; then
  warn "App directory exists. Pulling latest..."
  su - "${APP_USER}" -c "cd ${APP_DIR} && git pull"
else
  su - "${APP_USER}" -c "git clone ${REPO_URL} ${APP_DIR}"
fi
log "Repository ready at ${APP_DIR}"

# ─── Step 7: Install dependencies and build ──────────────────
info "Installing dependencies and building..."
su - "${APP_USER}" -c "cd ${APP_DIR} && npm ci"
su - "${APP_USER}" -c "cd ${APP_DIR} && npm run build"
log "Application built successfully"

# ─── Step 8: Create directories ──────────────────────────────
su - "${APP_USER}" -c "mkdir -p ${DATA_DIR} ${BACKUP_DIR} ${APP_DIR}/logs"
log "Persistent data, backup, and logs directories created"

# ─── Step 9: Create .env.local from example ──────────────────
if [ ! -f "${APP_DIR}/.env.local" ]; then
  info "Creating .env.local from example..."
  su - "${APP_USER}" -c "cp ${APP_DIR}/.env.example ${APP_DIR}/.env.local"
  warn "IMPORTANT: Edit ${APP_DIR}/.env.local with your Slack/Email credentials"
else
  warn ".env.local already exists, not overwriting"
fi

if ! su - "${APP_USER}" -c "grep -q '^DATABASE_PATH=' ${APP_DIR}/.env.local"; then
  info "Configuring persistent SQLite database path..."
  su - "${APP_USER}" -c "printf '\nDATABASE_PATH=%s\n' '${DB_PATH}' >> ${APP_DIR}/.env.local"
  log "DATABASE_PATH set to ${DB_PATH}"
else
  warn "DATABASE_PATH already configured in .env.local, leaving as-is"
fi

if ! su - "${APP_USER}" -c "grep -q '^DATABASE_BACKUP_DIR=' ${APP_DIR}/.env.local"; then
  info "Configuring persistent backup directory..."
  su - "${APP_USER}" -c "printf 'DATABASE_BACKUP_DIR=%s\n' '${BACKUP_DIR}' >> ${APP_DIR}/.env.local"
  log "DATABASE_BACKUP_DIR set to ${BACKUP_DIR}"
else
  warn "DATABASE_BACKUP_DIR already configured in .env.local, leaving as-is"
fi

ENV_BACKUP_CRON=$(su - "${APP_USER}" -c "grep -E '^DATABASE_BACKUP_CRON=' ${APP_DIR}/.env.local | tail -n 1 | cut -d '=' -f 2-" || true)
if [ -n "${ENV_BACKUP_CRON}" ]; then
  BACKUP_CRON="${ENV_BACKUP_CRON}"
fi

# ─── Step 10: Setup PM2 ecosystem ───────────────────────────
info "Setting up PM2..."
su - "${APP_USER}" -c "cd ${APP_DIR} && pm2 start deploy/ecosystem.config.cjs"
su - "${APP_USER}" -c "pm2 save"

# PM2 startup — auto-start on reboot
pm2 startup systemd -u "${APP_USER}" --hp "/home/${APP_USER}"
log "PM2 configured with auto-restart on boot"

# ─── Step 11: Setup backup + log rotation cron ──────────────
info "Installing nightly database backup cron..."
BACKUP_CMD="${BACKUP_CRON} cd ${APP_DIR} && bash src/scripts/backup-database.sh >> ${APP_DIR}/logs/database-backup.log 2>&1"
{ (su - "${APP_USER}" -c "crontab -l 2>/dev/null" | grep -v "backup-database.sh") || true; echo "${BACKUP_CMD}"; } | su - "${APP_USER}" -c "crontab -"
log "Nightly database backup cron installed (${BACKUP_CRON})"

info "Installing log rotation cron..."
ROTATE_CMD="0 0 * * * find ${APP_DIR}/logs -name '*.log' -size +50M -exec truncate -s 0 {} \;"
{ (su - "${APP_USER}" -c "crontab -l 2>/dev/null" | grep -v "truncate") || true; echo "${ROTATE_CMD}"; } | su - "${APP_USER}" -c "crontab -"
log "Log rotation cron installed (daily, >50MB)"

# ─── Step 12: Configure Nginx ───────────────────────────────
info "Configuring Nginx..."
cat > /etc/nginx/sites-available/${APP_NAME} << 'NGINX_CONF'
server {
    listen 80;
    server_name _;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1000;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
    }

    # Cache static assets
    location /_next/static {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
NGINX_CONF

# Enable site, disable default
ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and reload nginx
nginx -t && systemctl reload nginx
log "Nginx configured and running"

# ─── Step 13: Configure firewall ────────────────────────────
info "Configuring UFW firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw --force reload
log "Firewall configured (SSH + HTTP/HTTPS)"

# ─── Step 14: Summary ───────────────────────────────────────
DROPLET_IP=$(curl -s -4 ifconfig.me 2>/dev/null || echo "YOUR_DROPLET_IP")

echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "  ${GREEN}Setup Complete!${NC}"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Dashboard URL:  http://${DROPLET_IP}"
echo "  App directory:  ${APP_DIR}"
echo "  Database path:  ${DB_PATH}"
echo "  Backup dir:     ${BACKUP_DIR}"
echo "  Backup cron:    ${BACKUP_CRON}"
echo "  PM2 status:     su - ${APP_USER} -c 'pm2 status'"
echo "  App logs:       su - ${APP_USER} -c 'pm2 logs'"
echo "  Scheduler logs: su - ${APP_USER} -c 'pm2 logs status-dashboard'"
echo "  Backup logs:    tail -f ${APP_DIR}/logs/database-backup.log"
echo ""
echo "─── Next Steps ─────────────────────────────────────────"
echo ""
echo "  1. Configure alerts:"
echo "     nano ${APP_DIR}/.env.local"
echo "     # Add DASHBOARD_USERNAME, DASHBOARD_PASSWORD, SLACK_WEBHOOK_URL, SMTP_* settings"
echo "     # Optional: configure remote backup upload via DATABASE_BACKUP_REMOTE_* and AWS_* vars"
echo "     su - ${APP_USER} -c 'cd ${APP_DIR} && pm2 restart all'"
echo ""
echo "  2. Add SSL (requires a domain name):"
echo "     # Point your domain DNS to ${DROPLET_IP}"
echo "     # Then run:"
echo "     bash ${APP_DIR}/deploy/setup-ssl.sh status.yourdomain.com"
echo ""
echo "  3. Deploy updates:"
echo "     su - ${APP_USER} -c 'cd ${APP_DIR} && bash deploy/update.sh'"
echo ""
echo "═══════════════════════════════════════════════════════════"
