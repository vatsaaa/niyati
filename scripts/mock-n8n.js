// scripts/mock-n8n.js
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

  // Log that we got a hit
  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', () => {
    console.log(`[Mock-n8n] Received ${req.method} request to ${req.url}`);
    const response = {
      output: "Hello! I am the CI Mock Astrologer. The stars say your tests will pass."
    };

    res.writeHead(200);
    res.end(JSON.stringify(response));
  });
});

server.listen(5678, () => {
  console.log('🔮 Mock n8n server running on port 5678');
});
