const request = require('supertest');
const express = require('express');
const path = require('path');
const geocodeRouter = require(path.resolve(__dirname, '../../src/routes/geocode'));
const { attachResponseHelpers } = require(path.resolve(__dirname, '../../src/lib/responses'));

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  // attach response helpers used by routes
  app.use(attachResponseHelpers);
  app.use('/api/v1/geocode', geocodeRouter);
  return app;
};

// Integration tests may call external APIs; allow more time
jest.setTimeout(30000);

describe('Geocode API Integration Tests', () => {
  let app;
  
  beforeAll(() => {
    app = createTestApp();
  });
  
  describe('POST /api/v1/geocode', () => {
    it('should return geocoded location for valid input', async () => {
      const response = await request(app)
        .post('/api/v1/geocode')
        .send({ location: 'Pune, India' })
        .expect(200);
      
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('place');
      expect(response.body.data.place).toHaveProperty('lat');
      expect(response.body.data.place).toHaveProperty('lon');
      expect(response.body.data.place).toHaveProperty('display_name');
    });
    
    it('should return 400 for missing location', async () => {
      const response = await request(app)
        .post('/api/v1/geocode')
        .send({})
        .expect(400);
      
      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body).toHaveProperty('error');
    });
    
    it('should return 404 for location not found', async () => {
      const response = await request(app)
        .post('/api/v1/geocode')
        .send({ location: 'NonExistentPlace12345XYZ' })
        .expect(404);
      
      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body).toHaveProperty('error');
    });
    
    it('should handle special characters in location', async () => {
      const response = await request(app)
        .post('/api/v1/geocode')
        .send({ location: 'São Paulo, Brazil' })
        .expect(200);
      
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body.data).toHaveProperty('place');
    });
    
    it('should return proper content-type header', async () => {
      const response = await request(app)
        .post('/api/v1/geocode')
        .send({ location: 'New York, USA' });
      
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });
});
