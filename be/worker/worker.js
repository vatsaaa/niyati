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

const redis = createClient({ url: REDIS_URL });
redis.on('error', (err) => console.error('Redis client error', err));

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

  async function handleJob(job) {
    const { type, data, attempts = 3 } = job;
    console.log('Processing job', type, 'attempts left', attempts);
    try {
      if (type === 'email') {
        if (!transporter) {
          console.log('Email job:', data);
        } else {
          await transporter.sendMail({
            from: data.from || process.env.EMAIL_FROM,
            to: data.to,
            subject: data.subject,
            text: data.text,
            html: data.html
          });
          console.log('Email sent to', data.to);
        }
      } else if (type === 'webhook') {
        const res = await axios({ method: data.method || 'post', url: data.url, data: data.body, timeout: 10000 });
        console.log('Webhook delivered', res.status, data.url);
      } else {
        console.warn('Unknown job type:', type);
      }
      return true;
    } catch (err) {
      console.error('Job failed:', err.message || err);
      if ((attempts || 0) > 1) {
        const next = { ...job, attempts: attempts - 1 };
        // simple re-queue at the end
        await redis.lPush('job_queue', JSON.stringify(next));
        console.log('Requeued job, attempts left', next.attempts);
      } else {
        await redis.lPush('job_failed', JSON.stringify(job));
        console.log('Moved job to job_failed');
      }
      return false;
    }
  }

  // Worker loop: blocking pop (BRPOP) from job_queue with 5s timeout
  while (true) {
    try {
      const res = await redis.brPop('job_queue', 5);
      if (!res) continue; // timeout
      const [, payload] = res;
      let job;
      try { job = JSON.parse(payload); } catch (e) { console.error('Invalid job payload:', payload); continue; }
      await handleJob(job);
    } catch (err) {
      console.error('Worker loop error:', err.message || err);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

start().catch((err) => { console.error(err); process.exit(1); });
