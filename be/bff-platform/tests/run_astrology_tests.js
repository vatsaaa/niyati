const request = require('supertest');
const express = require('express');
const commons = require('../commons');

async function run() {
  const app = express();
  app.use(express.json());
  app.use(commons.attachResponseHelpers);
  const astrologyRouter = require('../lib/astrology');
  app.use('/api/astrology', astrologyRouter);

  console.log('=> POST /api/astrology/compute (missing)');
  const r1 = await request(app).post('/api/astrology/compute').send({});
  console.log('status', r1.status, 'body', r1.body);

  console.log('=> POST /api/astrology/planets (incomplete)');
  const r2 = await request(app).post('/api/astrology/planets').send({});
  console.log('status', r2.status, 'body', r2.body);

  console.log('=> POST /api/astrology/planets (valid)');
  const payload = { year: 1990, month: 11, date: 23, lat: 18.5204, lon: 73.8567 };
  const r3 = await request(app).post('/api/astrology/planets').send(payload);
  console.log('status', r3.status, 'bodySummary', Array.isArray(r3.body.data) ? `array len ${r3.body.data.length}` : JSON.stringify(r3.body));

  // cleanup cache interval
  try {
    const astrologyService = require('../services/astrologyService');
    if (astrologyService && astrologyService._cache && typeof astrologyService._cache.close === 'function') {
      astrologyService._cache.close();
    }
  } catch (e) {}
}

run().then(() => { console.log('done'); process.exit(0); }).catch((err) => { console.error('error', err); process.exit(1); });
