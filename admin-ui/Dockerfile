FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @raven/admin-ui build

FROM node:24-alpine
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY admin-ui/package.json ./admin-ui/
COPY backend-ts/package.json ./backend-ts/
COPY eslint-config/package.json ./eslint-config/
COPY snapshot-tests/package.json ./snapshot-tests/
COPY tests/package.json ./tests/
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/admin-ui/build ./admin-ui/build
WORKDIR /app/admin-ui
CMD ["sh", "-c", "node_modules/.bin/serve -s build/client -l ${PORT:-3000}"]
