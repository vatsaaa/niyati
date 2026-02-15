#!/usr/bin/env node
require('dotenv').config();
const { createClient } = require('redis');
const nodemailer = require('nodemailer');
const axios = require('axios');
const fs = require('fs');
const { logger } = require('@niyati/commons/lib/logger');
const { validateEnv } = require('@niyati/commons/lib/validateEnv');

// Validate environment early
try {
  validateEnv({ service: 'worker' });
} catch (e) {
  logger.error({ msg: 'Worker environment validation failed', err: e.message });
  process.exit(1);
}

// Helper to read secret from file if _FILE env var is set
function getSecret(envVar, fileEnvVar) {
  if (process.env[fileEnvVar]) {
    try {
      return fs.readFileSync(process.env[fileEnvVar], 'utf8').trim();
    } catch (e) {
      logger.error({ msg: `Failed to read secret from ${process.env[fileEnvVar]}`, err: e.message });
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
        logger.error({ msg: 'Redis connection failed after 10 retries' });
        return new Error('Redis connection failed');
      }
      // Exponential backoff: 100ms, 200ms, 400ms, etc.
      const delay = Math.min(retries * 100, 3000);
      logger.info({ msg: `Redis reconnecting in ${delay}ms` });
      return delay;
    }
  }
});
redis.on('error', (err) => logger.error({ msg: 'Redis client error', err: err?.message || err }));
redis.on('connect', () => logger.info({ msg: 'Redis client connected' }));
redis.on('reconnecting', () => logger.info({ msg: 'Redis client reconnecting' }));

async function start() {
  await redis.connect();
  logger.info({ msg: 'Worker connected to Redis', redisUrl: REDIS_URL });

  // Setup transporter if SMTP configured
  let transporter = null;
  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 25),
      secure: (process.env.SMTP_SECURE === 'true'),
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined
    });
    try { await transporter.verify(); logger.info({ msg: 'SMTP transporter ready' }); } catch (e) { logger.warn({ msg: 'SMTP verify failed', err: e.message }); }
  } else {
    logger.info({ msg: 'No SMTP configured — email jobs will be logged only' });
  }

  async function handleJob(job, redisClient) {
    // Input validation
    if (!job || typeof job !== 'object') {
      logger.error({ msg: 'Invalid job: must be an object' });
      return false;
    }
    if (!job.type || typeof job.type !== 'string') {
      logger.error({ msg: 'Invalid job: missing or invalid type' });
      return false;
    }

    const { type, data, attempts = 3 } = job;
    logger.info({ msg: 'Processing job', type, attemptsLeft: attempts });

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
          logger.info({ msg: 'Email job (no SMTP configured)', data });
        } else {
          await transporter.sendMail({
            from: data.from || process.env.EMAIL_FROM || 'noreply@example.com',
            to: data.to,
            subject: data.subject || 'No Subject',
            text: data.text || '',
            html: data.html
          });
          logger.info({ msg: 'Email sent', to: data.to });
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
        try { logger.debug({ msg: 'USER', body: typeof data.body === 'string' ? data.body : JSON.stringify(data.body) }); } catch (e) { }
        const res = await axios({
          method: data.method || 'post',
          url: data.url,
          data: data.body,
          timeout: 10000,
          maxRedirects: 5,
          validateStatus: (status) => status < 500 // Don't throw on 4xx errors
        });
        // Log response from webhook (N8N)
        try { logger.debug({ msg: 'N8N', response: res && res.data ? (typeof res.data === 'string' ? res.data : JSON.stringify(res.data)) : `status:${res.status}` }); } catch (e) { }
      } else if (type === 'credit_expiration') {
        // Expire paid credits that have passed their credit_expires_at date
        // Resets credits to the monthly free allowance for expired accounts
        const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/niyati';
        const { Client } = require('pg');
        const dbClient = new Client({ connectionString: dbUrl });
        try {
          await dbClient.connect();
          const expireResult = await dbClient.query(`
            UPDATE user_credits
            SET credits = LEAST(credits, 10),
                credit_expires_at = NULL,
                is_paid = FALSE,
                updated_at = now()
            WHERE credit_expires_at IS NOT NULL
              AND credit_expires_at < now()
            RETURNING user_id, credits
          `);
          const count = expireResult.rowCount || 0;
          logger.info({ msg: 'credit_expiration_completed', expiredCount: count });
        } finally {
          await dbClient.end().catch(() => {});
        }
      } else if (type === 'monthly_credit_reset') {
        // Reset free credits for all non-paid users whose last reset was in a previous month
        const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/niyati';
        const { Client } = require('pg');
        const dbClient = new Client({ connectionString: dbUrl });
        try {
          await dbClient.connect();
          const resetResult = await dbClient.query(`
            UPDATE user_credits
            SET credits = GREATEST(credits, 10),
                credits_last_reset = now(),
                updated_at = now()
            WHERE is_paid = FALSE
              AND (credits_last_reset IS NULL
                   OR date_trunc('month', credits_last_reset) < date_trunc('month', now()))
            RETURNING user_id, credits
          `);
          const count = resetResult.rowCount || 0;
          logger.info({ msg: 'monthly_credit_reset_completed', resetCount: count });
        } finally {
          await dbClient.end().catch(() => {});
        }
      } else {
        logger.warn({ msg: 'Unknown job type', type });
        // Don't retry unknown job types
        if (redisClient) await redisClient.lPush('job_failed', JSON.stringify({ ...job, error: 'unknown_job_type' }));
        return false;
      }
      return true;
    } catch (err) {
      logger.error({ msg: 'Job failed', err: err.message || err });
      if ((attempts || 0) > 1) {
        const next = { ...job, attempts: attempts - 1 };
        // simple re-queue at the end
        if (redisClient) await redisClient.lPush('job_queue', JSON.stringify(next));
        logger.info({ msg: 'Requeued job', attemptsLeft: next.attempts });
      } else {
        if (redisClient) await redisClient.lPush('job_failed', JSON.stringify(job));
        logger.info({ msg: 'Moved job to job_failed' });
      }
      return false;
    }
  }

  // Worker loop: blocking pop (BRPOP) from job_queue with 5s timeout
  let isShuttingDown = false;

  // Graceful shutdown handler
  process.on('SIGTERM', () => {
    logger.info({ msg: 'SIGTERM received, finishing current job and shutting down' });
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
        logger.error({ msg: 'Invalid job payload', payload: payload.substring(0, 100) });
        // Move to failed queue
        await redis.lPush('job_failed', JSON.stringify({ error: 'invalid_json', payload: payload.substring(0, 100) })).catch(() => { });
        continue;
      }
      await handleJob(job, redis);
    } catch (err) {
      logger.error({ msg: 'Worker loop error', err: err.message || err });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // Cleanup on shutdown
  logger.info({ msg: 'Worker shutting down gracefully' });
  await redis.quit().catch((err) => logger.error({ msg: 'Error closing Redis connection', err }));
  logger.info({ msg: 'Worker stopped' });
}

module.exports = { start, handleJob };

if (require.main === module) {
  start().catch((err) => { logger.error({ msg: 'Worker startup failed', err }); process.exit(1); });
}
