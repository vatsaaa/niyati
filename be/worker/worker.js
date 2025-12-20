#!/usr/bin/env node
require('dotenv').config();
const { createClient } = require('redis');
const nodemailer = require('nodemailer');
const axios = require('axios');
const fs = require('fs');

// Helper to read secret from file if _FILE env var is set
function getSecret(envVar, fileEnvVar) {
  if (process.env[fileEnvVar]) {
    try {
      return fs.readFileSync(process.env[fileEnvVar], 'utf8').trim();
    } catch (e) {
      console.error(`Failed to read secret from ${process.env[fileEnvVar]}:`, e.message);
    }
  }
  return process.env[envVar];
}

const SMTP_USER = getSecret('SMTP_USER', 'SMTP_USER_FILE');
const SMTP_PASSWORD = getSecret('SMTP_PASSWORD', 'SMTP_PASSWORD_FILE');
const WORKER_TOKEN = getSecret('WORKER_TOKEN', 'WORKER_TOKEN_FILE');

const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_HOST && `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}` || 'redis://redis:6379';

const redis = createClient({ 
  url: REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error('Redis connection failed after 10 retries');
        return new Error('Redis connection failed');
      }
      // Exponential backoff: 100ms, 200ms, 400ms, etc.
      const delay = Math.min(retries * 100, 3000);
      console.log(`Redis reconnecting in ${delay}ms...`);
      return delay;
    }
  }
});
redis.on('error', (err) => console.error('Redis client error', err?.message || err));
redis.on('connect', () => console.log('Redis client connected'));
redis.on('reconnecting', () => console.log('Redis client reconnecting...'));

async function start() {
  await redis.connect();
  console.log('Worker connected to Redis at', REDIS_URL);

  // Setup transporter if SMTP configured
  let transporter = null;
  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 25),
      secure: (process.env.SMTP_SECURE === 'true'),
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined
    });
    try { await transporter.verify(); console.log('SMTP transporter ready'); } catch (e) { console.warn('SMTP verify failed:', e.message); }
  } else {
    console.log('No SMTP configured — email jobs will be logged only');
  }

  async function handleJob(job, redisClient) {
    // Input validation
    if (!job || typeof job !== 'object') {
      console.error('Invalid job: must be an object');
      return false;
    }
    if (!job.type || typeof job.type !== 'string') {
      console.error('Invalid job: missing or invalid type');
      return false;
    }
    
    const { type, data, attempts = 3 } = job;
    console.log('Processing job', type, 'attempts left', attempts);
    
    try {
      if (type === 'email') {
        // Validate email data
        if (!data || !data.to) {
          throw new Error('Email job missing required field: to');
        }
        if (typeof data.to !== 'string' || !data.to.includes('@')) {
          throw new Error('Invalid email address');
        }
        
        if (!transporter) {
          console.log('Email job (no SMTP configured):', data);
        } else {
          await transporter.sendMail({
            from: data.from || process.env.EMAIL_FROM || 'noreply@example.com',
            to: data.to,
            subject: data.subject || 'No Subject',
            text: data.text || '',
            html: data.html
          });
          console.log('Email sent to', data.to);
        }
      } else if (type === 'webhook') {
        // Validate webhook data
        if (!data || !data.url) {
          throw new Error('Webhook job missing required field: url');
        }
        if (typeof data.url !== 'string' || (!data.url.startsWith('http://') && !data.url.startsWith('https://'))) {
          throw new Error('Invalid webhook URL');
        }
        
        // Log outgoing user message payload
        try { console.log('USER', typeof data.body === 'string' ? data.body : JSON.stringify(data.body)); } catch (e) {}
        const res = await axios({ 
          method: data.method || 'post', 
          url: data.url, 
          data: data.body, 
          timeout: 10000,
          maxRedirects: 5,
          validateStatus: (status) => status < 500 // Don't throw on 4xx errors
        });
        // Log response from webhook (N8N)
        try { console.log('N8N', res && res.data ? (typeof res.data === 'string' ? res.data : JSON.stringify(res.data)) : `status:${res.status}`); } catch (e) {}
      } else {
        console.warn('Unknown job type:', type);
        // Don't retry unknown job types
        if (redisClient) await redisClient.lPush('job_failed', JSON.stringify({ ...job, error: 'unknown_job_type' }));
        return false;
      }
      return true;
    } catch (err) {
      console.error('Job failed:', err.message || err);
      if ((attempts || 0) > 1) {
        const next = { ...job, attempts: attempts - 1 };
        // simple re-queue at the end
        if (redisClient) await redisClient.lPush('job_queue', JSON.stringify(next));
        console.log('Requeued job, attempts left', next.attempts);
      } else {
        if (redisClient) await redisClient.lPush('job_failed', JSON.stringify(job));
        console.log('Moved job to job_failed');
      }
      return false;
    }
  }

  // Worker loop: blocking pop (BRPOP) from job_queue with 5s timeout
  let isShuttingDown = false;
  
  // Graceful shutdown handler
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, finishing current job and shutting down...');
    isShuttingDown = true;
  });
  
  while (!isShuttingDown) {
    try {
      const res = await redis.brPop('job_queue', 5);
      if (!res) continue; // timeout
      const [, payload] = res;
      let job;
      try { 
        job = JSON.parse(payload); 
      } catch (e) { 
        console.error('Invalid job payload:', payload.substring(0, 100)); 
        // Move to failed queue
        await redis.lPush('job_failed', JSON.stringify({ error: 'invalid_json', payload: payload.substring(0, 100) })).catch(() => {});
        continue; 
      }
      await handleJob(job, redis);
    } catch (err) {
      console.error('Worker loop error:', err.message || err);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  
  // Cleanup on shutdown
  console.log('Worker shutting down gracefully...');
  await redis.quit().catch((err) => console.error('Error closing Redis connection:', err));
  console.log('Worker stopped');
}
 
module.exports = { start, handleJob };

if (require.main === module) {
  start().catch((err) => { console.error(err); process.exit(1); });
}
