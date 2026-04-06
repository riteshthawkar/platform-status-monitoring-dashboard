#!/bin/bash
# ============================================================
# Setup nightly cron for SQLite backups
# Run: bash src/scripts/setup-backup-cron.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$PROJECT_DIR/logs"
ENV_FILE="$PROJECT_DIR/.env.local"
BACKUP_SCRIPT="$PROJECT_DIR/src/scripts/backup-database.sh"

read_env_value() {
    local key="$1"
    local fallback="${2:-}"
    local value=""

    if [ -f "$ENV_FILE" ]; then
        value=$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d '=' -f 2- || true)
    fi

    if [ -n "${value}" ]; then
        printf '%s\n' "$value"
    else
        printf '%s\n' "$fallback"
    fi
}

mkdir -p "$LOG_DIR"

BACKUP_CRON="${DATABASE_BACKUP_CRON:-$(read_env_value DATABASE_BACKUP_CRON "15 2 * * *")}"
CRON_CMD="${BACKUP_CRON} cd $PROJECT_DIR && bash $BACKUP_SCRIPT >> $LOG_DIR/database-backup.log 2>&1"

echo "💾 Platform Status Monitor — Backup Cron Setup"
echo "   Project: $PROJECT_DIR"
echo "   Schedule: $BACKUP_CRON"
echo ""

if crontab -l 2>/dev/null | grep -q "backup-database.sh"; then
    echo "⚠️  Backup cron already exists. Current entry:"
    crontab -l | grep "backup-database.sh"
    echo ""
    read -p "Replace it? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        { (crontab -l 2>/dev/null | grep -v "backup-database.sh") || true; echo "$CRON_CMD"; } | crontab -
        echo "✅ Backup cron updated!"
    else
        echo "Skipped."
        exit 0
    fi
else
    (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
    echo "✅ Backup cron installed!"
fi

echo ""
echo "📋 Current crontab:"
crontab -l | grep "backup-database.sh"
echo ""
echo "📄 Backup logs: $LOG_DIR/database-backup.log"
echo "💡 To run now: bash $BACKUP_SCRIPT"
