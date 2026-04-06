#!/bin/bash
# ============================================================
# Setup cron job for background health checks
# Run: bash src/scripts/setup-cron.sh
#
# This is an alternative to the in-process scheduler.
# If you install cron, set CHECK_RUNNER_MODE=cron in .env.local.
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$PROJECT_DIR/logs"
ENV_FILE="$PROJECT_DIR/.env.local"

echo "📦 Platform Status Monitor — Cron Setup"
echo "   Project: $PROJECT_DIR"
echo ""

# Create logs directory
mkdir -p "$LOG_DIR"

# The cron command
CRON_CMD="*/2 * * * * cd $PROJECT_DIR && /usr/local/bin/npx tsx src/scripts/cron-checker.ts >> $LOG_DIR/cron.log 2>&1"

# Check if already installed
if crontab -l 2>/dev/null | grep -q "cron-checker.ts"; then
    echo "⚠️  Cron job already exists. Current entry:"
    crontab -l | grep "cron-checker"
    echo ""
    read -p "Replace it? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Remove old entry, add new one
        { (crontab -l 2>/dev/null | grep -v "cron-checker.ts") || true; echo "$CRON_CMD"; } | crontab -
        echo "✅ Cron job updated!"
    else
        echo "Skipped."
        exit 0
    fi
else
    # Add new cron job
    (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
    echo "✅ Cron job installed!"
fi

echo ""
if [ -f "$ENV_FILE" ]; then
    if grep -q "^CHECK_RUNNER_MODE=" "$ENV_FILE"; then
        sed -i.bak 's/^CHECK_RUNNER_MODE=.*/CHECK_RUNNER_MODE=cron/' "$ENV_FILE"
    else
        echo "CHECK_RUNNER_MODE=cron" >> "$ENV_FILE"
    fi
    echo "🛠  Updated $ENV_FILE to CHECK_RUNNER_MODE=cron"
    echo ""
fi

echo "📋 Current crontab:"
crontab -l | grep "cron-checker"
echo ""
echo "📄 Logs will be written to: $LOG_DIR/cron.log"
echo "🔍 Monitor logs: tail -f $LOG_DIR/cron.log"
echo ""
echo "💡 To remove: crontab -e and delete the cron-checker line"
echo "💡 To test now: cd $PROJECT_DIR && npx tsx src/scripts/cron-checker.ts"
