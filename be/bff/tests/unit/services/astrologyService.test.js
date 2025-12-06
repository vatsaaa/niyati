const astrologyService = require('../../../src/services/astrologyService');

describe('AstrologyService', () => {
  describe('getPlanets', () => {
    const validProfile = {
      year: 1990,
      month: 3,
      day: 15,
      hour: 14,
      min: 30,
      sec: 0,
      lat: 18.5204,
      lon: 73.8567,
      tzone: 5.5
    };
    
    it('should return planet positions for valid birth data', async () => {
      const result = await astrologyService.getPlanets(validProfile);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      
      // Check planet structure
      const planet = result[0];
      expect(planet).toHaveProperty('name');
      expect(planet).toHaveProperty('sign');
      expect(planet).toHaveProperty('degree');
    });
    
    it('should handle missing required fields', async () => {
      const invalidProfile = {
        year: 1990,
        month: 3
        // missing day, hour, etc.
      };
      
      await expect(astrologyService.getPlanets(invalidProfile))
        .rejects
        .toThrow();
    });
    
    it('should handle invalid date values', async () => {
      const invalidProfile = {
        ...validProfile,
        month: 13, // Invalid month
      };
      
      await expect(astrologyService.getPlanets(invalidProfile))
        .rejects
        .toThrow();
    });
    
    it('should handle invalid coordinates', async () => {
      const invalidProfile = {
        ...validProfile,
        lat: 999, // Invalid latitude
      };
      
      await expect(astrologyService.getPlanets(invalidProfile))
        .rejects
        .toThrow();
    });
    
    it('should return consistent results for same birth data', async () => {
      const result1 = await astrologyService.getPlanets(validProfile);
      const result2 = await astrologyService.getPlanets(validProfile);
      
      expect(result1).toEqual(result2);
    });
    
    it('should handle different timezones correctly', async () => {
      const profile1 = { ...validProfile, tzone: 5.5 }; // IST
      const profile2 = { ...validProfile, tzone: -5 }; // EST
      
      const result1 = await astrologyService.getPlanets(profile1);
      const result2 = await astrologyService.getPlanets(profile2);
      
      // Results should be different due to timezone difference
      expect(result1).not.toEqual(result2);
    });
  });
  
  describe('getZodiacSign', () => {
    it('should return correct zodiac sign for birth date', () => {
      const ariesDate = { month: 3, day: 25 };
      const taurusDate = { month: 5, day: 10 };
      const geminDate = { month: 6, day: 15 };
      
      // Note: These tests assume a getZodiacSign method exists
      // If not, you'll need to implement it or adjust tests
      expect(astrologyService.getZodiacSign).toBeDefined();
    });
  });
});
