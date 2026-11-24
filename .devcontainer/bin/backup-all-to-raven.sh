#!/bin/bash
# Create a Raven database-only backup from a full SQL dump

# Usage: ./backup-all-to-raven.sh /path/to/backup.sql

if [ $# -ne 1 ]; then
    echo "Usage: $0 /path/to/backup.sql"
    exit 1
fi

BACKUP_PATH="$1"

if [ ! -f "$BACKUP_PATH" ]; then
    echo "Error: File '$BACKUP_PATH' does not exist."
    exit 1
fi

BACKUP_PATH="$(cd "$(dirname "$BACKUP_PATH")" && pwd)/$(basename "$BACKUP_PATH")"

MY_SQL_LINE_NUM=$(grep -n "^-- Current Database: \`mysql\`" "$BACKUP_PATH" | head -n 1 | cut -d: -f1)
if [ -z "$MY_SQL_LINE_NUM" ]; then
    echo "Error: '-- Current Database: \`mysql\`' not found in '$BACKUP_PATH'."
    exit 1
fi
echo "Found '-- Current Database: \`mysql\`' at line $MY_SQL_LINE_NUM."

LINE_NUM=$(grep -n "^-- Current Database: \`raven\`" "$BACKUP_PATH" | head -n 1 | cut -d: -f1)
if [ -z "$LINE_NUM" ]; then
    echo "Error: '-- Current Database: \`raven\`' not found in '$BACKUP_PATH'."
    exit 1
fi

echo "Found '-- Current Database: \`raven\`' at line $LINE_NUM."
OUTPUT_PATH="${BACKUP_PATH%.*}-raven.sql"
echo "Creating Raven backup at '$OUTPUT_PATH'."

{
  head -n $(($MY_SQL_LINE_NUM - 1)) "$BACKUP_PATH"
  tail -n +${LINE_NUM} "$BACKUP_PATH"
} > "$OUTPUT_PATH"
echo "Raven backup created successfully at '$OUTPUT_PATH'."
