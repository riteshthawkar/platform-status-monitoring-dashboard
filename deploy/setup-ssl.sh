#!/bin/bash
# ============================================================
# SSL Certificate Setup — Let's Encrypt
#
# Usage: sudo bash deploy/setup-ssl.sh status.yourdomain.com
#
# Prerequisites:
#   - Domain DNS must point to this server's IP
#   - Nginx must be running (done by setup.sh)
# ============================================================

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: sudo bash deploy/setup-ssl.sh YOUR_DOMAIN"
  echo "Example: sudo bash deploy/setup-ssl.sh status.lawa.ai"
  exit 1
fi

DOMAIN="$1"
APP_NAME="status-dashboard"

echo ""
echo "═══════════════════════════════════"
echo "  Setting up SSL for: ${DOMAIN}"
echo "═══════════════════════════════════"
echo ""

# Update Nginx config with the domain
sed -i "s/server_name _;/server_name ${DOMAIN};/" /etc/nginx/sites-available/${APP_NAME}
nginx -t && systemctl reload nginx

# Get SSL certificate
certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos --redirect --email admin@${DOMAIN#*.}

# Verify auto-renewal
certbot renew --dry-run

echo ""
echo "═══════════════════════════════════"
echo "  SSL configured!"
echo "  https://${DOMAIN}"
echo "  Auto-renewal: enabled"
echo "═══════════════════════════════════"
echo ""
