# Raven Development Container

This directory contains the configuration for developing Raven in a VS Code Dev Container. The dev container provides a complete, reproducible development environment with all dependencies pre-configured.

## What's Included

- **Node.js 24** with pnpm (via corepack)
- **MySQL 8.0** database server
- **Garage** S3-compatible object storage, standing in for AWS S3 in local dev
- **FFmpeg** (`ffprobe`) for media probing
- **Pre-configured VS Code extensions**:
  - Prettier
  - ESLint
  - Docker tools
  - SQLTools with MySQL driver

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop)
- [Visual Studio Code](https://code.visualstudio.com/)
- [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

## Getting Started

1. **Open the project in VS Code**

   ```bash
   code /path/to/raven
   ```

2. **Reopen in Container**
   - Press `F1` or `Cmd+Shift+P` (Mac) / `Ctrl+Shift+P` (Windows/Linux)
   - Type "Dev Containers: Reopen in Container"
   - Select it and wait for the container to build and start

3. **Wait for initialization**
   - The first time will take a few minutes to build the Docker images
   - Dependencies will be installed automatically via the `postCreateCommand`

4. **Copy the Raven configuration file**

   ```bash
   cp .devcontainer/raven.example.toml .devcontainer/raven.toml
   ```

   - Edit `.devcontainer/raven.toml` as needed for your development environment
   - Media upload (e.g. Google Docs/Drive images) works out of the box against the bundled Garage
     instance, so no AWS account is needed. To use real AWS S3 instead, set real `AWS_*` credentials
     and clear `AWS_S3_ENDPOINT`, `AWS_S3_PUBLIC_ENDPOINT` and `AWS_S3_PUBLIC_BASE_URL`

5. (In Dev Container) **Run the Hono backend**

   ```bash
   cd backend-ts
   # Make sure the DB is up-to-date
   MIGRATION_DATABASE_URI="mysql://root:root_password@db:3306/raven?charset=utf8mb4" pnpm db:migrate
   RAVEN_CONFIG="../.devcontainer/raven.toml" pnpm dev
   ```

   On a brand-new (empty) database, the first migration run must also create the baseline schema,
   so add `GENERATE_DB_FROM_SCRATCH=true`:

   ```bash
   GENERATE_DB_FROM_SCRATCH=true MIGRATION_DATABASE_URI="mysql://root:root_password@db:3306/raven?charset=utf8mb4" pnpm db:migrate
   ```

   Only use it on an empty database; on one that already has the schema it would try to recreate
   existing tables. Postgres (pg-boss) migrations run in the same command, using the
   `PG_DATABASE_URI` the dev container already sets.

   After migrating a new database, create a site admin user and a default organization to host
   publications, using the same credentials as `deploy/local`:

   ```bash
   RAVEN_CONFIG="../.devcontainer/raven.toml" ADMIN_USERNAME=admin ADMIN_EMAIL=admin@raven.local \
     ADMIN_PASSWORD=admin_dev_password ADMIN_ORG_NAME="Default Organization" pnpm seed:admin
   ```

   The script skips anything that already exists, so it is safe to rerun.

   To run a command in the Dev Container, you can open the Terminal in VSCode (⌘+J). If there's no command line, click on the terminal icon labeled `Dev Containers` at the top right, and select `Split Terminal`.

6. **Access the application (from the host machine)**
   - Backend API: http://localhost:7001
   - MySQL is available on `localhost:3306`
   - Garage's S3 API is at http://localhost:3920, and uploaded media is served publicly from
     http://raven-dev-media.web.localhost:3922. Garage has no web console; to browse the bucket,
     run `aws s3 ls s3://raven-dev-media --recursive --endpoint-url http://localhost:3920 --region us-west-2`
     with the credentials from `raven.toml`
   - These ports are shifted from Garage's default 3900/3902 so the dev container doesn't clash
     with `deploy/local`'s Garage if both are running at once

## Database Access

### Using SQLTools (VS Code Extension)

The dev container includes a pre-configured MySQL connection:

- Name: Raven MySQL
- Host: db

(See below for the credentials.)

Access it via the SQLTools icon in the VS Code sidebar.

### Using MySQL CLI

```bash
mysql -h db -u raven -praven_dev_password raven --ssl=false
```

### Database Credentials

- **Host**: `db` (from within the container) or `localhost` (from your host machine)
- **Port**: 3306
- **Database**: raven
- **User**: raven
- **Password**: raven_dev_password
- **Root Password**: root_password

## Restoring from a Database Backup

We have scripts to help restore the database from SQL dump files. If your database dump contains multiple databases (e.g., `mysql`, `information_schema`), use the `.devcontainer/bin/backup-all-to-raven.sh` script to extract only the Raven database.

1. Copy the SQL dump file into the devcontainer (e.g., `/workspace/backup-raven.sql`).
2. Run the restore script:
   ```bash
   cd .devcontainer
   ./bin/restore-from-raven-backup.sh /workspace/backup-raven.sql
   ```

## Development Workflow

### Resetting the Database

If you need to reset the database to a clean state, stop the devcontainer, delete the database volume, and then restart the devcontainer.

## Ports

The following ports are forwarded to your host machine:

- **7001**: Hono (TypeScript) backend
- **3306**: MySQL database
- **3920 / 3922**: Garage S3 API / public media (shifted from the default 3900/3902 to avoid
  clashing with `deploy/local`'s Garage)

## Environment Variables

The dev container sets these environment variables automatically:

- `DATABASE_HOST=db`
- `DATABASE_PORT=3306`
- `DATABASE_NAME=raven`
- `DATABASE_USER=raven`
- `DATABASE_PASSWORD=raven_dev_password`

Additional configuration is read from `.devcontainer/raven.toml` (copied from `raven.example.toml`), passed to the backend via `RAVEN_CONFIG` — see
[Getting Started](#getting-started) step 4.

## Customization

### VS Code Settings

VS Code settings are configured in [devcontainer.json](devcontainer.json). You can modify:

- Linting rules
- Formatting options
- Additional extensions

### Docker Configuration

- **Dockerfile**: Defines the development container image
- **docker-compose.yml**: Orchestrates the app and database services

### Database Initialization

- **init-db.sh**: Post-initialization script

## Troubleshooting

### Container won't start

- Ensure Docker Desktop is running
- Check that ports 7001 and 3306 aren't already in use
- Try rebuilding: `Dev Containers: Rebuild Container`

### Database connection errors

- Verify the database service is healthy: `docker compose ps`
- Check logs: `docker compose logs db`
- Ensure you're using the hostname `db` (not `localhost`) when connecting from within the container
- `ERROR 2026 (HY000): TLS/SSL error: self-signed certificate in certificate chain` from the
  `mysql` CLI: the container's MariaDB client verifies the server certificate by default, and the
  MySQL container's certificate is self-signed. Add `--skip-ssl` to the command.

### Migration fails with `Table 'raven.comments' doesn't exist`

`pnpm db:migrate` was run against an empty database without `GENERATE_DB_FROM_SCRATCH=true`, so
the baseline migration was marked as applied without running. Recreate the database and rerun the
migration with the flag (see [Getting Started](#getting-started) step 5):

```bash
mysql -h db -uroot -proot_password --skip-ssl -e "DROP DATABASE raven; CREATE DATABASE raven;"
```

## File Structure

```
.devcontainer/
├── devcontainer.json    # Dev container configuration
├── docker-compose.yml   # Multi-container orchestration
├── Dockerfile           # Development container image
├── init-db.sh           # Database initialization script
├── raven.toml           # Local backend configuration (copy raven.example.toml and modify)
└── README.md            # This file
```

## Additional Resources

- [VS Code Dev Containers Documentation](https://code.visualstudio.com/docs/devcontainers/containers)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [MySQL Documentation](https://dev.mysql.com/doc/)
