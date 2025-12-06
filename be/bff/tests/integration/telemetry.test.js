const request = require('supertest');
const express = require('express');
const path = require('path');
const telemetryRouter = require(path.resolve(__dirname, '../../src/routes/telemetry'));
const { attachResponseHelpers } = require(path.resolve(__dirname, '../../src/lib/responses'));

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
    // attach response helpers used by routes (res.sendError / res.sendSuccess)
    app.use(attachResponseHelpers);
    app.use('/api/v1/telemetry', telemetryRouter);
  return app;
};

describe('Telemetry API Integration Tests', () => {
  let app;
  
  beforeAll(() => {
    app = createTestApp();
  });
  
  describe('GET /api/v1/telemetry/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/v1/telemetry/health')
        .expect(200);
      
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(typeof response.body.uptime).toBe('number');
    });
    
    it('should return consistent health status', async () => {
      const response1 = await request(app).get('/api/v1/telemetry/health');
      const response2 = await request(app).get('/api/v1/telemetry/health');
      
      expect(response1.body.status).toBe(response2.body.status);
    });
  });
  
  describe('GET /api/v1/telemetry/info', () => {
    it('should return service information', async () => {
      const response = await request(app)
        .get('/api/v1/telemetry/info')
        .expect(200);
      
      expect(response.body).toHaveProperty('service');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('apiVersion');
      expect(response.body).toHaveProperty('environment');
      expect(response.body).toHaveProperty('node');
      expect(response.body).toHaveProperty('memory');
    });
    
    it('should include memory information', async () => {
      const response = await request(app)
        .get('/api/v1/telemetry/info')
        .expect(200);
      
      expect(response.body.memory).toHaveProperty('heapUsed');
      expect(response.body.memory).toHaveProperty('heapTotal');
      expect(response.body.memory).toHaveProperty('rss');
    });
  });
  
  describe('POST /api/v1/telemetry/log', () => {
    it('should accept valid log entry', async () => {
      const response = await request(app)
        .post('/api/v1/telemetry/log')
        .send({
          level: 'info',
          message: 'Test log message',
          meta: { test: true }
        })
        .expect(200);
      
      // route uses sendSuccess to return standardized responses
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('logged', true);
    });
    
    it('should validate log level', async () => {
      const response = await request(app)
        .post('/api/v1/telemetry/log')
        .send({
          level: 'invalid_level',
          message: 'Test message'
        })
        .expect(400);
      
      expect(response.body).toHaveProperty('error');
    });
    
    it('should require message field', async () => {
      const response = await request(app)
        .post('/api/v1/telemetry/log')
        .send({
          level: 'info'
        })
        .expect(400);
      
      expect(response.body).toHaveProperty('error');
    });
    
    it('should respect rate limiting', async () => {
      // Send multiple requests rapidly
      const requests = Array(150).fill(null).map(() =>
        request(app)
          .post('/api/v1/telemetry/log')
          .send({ level: 'info', message: 'Test' })
      );
      
      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status === 429);
      
      // Some requests should be rate limited
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });
});
