#!/bin/bash
# ============================================================
# SQLite backup script
#
# Creates a consistent SQLite snapshot using `.backup`, verifies
# integrity, compresses it, and prunes old backups.
#
# Run manually:
#   bash src/scripts/backup-database.sh
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

DATABASE_PATH_VALUE="${DATABASE_PATH:-$(read_env_value DATABASE_PATH "$PROJECT_DIR/data/status.db")}"
BACKUP_DIR="${DATABASE_BACKUP_DIR:-$(read_env_value DATABASE_BACKUP_DIR "$PROJECT_DIR/backups")}"
RETENTION_DAYS="${DATABASE_BACKUP_RETENTION_DAYS:-$(read_env_value DATABASE_BACKUP_RETENTION_DAYS "14")}"

if ! command -v sqlite3 >/dev/null 2>&1; then
    echo "❌ sqlite3 is required but not installed"
    exit 1
fi

if [ ! -f "$DATABASE_PATH_VALUE" ]; then
    echo "❌ Database file not found: $DATABASE_PATH_VALUE"
    exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
TMP_DIR="$(mktemp -d "$BACKUP_DIR/.backup-tmp.XXXXXX")"
SNAPSHOT_DB="$TMP_DIR/status-$TIMESTAMP.sqlite3"
ARCHIVE_PATH="$BACKUP_DIR/status-$TIMESTAMP.sqlite3.gz"
META_PATH="$BACKUP_DIR/status-$TIMESTAMP.meta"

cleanup() {
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "→ Creating SQLite snapshot from $DATABASE_PATH_VALUE"
sqlite3 "$DATABASE_PATH_VALUE" ".timeout 5000" ".backup '$SNAPSHOT_DB'"

INTEGRITY_RESULT="$(sqlite3 "$SNAPSHOT_DB" "PRAGMA integrity_check;" | tr -d '\r')"
if [ "$INTEGRITY_RESULT" != "ok" ]; then
    echo "❌ Backup integrity check failed: $INTEGRITY_RESULT"
    exit 1
fi

gzip -c "$SNAPSHOT_DB" > "$ARCHIVE_PATH"

FILE_SIZE_BYTES="$(wc -c < "$ARCHIVE_PATH" | tr -d '[:space:]')"
SHA256="$(shasum -a 256 "$ARCHIVE_PATH" | awk '{print $1}')"

cat > "$META_PATH" <<EOF
timestamp_utc=$TIMESTAMP
database_path=$DATABASE_PATH_VALUE
archive_path=$ARCHIVE_PATH
size_bytes=$FILE_SIZE_BYTES
sha256=$SHA256
integrity_check=$INTEGRITY_RESULT
retention_days=$RETENTION_DAYS
EOF

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'status-*.sqlite3.gz' -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'status-*.meta' -mtime +"$RETENTION_DAYS" -delete

echo "✓ Backup created: $ARCHIVE_PATH"
echo "✓ Metadata written: $META_PATH"
echo "✓ Retention applied: $RETENTION_DAYS day(s)"
