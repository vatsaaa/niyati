#!/usr/bin/env bash
set -euo pipefail

# Precompress static assets and upload to S3 with appropriate metadata
# Usage: ./precompress-and-upload.sh <bucket> [dist_dir]
# Requires: aws CLI v2 configured (role via OIDC in CI) and gzip/pigz installed

BUCKET="$1"
DIST_DIR="${2:-dist}"
REGION="${AWS_REGION:-ap-south-1}"

if [ -z "$BUCKET" ]; then
  echo "Usage: $0 <s3-bucket> [dist_dir]"
  exit 2
fi

if [ ! -d "$DIST_DIR" ]; then
  echo "Dist directory '$DIST_DIR' not found"
  exit 2
fi

# Helper: determine content-type by extension
content_type() {
  case "$1" in
    *.html) echo "text/html" ;;
    *.js) echo "application/javascript" ;;
    *.css) echo "text/css" ;;
    *.json) echo "application/json" ;;
    *.svg) echo "image/svg+xml" ;;
    *.png) echo "image/png" ;;
    *.jpg|*.jpeg) echo "image/jpeg" ;;
    *.ico) echo "image/x-icon" ;;
    *.txt) echo "text/plain" ;;
    *.xml) echo "application/xml" ;;
    *) echo "application/octet-stream" ;;
  esac
}

echo "Precompressing and uploading contents of $DIST_DIR -> s3://$BUCKET/"

# Find files to upload (exclude source maps)
find "$DIST_DIR" -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.json' -o -name '*.svg' -o -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' -o -name '*.ico' \) | while read -r file; do
  relpath="${file#$DIST_DIR/}"
  mime=$(content_type "$file")

  # Upload original file with sensible caching
  cache_control="public, max-age=0, s-maxage=60"
  if [[ "$relpath" =~ ^assets/ ]]; then
    cache_control="public, max-age=31536000, immutable"
  fi

  echo "Uploading $relpath (type=$mime)"
  aws s3 cp "$file" "s3://$BUCKET/$relpath" \
    --acl public-read --region "$REGION" \
    --content-type "$mime" \
    --cache-control "$cache_control"

  # Create gzipped copy and upload with Content-Encoding:gzip so CloudFront can serve it
  gzfile="${file}.gz"
  if command -v pigz >/dev/null 2>&1; then
    pigz -k -f -9 -p 2 -c "$file" > "$gzfile"
  else
    gzip -c -9 "$file" > "$gzfile"
  fi

  echo "Uploading gzip $relpath.gz"
  aws s3 cp "$gzfile" "s3://$BUCKET/$relpath" \
    --acl public-read --region "$REGION" \
    --content-type "$mime" \
    --content-encoding gzip \
    --cache-control "$cache_control"

  rm -f "$gzfile"
done

# Optionally upload root files like index.html with short caching
if [ -f "$DIST_DIR/index.html" ]; then
  echo "Ensuring index.html cache-control"
  aws s3 cp "$DIST_DIR/index.html" "s3://$BUCKET/index.html" \
    --acl public-read --region "$REGION" \
    --content-type "text/html" \
    --cache-control "public, max-age=0, s-maxage=60"
fi

echo "Upload complete."
