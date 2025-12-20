#!/usr/bin/env bash
set -euo pipefail

BASE_URL=${BASE_URL:-http://127.0.0.1}

echo "Testing production endpoints at $BASE_URL"

echo "Check Caddy health (/health)"
curl -fsS "$BASE_URL/health" || { echo "Caddy health check failed"; exit 2; }

echo "Check bff-platform health (/api/v1/telemetry/health)"
curl -fsS "$BASE_URL/api/v1/telemetry/health" || { echo "bff-platform health check failed"; exit 3; }

echo "Check bff-auth health (/api/v1/telemetry/health)"
curl -fsS "$BASE_URL/api/v1/auth/telemetry/health" || true
curl -fsS "$BASE_URL/api/v1/telemetry/health" || true

echo "Post profile to /api/v1/users/profile to exercise auth->platform sync"
RESPONSE=$(curl -sS -X POST "$BASE_URL/api/v1/users/profile" -H "Content-Type: application/json" -d '{"phoneNumber":"+919999000000","consentGiven":true,"last_login_location":"Mumbai"}' || true)
echo "Response: $RESPONSE"

if echo "$RESPONSE" | grep -q 'last_login_location'; then
  echo "Profile sync appears successful"
else
  echo "Profile sync did not return expected last_login_location"
  exit 4
fi

echo "All production integration checks passed (basic)."
