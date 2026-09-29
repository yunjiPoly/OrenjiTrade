# OrenjiTrade web (Angular) — static build served by nginx on Cloud Run.
#
# The build context MUST be the repository root, because the app consumes
# packages/design-tokens and packages/api-client as npm `file:` links:
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

# Shared packages first (better layer caching; they change less often than the app).
COPY packages/design-tokens/package.json packages/design-tokens/package-lock.json ./packages/design-tokens/
WORKDIR /workspace/packages/design-tokens
RUN npm ci --no-audit --no-fund
COPY packages/design-tokens/ ./
RUN npm run build
WORKDIR /workspace

# The generated client is consumed as source; it has no runtime dependencies of its own.
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/api-client/src/ ./packages/api-client/src/

# App dependencies (file: links resolve against ../../packages/*). The postinstall script
# links the generated client's Angular/rxjs peers to this app's node_modules.
COPY apps/web-angular/package.json apps/web-angular/package-lock.json ./apps/web-angular/
COPY apps/web-angular/scripts/ ./apps/web-angular/scripts/
WORKDIR /workspace/apps/web-angular
RUN npm ci --no-audit --no-fund

# App sources and production build.
COPY apps/web-angular/ ./
RUN npx ng build --configuration production

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
