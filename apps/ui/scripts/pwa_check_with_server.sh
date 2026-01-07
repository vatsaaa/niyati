#!/bin/bash
# Run PWA Lighthouse check with automatic server management

cd "$(dirname "$0")/.." || exit 1

echo "Starting preview server..."
npm run preview > /tmp/vite-preview.log 2>&1 &
SERVER_PID=$!

# Wait for server to start with retries
echo "Waiting for server to be ready..."
MAX_RETRIES=10
RETRY_COUNT=0
SERVER_READY=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    sleep 1
    if curl -s http://localhost:4173 > /dev/null 2>&1; then
        SERVER_READY=true
        echo "✓ Server is ready"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "  Waiting... ($RETRY_COUNT/$MAX_RETRIES)"
done

if [ "$SERVER_READY" = false ]; then
    echo "❌ Server failed to start after ${MAX_RETRIES} seconds"
    echo "Server log:"
    cat /tmp/vite-preview.log
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

echo "Running Lighthouse PWA check..."
node ./scripts/lighthouse_check.js
LIGHTHOUSE_EXIT=$?

echo "Stopping preview server..."
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null

exit $LIGHTHOUSE_EXIT
