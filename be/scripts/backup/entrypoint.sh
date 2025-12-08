#!/usr/bin/env sh
set -eu

echo "=== db-backup: starting ==="

BACKUP_INTERVAL=${BACKUP_INTERVAL:-86400}
PGHOST=${PGHOST:-postgres}
PGPORT=${PGPORT:-5432}
POSTGRES_USER=${POSTGRES_USER:-niyati_prod}
POSTGRES_DB=${POSTGRES_DB:-niyati_prod}

# Read password from file if POSTGRES_PASSWORD_FILE is set (Docker secrets)
if [ -n "${POSTGRES_PASSWORD_FILE:-}" ]; then
  POSTGRES_PASSWORD=$(cat "$POSTGRES_PASSWORD_FILE")
fi

if [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "POSTGRES_PASSWORD or POSTGRES_PASSWORD_FILE must be set for backup to authenticate" >&2
  exit 1
fi

export PGPASSWORD="$POSTGRES_PASSWORD"

# Read AWS credentials from files if _FILE env vars are set
if [ -n "${AWS_ACCESS_KEY_ID_FILE:-}" ]; then
  AWS_ACCESS_KEY_ID=$(cat "$AWS_ACCESS_KEY_ID_FILE")
  export AWS_ACCESS_KEY_ID
fi

if [ -n "${AWS_SECRET_ACCESS_KEY_FILE:-}" ]; then
  AWS_SECRET_ACCESS_KEY=$(cat "$AWS_SECRET_ACCESS_KEY_FILE")
  export AWS_SECRET_ACCESS_KEY
fi

echo "Backup loop: dumping ${POSTGRES_DB} on ${PGHOST}:${PGPORT} every ${BACKUP_INTERVAL}s"

while true; do
  ts=$(date -u +"%Y%m%dT%H%M%SZ")
  filename="${POSTGRES_DB}-${ts}.sql.gz"
  tmpfile="/tmp/$filename"

  echo "Creating dump to $tmpfile"
  if ! pg_dump -h "$PGHOST" -p "$PGPORT" -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$tmpfile"; then
    echo "pg_dump failed" >&2
    rm -f "$tmpfile" || true
  else
    echo "Dump complete: $tmpfile"
    if [ -n "${S3_BUCKET:-}" ] && [ -n "${AWS_ACCESS_KEY_ID:-}" ] && [ -n "${AWS_SECRET_ACCESS_KEY:-}" ]; then
      s3path="s3://${S3_BUCKET}/${S3_PREFIX:-backups}/$filename"
      echo "Uploading to $s3path"
      if aws s3 cp "$tmpfile" "$s3path" --region "${AWS_REGION:-us-east-1}"; then
        echo "Uploaded $s3path"
        rm -f "$tmpfile"
      else
        echo "Upload failed; leaving dump at $tmpfile for inspection" >&2
      fi
    else
      echo "S3 credentials or bucket not provided; leaving dump at $tmpfile (not persisted)" >&2
    fi
  fi

  echo "Sleeping for ${BACKUP_INTERVAL}s"
  sleep "$BACKUP_INTERVAL"
done
