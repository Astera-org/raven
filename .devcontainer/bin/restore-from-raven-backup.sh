#!/bin/bash

# Restore a Raven database from a backup SQL file
# Usage: ./restore-from-raven-backup.sh /path/to/backup-raven.sql

if [ $# -ne 1 ]; then
    echo "Usage: $0 /path/to/backup-raven.sql"
    exit 1
fi

BACKUP_PATH="$1"

if [ ! -f "$BACKUP_PATH" ]; then
    echo "Error: File '$BACKUP_PATH' does not exist."
    exit 1
fi

if [[ "$BACKUP_PATH" != *-raven.sql ]]; then
    read -p "Warning: The backup file does not end with '-raven.sql'. Continue? [y/N]: " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
    fi
fi

echo "Ensuring 'raven' user exists with correct privileges..."
mysql -h db -u root -proot_password --ssl=false -e "
    CREATE USER IF NOT EXISTS 'raven'@'%' IDENTIFIED BY 'raven_dev_password';
    GRANT USAGE ON *.* TO 'raven'@'%';
    GRANT ALL PRIVILEGES ON \`raven\`.* TO 'raven'@'%';
    FLUSH PRIVILEGES;";

# Check if the 'raven' database exists
echo 'Checking for existing "raven" database...'
if mysql -h db -u raven -praven_dev_password --ssl=false -e "USE raven;" 2>/dev/null; then
    TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
    NEW_DB="raven-${TIMESTAMP}"
    echo "Renaming existing 'raven' database to '${NEW_DB}'..."
    echo "Creating new database '${NEW_DB}' and copying data from 'raven'..."
    mysql -h db -u root -proot_password --ssl=false -e "CREATE DATABASE \`${NEW_DB}\`;"
    echo "Copying data from 'raven' to '${NEW_DB}'..."
    mysqldump -h db -u root -proot_password --ssl=false raven | mysql -h db -u root -proot_password --ssl=false "${NEW_DB}"
    echo "Dropping old 'raven' database..."
    mysql -h db -u root -proot_password --ssl=false -e "DROP DATABASE raven;"
fi
echo "Restoring backup from '$BACKUP_PATH' to 'raven' database..."
# Pin the collation: MySQL 8.4 defaults to utf8mb4_0900_ai_ci, and tables created
# by later migrations would then fail foreign keys to the utf8mb4_unicode_ci tables.
mysql -h db -u root -proot_password --ssl=false -e "CREATE DATABASE raven DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
echo "Restoring backup to 'raven' database..."
mysql -h db -u root -proot_password --ssl=false raven < "$BACKUP_PATH"
# Restore with proper settings to handle collation, time_zone, and foreign keys
# (
#   echo "SET FOREIGN_KEY_CHECKS=0;"
#   echo "SET UNIQUE_CHECKS=0;"
#   echo "SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO,NO_ENGINE_SUBSTITUTION';"
#   echo "SET TIME_ZONE='+00:00';"
#   echo "USE raven;"
#   cat "$BACKUP_PATH"
#   echo "SET FOREIGN_KEY_CHECKS=1;"
#   echo "SET UNIQUE_CHECKS=1;"
# ) | mysql -h db -u root -proot_password --ssl=false

echo "Resetting root password after restore..."
mysql -h db -u root -proot_password --ssl=false -e "
  ALTER USER 'root'@'%' IDENTIFIED BY 'root_password';
  FLUSH PRIVILEGES;
" 2>/dev/null;
root_result=$?;

echo "Ensuring 'raven' user has correct privileges after restore..."
mysql -h db -u root -proot_password --ssl=false -e "
    CREATE USER IF NOT EXISTS 'raven'@'%' IDENTIFIED BY 'raven_dev_password';
    GRANT USAGE ON *.* TO 'raven'@'%';
    GRANT ALL PRIVILEGES ON \`raven\`.* TO 'raven'@'%';
    FLUSH PRIVILEGES;" 2>/dev/null;
raven_result=$?;

echo "Resetting password for raven user..."
if mysql -h db -u root -proot_password --ssl=false -e "
  ALTER USER 'raven'@'%' IDENTIFIED BY 'raven_dev_password';
  FLUSH PRIVILEGES;
" 2>/dev/null && [ $root_result -eq 0 ] && [ $raven_result -eq 0 ]; then
    echo "Passwords reset successfully."
else
    echo "Warning: Could not reset passwords — the backup may have changed the root password."
    echo "To reset manually, run from your host machine:"
    echo "  docker exec -i \$(docker ps --filter 'name=db' --format '{{.Names}}' | head -1) \\"
    echo "    mysql -e \"ALTER USER 'root'@'%' IDENTIFIED BY 'root_password'; CREATE USER IF NOT EXISTS 'raven'@'%' IDENTIFIED BY 'raven_dev_password'; GRANT ALL PRIVILEGES ON \`raven\`.* TO 'raven'@'%'; ALTER USER 'raven'@'%' IDENTIFIED BY 'raven_dev_password'; FLUSH PRIVILEGES;\""
fi
