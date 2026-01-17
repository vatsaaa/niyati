// scripts/mocks/mock-n8n.js
const http = require('http');

const server = http.createServer((req, res) => {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Collect body and validate structured metadata.user
  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', () => {
    console.log(`[Mock-n8n] Received ${req.method} request to ${req.url}`);
    let parsed = null;
    try {
      parsed = JSON.parse(body || '{}');
    } catch (e) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'invalid_json' }));
    }

    const metadata = parsed && parsed.metadata ? parsed.metadata : null;
    const user = metadata && metadata.user ? metadata.user : null;

    if (!user) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'metadata.user required' }));
    }

    const response = {
      output: "Hello! I am the CI Mock Astrologer. The stars say your tests will pass.",
      receivedMetadata: metadata
    };

    res.writeHead(200);
    res.end(JSON.stringify(response));
  });
});

server.listen(5678, () => {
  console.log('🔮 Mock n8n server running on port 5678');
});
