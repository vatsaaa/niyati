#!/usr/bin/env node
const { createClient } = require('redis');

const REDIS_URL = process.env.REDIS_URL || (process.env.REDIS_HOST && `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`) || 'redis://redis:6379';

async function run() {
  const client = createClient({ url: REDIS_URL, socket: { connectTimeout: 3000 } });
  client.on('error', (err) => {});
  try {
    await client.connect();
    // Use PING to verify connection
    const pong = await client.ping();
    await client.quit();
    if (pong && pong.toString().toLowerCase().includes('pong')) {
      process.exit(0);
    }
    process.exit(1);
  } catch (e) {
    try { await client.quit(); } catch (err) {}
    process.exit(1);
  }
}

run();
