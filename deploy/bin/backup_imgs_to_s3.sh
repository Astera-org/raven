#!/bin/bash

# A script to backup the image folder (IMG_DIR) to an S3 bucket (requires rclone)

# Exit on any error
set -e

# Configuration - Number of backups to keep
NUM_BACKUPS=${NUM_BACKUPS:-10}

# Image directory to back up (matches IMG_DIR in backend-ts config).
# Resolved in priority order: raven.toml > IMG_DIR env var > default.
IMG_DIR=${IMG_DIR:-/app/imgs}
RAVEN_TOML=${RAVEN_TOML:-/app/raven.toml}
if [ -f "$RAVEN_TOML" ]; then
    _TOML_IMG_DIR=$(grep -m1 '^IMG_DIR[[:space:]]*=' "$RAVEN_TOML" | sed 's/^IMG_DIR[[:space:]]*=[[:space:]]*"\(.*\)"[[:space:]]*/\1/')
    [ -n "$_TOML_IMG_DIR" ] && IMG_DIR="$_TOML_IMG_DIR"
fi

# Check if required environment variables are set
if [ -z "$S3_ACCESS_KEY" ] || [ -z "$S3_SECRET_KEY" ] || [ -z "$S3_BUCKET" ]; then
    echo "Error: Required environment variables are not set"
    echo "Please set the following environment variables:"
    echo "  S3_ACCESS_KEY - Your S3 access key"
    echo "  S3_SECRET_KEY - Your S3 secret key"
    echo "  S3_BUCKET - Your S3 bucket name (e.g., thestacks-backup)"
    echo ""
    echo "Optional:"
    echo "  NUM_BACKUPS - Number of backups to retain (default: 10)
  IMG_DIR - Image folder to back up (default: /app/imgs)"
    echo ""
    echo "Example:"
    echo "  export S3_ACCESS_KEY='your_access_key'"
    echo "  export S3_SECRET_KEY='your_secret_key'"
    echo "  export S3_BUCKET='thestacks-backup'"
    echo "  export NUM_BACKUPS='10'"
    exit 1
fi

# Optional: Set S3 region (defaults to us-west-2)
S3_REGION=${S3_REGION:-us-west-2}

echo "Configuring rclone..."

# Create rclone config directory
mkdir -p ~/.config/rclone

# Create rclone config file
cat > ~/.config/rclone/rclone.conf << EOF
[s3remote]
type = s3
provider = AWS
access_key_id = $S3_ACCESS_KEY
secret_access_key = $S3_SECRET_KEY
region = $S3_REGION
acl = private
EOF

echo "Testing S3 connection..."
rclone lsd s3remote:$S3_BUCKET || echo "Warning: Could not list bucket contents"

echo "Starting backup of $IMG_DIR to S3..."

# Create timestamped backup folder
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
S3_PATH="s3remote:$S3_BUCKET/imgs_$TIMESTAMP"

# Copy the folder to S3 with progress
rclone copy "$IMG_DIR/" "$S3_PATH" --progress --stats 1s

echo "Backup completed successfully!"
echo "Files backed up to: $S3_PATH"

echo "Cleaning up old backups (keeping $NUM_BACKUPS most recent)..."

# List all backup directories, sort by name (which includes timestamp), and get directories to delete
BACKUP_DIRS=$(rclone lsf s3remote:$S3_BUCKET/ --dirs-only | grep "^imgs_" | sort -r)

if [ -n "$BACKUP_DIRS" ]; then
    # Count total backups
    TOTAL_BACKUPS=$(echo "$BACKUP_DIRS" | wc -l)
    echo "Found $TOTAL_BACKUPS total backups"

    if [ "$TOTAL_BACKUPS" -gt "$NUM_BACKUPS" ]; then
        # Calculate how many to delete
        DELETE_COUNT=$((TOTAL_BACKUPS - NUM_BACKUPS))
        echo "Deleting $DELETE_COUNT old backups..."

        # Get the directories to delete (oldest ones)
        DIRS_TO_DELETE=$(echo "$BACKUP_DIRS" | tail -n "$DELETE_COUNT")

        # Delete each old backup directory
        while IFS= read -r dir; do
            if [ -n "$dir" ]; then
                echo "Deleting old backup: $dir"
                rclone purge "s3remote:$S3_BUCKET/$dir"
            fi
        done <<< "$DIRS_TO_DELETE"

        echo "Cleanup completed. Kept $NUM_BACKUPS most recent backups."
    else
        echo "No cleanup needed. Total backups ($TOTAL_BACKUPS) is within limit ($NUM_BACKUPS)."
    fi
else
    echo "No existing backups found."
fi

# List remaining backups
echo "Current backups:"
rclone lsf s3remote:$S3_BUCKET/ --dirs-only | grep "^imgs_" | sort -r

# Show backup size
echo "New backup size:"
rclone size "$S3_PATH"