FROM node:24-slim AS builder

RUN corepack enable

WORKDIR /build

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY eslint-config/ ./eslint-config/
COPY eslint-rules/ ./eslint-rules/
COPY core/ ./core/
COPY importers/ ./importers/
COPY backend-ts/ ./backend-ts/

RUN pnpm install --frozen-lockfile

RUN pnpm --filter "./core/**" --filter "./importers/**" --filter @raven/backend-ts build

RUN pnpm --filter @raven/backend-ts deploy --legacy --prod /deploy

# Guarantee gitignored build artifacts are present in the deploy
RUN cp -r /build/backend-ts/dist /deploy/dist
RUN cp -r /build/backend-ts/drizzle /deploy/drizzle

FROM node:24-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg rclone \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /deploy ./

COPY deploy/bin/backup_imgs_to_s3.sh deploy/bin/backup_imgs_to_s3.sh

EXPOSE 7001

# If you do not want migrations to run
# CMD ["sh", "-c", "node dist/index.js"]
CMD ["sh", "-c", "node dist/migrate.js && node dist/index.js"]
