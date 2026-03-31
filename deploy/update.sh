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

echo ""
echo "═══════════════════════════════════"
echo "  Updating Status Dashboard..."
echo "═══════════════════════════════════"
echo ""

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

# Verify
sleep 3
if curl -sf http://localhost:3000/api/health-status > /dev/null 2>&1; then
  log "Health check passed — dashboard is live!"
else
  echo -e "\033[0;31m[✗] Health check failed. Check logs: pm2 logs\033[0m"
  exit 1
fi

echo ""
echo "═══════════════════════════════════"
echo -e "  ${GREEN}Update complete!${NC}"
echo "═══════════════════════════════════"
echo ""
