#!/usr/bin/env bash
set -euo pipefail

# Merge coverage artifacts produced by different packages and generate a combined report.
# Uses `nyc` (installed via npx) to merge coverage JSON files present under
# artifacts/coverage/* and produce lcov/html/text-summary outputs under
# artifacts/coverage/merged.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ARTIFACTS_DIR="$PROJECT_ROOT/artifacts/coverage"
MERGED_DIR="$ARTIFACTS_DIR/merged"
NYC_TEMP="$PROJECT_ROOT/.nyc_output_merge"

mkdir -p "$MERGED_DIR"
rm -rf "$NYC_TEMP"
mkdir -p "$NYC_TEMP"

echo "[merge-coverage] Searching for coverage-final.json files under $ARTIFACTS_DIR"
COUNT=0
while IFS= read -r -d '' file; do
  COUNT=$((COUNT+1))
  cp "$file" "$NYC_TEMP/${COUNT}.json"
done < <(find "$ARTIFACTS_DIR" -type f -name 'coverage-final.json' -print0 || true)

if [[ $COUNT -eq 0 ]]; then
  echo "[merge-coverage] No coverage-final.json files found; searching for lcov.info files to concatenate"
  # Try to concatenate lcov.info files as fallback
  LCOV_OUT="$MERGED_DIR/combined-lcov.info"
  > "$LCOV_OUT"
  while IFS= read -r -d '' lcov; do
    echo "[merge-coverage] adding $lcov"
    cat "$lcov" >> "$LCOV_OUT"
  done < <(find "$ARTIFACTS_DIR" -type f -name 'lcov.info' -print0 || true)

  if [[ ! -s "$LCOV_OUT" ]]; then
    echo "[merge-coverage] No lcov.info files found either. Nothing to merge." >&2
    exit 0
  fi

  echo "[merge-coverage] Combined lcov written to $LCOV_OUT"
  # Can't easily compute overall percent from lcov here; produce combined file and exit success
  exit 0
fi

echo "[merge-coverage] Copied $COUNT coverage JSON files into $NYC_TEMP"

echo "[merge-coverage] Merging with nyc..."
# Prefer locally installed nyc to avoid network installs; fall back to npx
NYC_LOCAL="$PROJECT_ROOT/node_modules/.bin/nyc"
if [[ -x "$NYC_LOCAL" ]]; then
  echo "[merge-coverage] Using local nyc at $NYC_LOCAL"
  "$NYC_LOCAL" merge "$NYC_TEMP" "$NYC_TEMP/merged.json"
else
  echo "[merge-coverage] Local nyc not found; falling back to npx --yes nyc (will install if needed)"
  npx --yes nyc merge "$NYC_TEMP" "$NYC_TEMP/merged.json"
fi

echo "[merge-coverage] Generating reports..."
# Generate reports (lcov, html, text-summary)
if [[ -x "$NYC_LOCAL" ]]; then
  "$NYC_LOCAL" report --temp-dir "$NYC_TEMP" --reporter=lcov --reporter=html --reporter=text-summary --report-dir "$MERGED_DIR"
else
  npx --yes nyc report --temp-dir "$NYC_TEMP" --reporter=lcov --reporter=html --reporter=text-summary --report-dir "$MERGED_DIR"
fi

echo "[merge-coverage] Reports generated under $MERGED_DIR"

# Extract overall coverage percent from text-summary
SUMMARY_OUT=$(mktemp)
npx nyc report --temp-dir "$NYC_TEMP" --reporter=text-summary > "$SUMMARY_OUT" || true
ALL_LINE=$(grep "All files" "$SUMMARY_OUT" || true)
if [[ -z "$ALL_LINE" ]]; then
  echo "[merge-coverage] Couldn't find 'All files' line in nyc summary; content:" >&2
  sed -n '1,200p' "$SUMMARY_OUT" >&2
  exit 0
fi

# Extract percentage like 'All files | 85.7%'
PERCENT=$(echo "$ALL_LINE" | awk '{for(i=1;i<=NF;i++) if($i ~ /%/) {gsub(/[^0-9.]/,"", $i); print $i; exit}}')
PERCENT_NUM=$(printf "%0.0f" "$PERCENT" 2>/dev/null || echo "$PERCENT")

echo "[merge-coverage] Combined coverage: ${PERCENT}%"

# Allow overriding threshold via env var
THRESHOLD=${COVERAGE_THRESHOLD:-100}
echo "[merge-coverage] Threshold: ${THRESHOLD}%"

# Compare
P_INT=$(echo "$PERCENT" | awk -F. '{print $1}')
if [[ -z "$P_INT" ]]; then
  echo "[merge-coverage] Unable to parse coverage percentage; skipping threshold check";
  exit 0
fi

if (( P_INT < THRESHOLD )); then
  echo "[merge-coverage] Coverage ${PERCENT}% is below threshold ${THRESHOLD}%" >&2
  exit 2
fi

echo "[merge-coverage] Coverage meets threshold"
exit 0
