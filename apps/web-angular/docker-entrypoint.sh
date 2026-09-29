#!/bin/sh
# Renders runtime configuration for the OrenjiTrade web container.
#
# Executed by the nginx image entrypoint (/docker-entrypoint.d/) before nginx starts:
#   1. /usr/share/nginx/html/config.json  <- config.template.json + environment
#   2. /etc/nginx/conf.d/default.conf     <- nginx.conf template + environment
# Cloud Run sets PORT; everything else has a safe local default.
set -eu

: "${PORT:=8080}"
: "${API_BASE_URL:=http://localhost:8080}"
: "${WS_BASE_URL:=ws://localhost:8080/ws}"
: "${FIREBASE_API_KEY:=}"
: "${FIREBASE_AUTH_DOMAIN:=orenjitrade-local.firebaseapp.com}"
: "${FIREBASE_PROJECT_ID:=orenjitrade-local}"
: "${FIREBASE_APP_ID:=}"
: "${FIREBASE_AUTH_EMULATOR_HOST:=}"
: "${GOOGLE_MAPS_API_KEY:=}"
: "${GOOGLE_MAPS_MAP_ID:=}"
: "${ENVIRONMENT:=production}"

# Strip a trailing slash so the CSP source and URL prefixing stay consistent.
API_BASE_URL="${API_BASE_URL%/}"

export PORT API_BASE_URL WS_BASE_URL FIREBASE_API_KEY FIREBASE_AUTH_DOMAIN FIREBASE_PROJECT_ID \
  FIREBASE_APP_ID FIREBASE_AUTH_EMULATOR_HOST GOOGLE_MAPS_API_KEY GOOGLE_MAPS_MAP_ID ENVIRONMENT

HTML_ROOT="/usr/share/nginx/html"

envsubst '${API_BASE_URL} ${WS_BASE_URL} ${FIREBASE_API_KEY} ${FIREBASE_AUTH_DOMAIN} ${FIREBASE_PROJECT_ID} ${FIREBASE_APP_ID} ${FIREBASE_AUTH_EMULATOR_HOST} ${GOOGLE_MAPS_API_KEY} ${GOOGLE_MAPS_MAP_ID} ${ENVIRONMENT}' \
  < "${HTML_ROOT}/config.template.json" > "${HTML_ROOT}/config.json"

# Only substitute our own variables so nginx's $uri, $host, ... survive.
envsubst '${PORT} ${API_BASE_URL} ${WS_BASE_URL} ${FIREBASE_AUTH_DOMAIN}' \
  < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

echo "[orenji-web] config.json rendered (environment=${ENVIRONMENT}, api=${API_BASE_URL}); listening on :${PORT}"
