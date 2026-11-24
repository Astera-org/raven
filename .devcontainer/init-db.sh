#!/bin/bash
set -e

echo "Database initialization complete!"
echo "Database: raven"
echo "User: raven"
echo "Apply migrations from the dev container (first run on this empty database needs GENERATE_DB_FROM_SCRATCH=true):"
echo "  cd backend-ts && GENERATE_DB_FROM_SCRATCH=true MIGRATION_DATABASE_URI=\"mysql://root:root_password@db:3306/raven?charset=utf8mb4\" pnpm db:migrate"
echo "See step 5 of .devcontainer/README.md."
