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
RUN cd packages/design-tokens && npm ci --no-audit --no-fund
COPY packages/design-tokens/ ./packages/design-tokens/
RUN cd packages/design-tokens && npm run build

# The generated client is consumed as source; it has no runtime dependencies of its own.
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/api-client/src/ ./packages/api-client/src/

# App dependencies (file: links resolve against ../../packages/*).
COPY apps/web-angular/package.json apps/web-angular/package-lock.json ./apps/web-angular/
RUN cd apps/web-angular && npm ci --no-audit --no-fund --ignore-scripts

# App sources and production build.
COPY apps/web-angular/ ./apps/web-angular/
RUN cd apps/web-angular && npx ng build --configuration production

# -------------------------------------------------------------- runtime stage
FROM nginx:1.27-alpine AS runtime

# Cloud Run injects PORT; default to 8080 for local runs.
ENV PORT=8080 \
    API_BASE_URL=http://localhost:8080 \
    WS_BASE_URL=ws://localhost:8080/ws \
    FIREBASE_API_KEY= \
    FIREBASE_AUTH_DOMAIN=orenjitrade-local.firebaseapp.com \
    FIREBASE_PROJECT_ID=orenjitrade-local \
    FIREBASE_APP_ID= \
    FIREBASE_AUTH_EMULATOR_HOST= \
    GOOGLE_MAPS_API_KEY= \
    GOOGLE_MAPS_MAP_ID= \
    ENVIRONMENT=production

RUN rm -f /etc/nginx/conf.d/default.conf
COPY apps/web-angular/nginx.conf /etc/nginx/templates/default.conf.template
COPY apps/web-angular/config.template.json /usr/share/nginx/html/config.template.json
COPY apps/web-angular/docker-entrypoint.sh /docker-entrypoint.d/40-orenji-config.sh
RUN chmod +x /docker-entrypoint.d/40-orenji-config.sh

COPY --from=build /workspace/apps/web-angular/dist/web-angular/browser/ /usr/share/nginx/html/

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1 || exit 1

# The nginx image's own entrypoint runs /docker-entrypoint.d/*.sh (our config renderer)
# and then starts nginx in the foreground.
CMD ["nginx", "-g", "daemon off;"]
