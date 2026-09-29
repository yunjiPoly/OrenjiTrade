#!/bin/sh
# Persist emulator accounts across restarts so local test users survive `docker compose restart`.
set -e
PROJECT="${FIREBASE_PROJECT_ID:-orenjitrade-local}"
IMPORT_ARGS=""
if [ -d /data/auth_export ]; then
  IMPORT_ARGS="--import=/data"
fi
exec firebase emulators:start --only auth --project "$PROJECT" $IMPORT_ARGS --export-on-exit=/data
