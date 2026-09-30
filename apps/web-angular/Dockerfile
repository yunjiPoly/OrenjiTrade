# OrenjiTrade web (Angular) — static build served by nginx on Cloud Run.
#
# The build context MUST be the repository root: apps/web-angular is a workspace of the root
# npm workspace (package.json + package-lock.json at the repository root) and consumes
# packages/design-tokens and packages/api-client through it:
#
#   docker build -f apps/web-angular/Dockerfile -t orenjitrade-web .
#   docker run --rm -p 8080:8080 -e API_BASE_URL=http://localhost:8081 orenjitrade-web
#
# Runtime configuration is injected at container start (see docker-entrypoint.sh):
# it renders /usr/share/nginx/html/config.json and the nginx config from env vars.

# ---------------------------------------------------------------- build stage
FROM node:24-alpine AS build
WORKDIR /workspace

ENV NG_CLI_ANALYTICS=false \
    CI=true

# Workspace manifests first (better layer caching: dependencies change less often than sources).
# `npm ci` validates the single lockfile against EVERY workspace's package.json, so the mobile
# app's manifest must be present too, even though nothing else from apps/mobile is used here.
COPY package.json package-lock.json .npmrc ./
COPY apps/web-angular/package.json ./apps/web-angular/
COPY apps/mobile/package.json ./apps/mobile/
COPY packages/design-tokens/package.json ./packages/design-tokens/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/shared-types/package.json ./packages/shared-types/
# Install only what the web build needs (the app and the two packages it consumes).
RUN npm ci --workspace apps/web-angular --workspace packages/design-tokens --workspace packages/api-client \
    --include-workspace-root=false --no-audit --no-fund

# Shared packages (consumed as TypeScript source), then the app sources.
COPY packages/design-tokens/ ./packages/design-tokens/
COPY packages/api-client/ ./packages/api-client/
COPY apps/web-angular/ ./apps/web-angular/

# Design tokens (dist/ is git-ignored) and the production build (`prebuild` rebuilds the tokens
# too; the explicit step keeps the failure obvious when tokens.json is broken).
RUN npm run build:tokens \
    && npm run build -w apps/web-angular

# -------------------------------------------------------------- runtime stage
# nginx-unprivileged runs as the unprivileged `nginx` user (UID 101): pid file in /tmp,
# cache/log directories writable, no root at runtime (CIS / Trivy DS-0002).
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

# Cloud Run injects PORT; default to 8080 for local runs. All other runtime variables
# (API_BASE_URL, WS_BASE_URL, FIREBASE_*, GOOGLE_MAPS_*, ENVIRONMENT) are optional and get
# safe local defaults inside docker-entrypoint.sh. None of them is a secret: they are the
# public web configuration that ends up in config.json.
ENV PORT=8080 \
    ENVIRONMENT=production

USER root
RUN rm -f /etc/nginx/conf.d/default.conf
COPY apps/web-angular/nginx.conf /etc/nginx/orenji/default.conf.template
COPY apps/web-angular/config.template.json /usr/share/nginx/html/config.template.json
COPY apps/web-angular/docker-entrypoint.sh /usr/local/bin/orenji-entrypoint.sh
COPY --from=build /workspace/apps/web-angular/dist/web-angular/browser/ /usr/share/nginx/html/
# The entrypoint renders config.json and the server block at start-up, so those two
# locations must be writable by the runtime user; everything else stays read-only.
RUN chmod +x /usr/local/bin/orenji-entrypoint.sh     && chown -R 101:0 /usr/share/nginx/html /etc/nginx/conf.d     && chmod -R g+w /usr/share/nginx/html /etc/nginx/conf.d
USER 101

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1 || exit 1

# Renders config.json + nginx config from the environment, then starts nginx on $PORT.
ENTRYPOINT ["/usr/local/bin/orenji-entrypoint.sh"]
