import http from 'http';

const port = process.env.PORT || 5678;

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'only POST supported' }));
  }

  let body = '';
  for await (const chunk of req) body += chunk;
  let payload = {};
  try { payload = JSON.parse(body); } catch(e) { payload = { raw: body }; }

  // Simulate a small processing delay
  await new Promise(r => setTimeout(r, 200));

  // Echo back a predictable response that the UI expects
  const userMessage = (payload.message && typeof payload.message === 'string') ? payload.message : (payload.text || 'Hello');
  const reply = `Bot reply — received: ${userMessage}`;

  const response = { output: reply, text: reply };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
});

server.listen(port, () => {
  console.log(`Mock webhook listening on http://localhost:${port}`);
});

// Graceful shutdown
process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));