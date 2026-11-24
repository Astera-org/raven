# Build from the repository root so the docs can {include} READMEs from across the repo:
#   docker build -f docs/Dockerfile -t raven-docs .
# For staging, pass the staging docs host:
#   docker build -f docs/Dockerfile --build-arg DOCS_HOST=docs.staging.thestacks.org -t raven-docs .
FROM node:24-alpine AS build
ARG DOCS_HOST=docs.thestacks.org
RUN npm install -g mystmd@1.11.0
# Python runs the {code-cell} examples in The Stacks docs. build-base is for any package without a musl wheel.
RUN apk add --no-cache python3 build-base python3-dev linux-headers \
  && python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --no-cache-dir jupyter-server ipykernel requests
ENV PATH=/opt/venv/bin:$PATH
WORKDIR /app
COPY . .
# The sites' configs and pages name the production docs host; swap in the one this image serves.
RUN grep -rlF docs.thestacks.org docs/raven docs/thestacks \
  | xargs -r sed -i "s/docs\.thestacks\.org/${DOCS_HOST}/g"
WORKDIR /app/docs/raven
RUN BASE_URL=/raven myst build --html
WORKDIR /app/docs/thestacks
RUN BASE_URL=/thestacks myst build --html --execute

FROM nginx:1.31-alpine
COPY docs/nginx.conf /etc/nginx/conf.d/default.conf
COPY docs/404.html /usr/share/nginx/html/404.html
COPY docs/brand-guidelines/assets/stacks-logo.svg docs/brand-guidelines/assets/stacks-favicon.svg /usr/share/nginx/html/assets/
COPY --from=build /app/docs/raven/_build/html /usr/share/nginx/html/raven
COPY --from=build /app/docs/thestacks/_build/html /usr/share/nginx/html/thestacks
EXPOSE 80
