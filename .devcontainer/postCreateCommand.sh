#!/usr/bin/env bash
# This command was getting unweildy so it has been moved to a script file.

# Exit if a command fails
set -e;

# We mask the node_modules directories to avoid conflicts with the host's node_modules and to ensure that the container has its own isolated environment. But these are created as `root` so we just need to change the ownership to the current user.
sudo chown $(id -u):$(id -g) /workspace/node_modules /workspace/*/node_modules;
cd /workspace;
corepack enable;
corepack install;
pnpm install;

printf '\033[1;32mDevelopment environment ready!\033[0m';
