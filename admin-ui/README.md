# The Stacks Admin UI

Admin interface for The Stacks platform (Astera Institute), built with React Router v7 and Tailwind CSS v4.

## Production deployment

To deploy to production, you can use the provided Dockerfile. Additionally, you will need to configure routing in your environments so that requests to `https://[admin-ui-domain]/api` get routed to the appropriate backend.

See the documentation for your infrastructure on how to do this. Alternatively, you can deploy the app with docker-compose and use an nginx-proxy, similar to how the local docker-based deployment works.

## Local docker-based deployment

To deploy the admin UI locally, bring up the docker-compose set up described in the `Full deployment` section of `deploy/local/README.md`.

## Dev deployment

If you want to develop locally, you first need to bring up the development infrastructure following the `Dev deployment` section of `deploy/local/README.md`.

### 1. Configure the backend

Copy `backend-ts/raven.example.toml` to `backend-ts/raven.toml`. In `raven.toml` set the following values:

```
BASE_URL_ADMIN = "http://localhost:3003"
BASE_URL_API = "http://localhost:7001/api"
```

### 2. Start the backend

```bash
cd backend-ts
pnpm dev
```

The API will be available at `http://localhost:7001`.

### 3. Start the admin UI (Mac)

```bash
cd admin-ui
pnpm dev
```

Open `http://localhost:3003` in your browser.
