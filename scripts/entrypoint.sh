#!/bin/sh
set -eu

# entrypoint.sh
# Runs `wait-for-db.sh` only when WAIT_FOR_DB is enabled, then execs the service CMD.

WAIT_FLAG="${WAIT_FOR_DB:-}"
if [ "$WAIT_FLAG" = "1" ] || [ "$WAIT_FLAG" = "true" ]; then
  echo "[entrypoint] WAIT_FOR_DB enabled — waiting for ${DB_HOST:-postgres}:${DB_PORT:-5432}"
  /usr/local/bin/wait-for-db.sh
else
  echo "[entrypoint] WAIT_FOR_DB not set — skipping DB wait"
fi

exec "$@"
