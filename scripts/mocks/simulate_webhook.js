#!/usr/bin/env node
// scripts/mocks/simulate_webhook.js
// Small script to POST webhook events to a local server for testing.
// Usage examples:
//  node simulate_webhook.js --url http://localhost:3000/api/webhook --event dev.event --note hello --reqId 123e4567-e89b-12d3-a456-426614174000 --secret mysecret
//  node simulate_webhook.js --url http://localhost:3000/api/telemetry/log --body ./sample_event.json

const { request } = require('http');
const { request: httpsRequest } = require('https');
const { parse: parseUrl } = require('url');
const crypto = require('crypto');
const fs = require('fs');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = (i + 1) < argv.length && !argv[i+1].startsWith('--') ? argv[++i] : 'true';
    args[key] = val;
  }
  return args;
}

function buildDefaultBody(args) {
  const evt = (args.event || 'dev.event').toString();
  if (evt === 'dev.event') {
    return { event: 'dev.event', ts: new Date().toISOString(), note: args.note || 'ping' };
  }
  return { event: evt, meta: args, ts: new Date().toISOString() };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.url) {
    console.error('Missing --url. Example: --url http://localhost:3000/api/webhook');
    process.exit(2);
  }

  let bodyObj = null;
  if (args.body) {
    try {
      const raw = fs.readFileSync(args.body, 'utf8');
      bodyObj = JSON.parse(raw);
    } catch (e) {
      console.error('Failed reading body file:', e.message);
      process.exit(3);
    }
  } else {
    bodyObj = buildDefaultBody(args);
  }

  const rawBody = JSON.stringify(bodyObj);
  const parsed = parseUrl(args.url);
  const isHttps = parsed.protocol === 'https:';
  const port = parsed.port || (isHttps ? 443 : 80);
  const options = {
    hostname: parsed.hostname,
    port,
    path: parsed.path,
    method: args.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(rawBody)
    }
  };

  if (args.reqId) options.headers['x-request-id'] = args.reqId;

  if (args.secret) {
    const h = crypto.createHmac('sha256', args.secret);
    h.update(rawBody, 'utf8');
    const sig = h.digest('hex');
    options.headers['x-signature'] = sig;
  }

  console.log('POST', args.url);
  console.log('Headers:', options.headers);
  console.log('Body preview:', rawBody.slice(0, 1000));

  const reqFn = isHttps ? httpsRequest : request;
  const req = reqFn(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      console.log('Response status:', res.statusCode);
      console.log('Response headers:', res.headers);
      if (data) {
        try {
          console.log('Response body:', JSON.stringify(JSON.parse(data), null, 2));
        } catch (e) {
          console.log('Response body (raw):', data);
        }
      }
    });
  });

  req.on('error', (err) => {
    console.error('Request error:', err.message);
  });

  req.write(rawBody);
  req.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
