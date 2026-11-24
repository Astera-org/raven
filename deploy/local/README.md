# Deployment

This folder contains docker-compose setups for running all services (`docker-compose.yml`) and minimal services needed for development (`docker-compose.dev.yml`).

## Full deployment

Running `docker compose up -d --build --wait` in this folder will bring up a full Raven deployment.

- You can access the API at port 7001
- You can access the admin UI at port 3003 (served behind an nginx proxy)
- You can point a frontend deployment of The Stacks against this backend

A site admin is automatically created for this deployment with the credentials defined in `docker-compose.yml`. Using those credentials, you can log in and create a new pub. You can also log into the admin UI.

## Dev deployment

In the case of a dev deployment, it is assumed that you are running the `backend-ts` on the metal of your machine, and using the docker services for the database and S3 storage.

There is a helper script that can be used to run docker-compose commands against the right config. To bring up the dev services, in the root directory, run

```
deploy/local/docker-compose-dev.sh up
```

If you haven't already, copy the backend config template: `cp backend-ts/raven.example.toml backend-ts/raven.toml`.

To run against the dev services, in `backend-ts`, run

```
pnpm run dev
```

To shut everything down, run

```
deploy/local/docker-compose-dev.sh down
```

## Backups

You probably want a populated database to work with. For this, put a backup into the `backups` folder and connect to the database container and run the restore script.

```
deploy/local/docker-compose-dev.sh exec db-dev bash
cd /backups
./restore-from-raven-backup.sh [path to backup file]
```

To run the e2e tests, you will need to have a test user. For this, in `backend-ts`, run

```
TEST_USER_USERNAME="e2e-test-user" TEST_USER_PASSWORD="your-test-password" pnpm seed:test-user
```

## DB Migration

To run the migration, execute the following in the `backend-ts` folder

```
MIGRATION_DATABASE_URI="mysql://root:root_password@localhost:4306/raven?charset=utf8mb4" pnpm db:migrate
```
