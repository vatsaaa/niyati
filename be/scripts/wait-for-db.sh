#!/bin/sh
set -eu

# wait-for-db.sh
# Waits for a TCP host:port to be available then execs the given command.
# Environment variables:
#  DB_HOST (default: postgres)
#  DB_PORT (default: 5432)
#  DB_WAIT_TIMEOUT (seconds, default: 30)

: ${DB_HOST:=postgres}
: ${DB_PORT:=5432}
: ${DB_WAIT_TIMEOUT:=30}

echo "[wait-for-db] waiting for ${DB_HOST}:${DB_PORT} (timeout=${DB_WAIT_TIMEOUT}s)"

count=0
while ! nc -z "${DB_HOST}" "${DB_PORT}" >/dev/null 2>&1; do
  count=$((count + 1))
  if [ "${count}" -ge "${DB_WAIT_TIMEOUT}" ]; then
    echo "[wait-for-db] timeout after ${DB_WAIT_TIMEOUT}s waiting for ${DB_HOST}:${DB_PORT}" >&2
    exit 1
  fi
  sleep 1
done

echo "[wait-for-db] ${DB_HOST}:${DB_PORT} is available"

# Exec the remainder (the service command)
if [ "$#" -gt 0 ]; then
  exec "$@"
else
  exec /bin/sh
fi
