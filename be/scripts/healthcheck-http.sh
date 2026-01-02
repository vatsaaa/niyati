#!/bin/sh
set -eu

# healthcheck-http.sh <url> [expect]
# Returns 0 when HTTP URL responds with 2xx/3xx. If [expect] is provided,
# the response body must contain the substring (case-sensitive) for success.
URL=${1:-}
EXPECT=${2:-}
if [ -z "$URL" ]; then
  echo "healthcheck-http: no URL provided" >&2
  exit 2
fi

# Prefer curl if available
if command -v curl >/dev/null 2>&1; then
  if [ -n "$EXPECT" ]; then
    # Fetch body and check expected substring
    curl -fsS --max-time 5 "$URL" 2>/dev/null | grep -q -- "$EXPECT" || exit $?
    exit 0
  else
    curl -fsS --max-time 5 -o /dev/null "$URL" >/dev/null 2>&1 || exit $?
    exit 0
  fi
fi

# Fallback to wget if available
if command -v wget >/dev/null 2>&1; then
  if [ -n "$EXPECT" ]; then
    wget -q -O- --timeout=5 --tries=1 "$URL" 2>/dev/null | grep -q -- "$EXPECT" || exit $?
    exit 0
  else
    wget -q -O- --timeout=5 --tries=1 "$URL" >/dev/null 2>&1 || exit $?
    exit 0
  fi
fi

# Last-resort: try nc to check TCP connection (does not verify HTTP code)
HOST=$(echo "$URL" | sed -E 's#^https?://##' | sed -E 's#(/.*$)##')
PORT=80
echo "$HOST" | grep -q ':' && PORT=$(echo "$HOST" | awk -F: '{print $2}' ) && HOST=$(echo "$HOST" | awk -F: '{print $1}') || true

if command -v nc >/dev/null 2>&1; then
  nc -z -w5 "$HOST" "$PORT" || exit 1
  exit 0
fi

echo "healthcheck-http: no curl/wget/nc available" >&2
exit 3
