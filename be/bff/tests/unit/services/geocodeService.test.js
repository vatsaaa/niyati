const geocodeService = require('../../../src/services/geocodeService');

describe('GeocodeService', () => {
  describe('geocode', () => {
    it('should return coordinates for valid location', async () => {
      const result = await geocodeService.search('Pune, India');
      
      expect(result).toBeDefined();
      expect(result).toHaveProperty('place');
      expect(result.place).toHaveProperty('lat');
      expect(result.place).toHaveProperty('lon');
      expect(result.place).toHaveProperty('display_name');
      
      // Pune coordinates should be approximately these values
      expect(parseFloat(result.place.lat)).toBeCloseTo(18.5, 0);
      expect(parseFloat(result.place.lon)).toBeCloseTo(73.8, 0);
    });
    
    it('should handle location not found gracefully', async () => {
      await expect(geocodeService.geocode('NonExistentPlace12345XYZ'))
        .rejects
        .toThrow('Could not find a matching place');
    });
    
    it('should handle empty location string', async () => {
      await expect(geocodeService.geocode(''))
        .rejects
        .toThrow();
    });
    
    it('should handle null location', async () => {
      await expect(geocodeService.geocode(null))
        .rejects
        .toThrow();
    });
    
    it('should return consistent results for same location', async () => {
      const result1 = await geocodeService.geocode('New Delhi, India');
      const result2 = await geocodeService.geocode('New Delhi, India');
      
      expect(result1.place.lat).toBe(result2.place.lat);
      expect(result1.place.lon).toBe(result2.place.lon);
    });
    
    it('should handle international locations', async () => {
      const result = await geocodeService.geocode('New York, USA');
      
      expect(result).toBeDefined();
      expect(result.place).toHaveProperty('lat');
      expect(result.place).toHaveProperty('lon');
      expect(parseFloat(result.place.lat)).toBeCloseTo(40.7, 0);
      expect(parseFloat(result.place.lon)).toBeCloseTo(-74.0, 0);
    });
    
    it('should handle special characters in location names', async () => {
      const result = await geocodeService.geocode('São Paulo, Brazil');
      
      expect(result).toBeDefined();
      expect(result.place).toHaveProperty('lat');
      expect(result.place).toHaveProperty('lon');
    });
  });
});
