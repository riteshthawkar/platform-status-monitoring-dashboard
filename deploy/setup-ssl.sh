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
SITE_FILE="/etc/nginx/sites-available/${APP_NAME}"

echo ""
echo "═══════════════════════════════════"
echo "  Setting up SSL for: ${DOMAIN}"
echo "═══════════════════════════════════"
echo ""

if [ ! -f "${SITE_FILE}" ]; then
  echo "Nginx site file not found: ${SITE_FILE}"
  exit 1
fi

# Update Nginx config with the domain
sed -i -E "s/server_name[[:space:]]+[^;]+;/server_name ${DOMAIN};/g" "${SITE_FILE}"
nginx -t && systemctl reload nginx

# Get or install SSL certificate
if certbot certificates 2>/dev/null | grep -q "Certificate Name: ${DOMAIN}$"; then
  echo "Existing certificate found. Installing it into Nginx..."
  certbot install --cert-name "${DOMAIN}" --nginx --non-interactive
else
  certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos --redirect --email admin@${DOMAIN#*.}
fi

# Verify auto-renewal
certbot renew --dry-run

echo ""
echo "═══════════════════════════════════"
echo "  SSL configured!"
echo "  https://${DOMAIN}"
echo "  Auto-renewal: enabled"
echo "═══════════════════════════════════"
echo ""
