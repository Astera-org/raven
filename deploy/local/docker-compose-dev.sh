#!/bin/bash

# Runs docker compose against docker-compose.dev.yml regardless of the
# working directory the script is invoked from.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$1" = "up" ]; then
    shift
    docker compose -f "$SCRIPT_DIR/docker-compose.dev.yml" up -d --build --wait "$@"
    exec docker compose -f "$SCRIPT_DIR/docker-compose.dev.yml" run --rm garage-init
fi

exec docker compose -f "$SCRIPT_DIR/docker-compose.dev.yml" "$@"
