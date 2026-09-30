#!/bin/sh
# Persist emulator accounts across restarts so local test users survive `docker compose restart`.
# Export/import go through a subdirectory of the /data volume: firebase-tools deletes and
# recreates the export directory on every export, which is impossible for the volume mount
# point itself (EBUSY as root, EACCES as an unprivileged user).
set -e
PROJECT="${FIREBASE_PROJECT_ID:-orenjitrade-local}"
EXPORT_DIR="${FIREBASE_EXPORT_DIR:-/data/export}"
if [ ! -w "$(dirname "$EXPORT_DIR")" ]; then
  echo "WARN: $(dirname "$EXPORT_DIR") is not writable by $(id -un); accounts will not persist across restarts." >&2
  echo "WARN: the volume was created by an older root-based image; recreate it once with 'docker compose down -v'." >&2
fi
IMPORT_ARGS=""
if [ -d "$EXPORT_DIR/auth_export" ]; then
  IMPORT_ARGS="--import=$EXPORT_DIR"
fi
exec firebase emulators:start --only auth --project "$PROJECT" $IMPORT_ARGS --export-on-exit="$EXPORT_DIR"
