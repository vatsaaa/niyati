#!/usr/bin/env sh
set -eu

echo "=== migration runner: starting ==="

# Allow caller to override DB host/port via env; default to compose service name 'postgres'
: ${PGHOST:=postgres}
: ${PGPORT:=5432}

echo "Waiting for Postgres at ${PGHOST}:${PGPORT}..."
retry=0
until pg_isready -h "${PGHOST}" -p "${PGPORT}" >/dev/null 2>&1; do
  retry=$((retry+1))
  if [ "$retry" -ge 60 ]; then
    echo "Postgres did not become ready after $retry seconds" >&2
    exit 1
  fi
  sleep 1
done

# Build connection string if DATABASE_URL is not provided
if [ -n "${DATABASE_URL:-}" ]; then
  CONN="$DATABASE_URL"
else
  # Read password from file if POSTGRES_PASSWORD_FILE is set (Docker secrets)
  if [ -n "${POSTGRES_PASSWORD_FILE:-}" ]; then
    POSTGRES_PASSWORD=$(cat "$POSTGRES_PASSWORD_FILE")
  fi
  
  if [ -z "${POSTGRES_PASSWORD:-}" ]; then
    echo "POSTGRES_PASSWORD or POSTGRES_PASSWORD_FILE must be set to run migrations" >&2
    exit 1
  fi
  POSTGRES_USER=${POSTGRES_USER:-niyati_prod}
  POSTGRES_DB=${POSTGRES_DB:-niyati_prod}
  CONN="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${PGHOST}:${PGPORT}/${POSTGRES_DB}"
fi

echo "Using connection: ${CONN} (password hidden)"

MIG_DIR="/migrations"
if [ ! -d "$MIG_DIR" ]; then
  echo "Migrations directory $MIG_DIR not present; nothing to do." && exit 0
fi

# Create migrations tracking table if it doesn't exist
psql "$CONN" -v ON_ERROR_STOP=1 <<'EOF'
CREATE TABLE IF NOT EXISTS migrations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
EOF

applied=0
skipped=0
for f in "$MIG_DIR"/*.up.sql; do
  if [ ! -e "$f" ]; then
    break
  fi
  
  # Extract just the filename from the path
  fname=$(basename "$f")
  
  # Check if migration was already applied
  already_applied=$(psql "$CONN" -tAc "SELECT 1 FROM migrations WHERE name = '$fname' LIMIT 1")
  
  if [ "$already_applied" = "1" ]; then
    echo "Skipping (already applied): $fname"
    skipped=$((skipped+1))
    continue
  fi
  
  echo "Applying migration: $fname"
  psql "$CONN" -v ON_ERROR_STOP=1 -f "$f"
  
  # Record migration as applied
  psql "$CONN" -v ON_ERROR_STOP=1 -c "INSERT INTO migrations (name) VALUES ('$fname')"
  applied=$((applied+1))
done

if [ "$applied" -eq 0 ] && [ "$skipped" -eq 0 ]; then
  echo "No .up.sql migration files found in $MIG_DIR"
else
  echo "Applied $applied migration(s), skipped $skipped already-applied"  
fi

echo "=== migration runner: finished ==="
