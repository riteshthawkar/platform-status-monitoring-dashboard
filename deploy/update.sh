#!/bin/bash
# ============================================================
# Platform Status Dashboard — Update Script
#
# Pulls latest code, rebuilds, and restarts.
# Run from the app directory:
#   bash deploy/update.sh
# ============================================================

set -euo pipefail

GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
info() { echo -e "${CYAN}[→]${NC} $1"; }

RUNNER_MODE="scheduler"
DATABASE_PATH_VALUE=""
DATABASE_BACKUP_DIR_VALUE=""
if [ -f ".env.local" ]; then
  ENV_RUNNER_MODE=$(grep -E '^CHECK_RUNNER_MODE=' .env.local | tail -n 1 | cut -d '=' -f 2- | tr -d '[:space:]' || true)
  if [ -n "${ENV_RUNNER_MODE}" ]; then
    RUNNER_MODE="${ENV_RUNNER_MODE}"
  fi
  DATABASE_PATH_VALUE=$(grep -E '^DATABASE_PATH=' .env.local | tail -n 1 | cut -d '=' -f 2- | tr -d '[:space:]' || true)
  DATABASE_BACKUP_DIR_VALUE=$(grep -E '^DATABASE_BACKUP_DIR=' .env.local | tail -n 1 | cut -d '=' -f 2- | tr -d '[:space:]' || true)
fi

DEFAULT_DATABASE_PATH="$(pwd)/data/status.db"
EFFECTIVE_DATABASE_PATH="${DATABASE_PATH_VALUE:-$DEFAULT_DATABASE_PATH}"

echo ""
echo "═══════════════════════════════════"
echo "  Updating Status Dashboard..."
echo "═══════════════════════════════════"
echo ""

# Take a point-in-time snapshot before changing code on disk.
if [ -f "${EFFECTIVE_DATABASE_PATH}" ]; then
  info "Creating pre-update SQLite snapshot..."
  bash src/scripts/backup-database.sh --label pre-update
  log "Pre-update SQLite snapshot created"
else
  info "No SQLite database found at ${EFFECTIVE_DATABASE_PATH}; skipping pre-update snapshot"
fi

# Pull latest code
info "Pulling latest changes..."
git pull origin main
log "Code updated"

# Install any new dependencies
info "Installing dependencies..."
npm ci
log "Dependencies installed"

# Rebuild
info "Building application..."
npm run build
log "Build complete"

# Restart PM2 process
info "Restarting application..."
pm2 restart status-dashboard
log "Application restarted"

if [ "${RUNNER_MODE}" != "cron" ] && crontab -l 2>/dev/null | grep -q "cron-checker.ts"; then
  info "Removing legacy cron health checker to avoid duplicate monitoring runs..."
  { (crontab -l 2>/dev/null | grep -v "cron-checker.ts") || true; } | crontab -
  log "Legacy cron health checker removed"
fi

# Verify
sleep 3
if curl -sf http://localhost:3000/api/health-status > /dev/null 2>&1; then
  log "Health check passed — dashboard is live!"
else
  echo -e "\033[0;31m[✗] Health check failed. Check logs: pm2 logs\033[0m"
  exit 1
fi

if [ -n "${DATABASE_PATH_VALUE}" ]; then
  log "SQLite database path: ${DATABASE_PATH_VALUE}"
fi

if [ -n "${DATABASE_BACKUP_DIR_VALUE}" ]; then
  log "SQLite backup dir: ${DATABASE_BACKUP_DIR_VALUE}"
fi

echo ""
echo "═══════════════════════════════════"
echo -e "  ${GREEN}Update complete!${NC}"
echo "═══════════════════════════════════"
echo ""
