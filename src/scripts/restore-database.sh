#!/bin/bash
# ============================================================
# SQLite restore script
#
# Restores a `.sqlite3` or `.sqlite3.gz` backup into DATABASE_PATH.
# Stop the app first to avoid restoring over an active SQLite writer.
#
# Usage:
#   bash src/scripts/restore-database.sh /path/to/status-20260405T021500Z.sqlite3.gz
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env.local"

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

if [ $# -lt 1 ]; then
    echo "Usage: bash src/scripts/restore-database.sh /path/to/backup.sqlite3.gz"
    exit 1
fi

BACKUP_SOURCE="$1"
DATABASE_PATH_VALUE="${DATABASE_PATH:-$(read_env_value DATABASE_PATH "$PROJECT_DIR/data/status.db")}"
TARGET_DIR="$(dirname "$DATABASE_PATH_VALUE")"

if ! command -v sqlite3 >/dev/null 2>&1; then
    echo "❌ sqlite3 is required but not installed"
    exit 1
fi

if [ ! -f "$BACKUP_SOURCE" ]; then
    echo "❌ Backup source not found: $BACKUP_SOURCE"
    exit 1
fi

mkdir -p "$TARGET_DIR"

TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
TMP_DB="$(mktemp "${TARGET_DIR}/restore-${TIMESTAMP}.XXXXXX.sqlite3")"

cleanup() {
    rm -f "$TMP_DB"
}
trap cleanup EXIT

case "$BACKUP_SOURCE" in
    *.gz)
        echo "→ Decompressing backup archive..."
        gunzip -c "$BACKUP_SOURCE" > "$TMP_DB"
        ;;
    *)
        echo "→ Copying backup database..."
        cp "$BACKUP_SOURCE" "$TMP_DB"
        ;;
esac

INTEGRITY_RESULT="$(sqlite3 "$TMP_DB" "PRAGMA integrity_check;" | tr -d '\r')"
if [ "$INTEGRITY_RESULT" != "ok" ]; then
    echo "❌ Restore integrity check failed: $INTEGRITY_RESULT"
    exit 1
fi

if [ -f "$DATABASE_PATH_VALUE" ]; then
    PRE_RESTORE_BACKUP="${DATABASE_PATH_VALUE}.pre-restore-${TIMESTAMP}"
    echo "→ Backing up current database to $PRE_RESTORE_BACKUP"
    cp "$DATABASE_PATH_VALUE" "$PRE_RESTORE_BACKUP"
fi

echo "→ Replacing live database at $DATABASE_PATH_VALUE"
rm -f "${DATABASE_PATH_VALUE}-wal" "${DATABASE_PATH_VALUE}-shm"
mv "$TMP_DB" "$DATABASE_PATH_VALUE"
trap - EXIT

echo "✓ Restore complete"
echo "✓ Database path: $DATABASE_PATH_VALUE"
echo "✓ Integrity check: $INTEGRITY_RESULT"
