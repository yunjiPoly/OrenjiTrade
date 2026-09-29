#!/bin/sh
# Entrypoint of the OrenjiTrade web container.
#
#   1. /usr/share/nginx/html/config.json  <- config.template.json + environment
#   2. /etc/nginx/conf.d/default.conf     <- nginx.conf template + environment
#   3. exec nginx in the foreground on $PORT (Cloud Run sets PORT; default 8080)
# Every other variable has a safe local default; none of them is a secret.
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

# CSP source of the Firebase Auth emulator (local containers only; empty in the cloud).
if [ -n "${FIREBASE_AUTH_EMULATOR_HOST}" ]; then
  AUTH_EMULATOR_ORIGIN="http://${FIREBASE_AUTH_EMULATOR_HOST}"
else
  AUTH_EMULATOR_ORIGIN=""
fi

export PORT API_BASE_URL WS_BASE_URL FIREBASE_API_KEY FIREBASE_AUTH_DOMAIN FIREBASE_PROJECT_ID \
  FIREBASE_APP_ID FIREBASE_AUTH_EMULATOR_HOST GOOGLE_MAPS_API_KEY GOOGLE_MAPS_MAP_ID ENVIRONMENT

HTML_ROOT="/usr/share/nginx/html"

envsubst '${API_BASE_URL} ${WS_BASE_URL} ${FIREBASE_API_KEY} ${FIREBASE_AUTH_DOMAIN} ${FIREBASE_PROJECT_ID} ${FIREBASE_APP_ID} ${FIREBASE_AUTH_EMULATOR_HOST} ${GOOGLE_MAPS_API_KEY} ${GOOGLE_MAPS_MAP_ID} ${ENVIRONMENT}' \
  < "${HTML_ROOT}/config.template.json" > "${HTML_ROOT}/config.json"

# Only substitute our own variables so nginx's $uri, $host, ... survive.
envsubst '${PORT} ${API_BASE_URL} ${WS_BASE_URL} ${FIREBASE_AUTH_DOMAIN} ${AUTH_EMULATOR_ORIGIN}' \
  < /etc/nginx/orenji/default.conf.template > /etc/nginx/conf.d/default.conf

echo "[orenji-web] config.json rendered (environment=${ENVIRONMENT}, api=${API_BASE_URL}); listening on :${PORT}"

exec nginx -g 'daemon off;'
