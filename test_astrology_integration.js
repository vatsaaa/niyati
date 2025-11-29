#!/usr/bin/env node

// Test script to verify the astrology integration works correctly
const axios = require('axios');

const BFF_BASE_URL = 'http://localhost:3000';

// Test data
const testProfile = {
  user_name: 'Test User',
  user_dob: '1990-11-23',
  user_placeOfBirth: 'Pune, Maharashtra, India',
  user_timeOfBirth: '07:30:00',
  user_consentGiven: true
};

// Simulate the location format detection logic
function determineGeocodingEndpoint(location) {
  if (!location) return null;
  
  const cleaned = location.trim();
  const parts = cleaned.split(/[,;|]/g).map(p => p.trim()).filter(p => p.length > 0);
  
  const hasStreetIndicators = /\b(\d+\s+\w+|road|street|avenue|lane|drive|blvd|ave|rd|st|ln|dr)\b/i.test(cleaned);
  
  if (hasStreetIndicators || parts.length >= 4) {
    return {
      endpoint: '/api/geocode/structured',
      payload: {
        street: parts[0] || '',
        city: parts[1] || '',
        state: parts[2] || '',
        country: parts[3] || ''
      }
    };
  } else if (parts.length === 3) {
    return {
      endpoint: '/api/geocode/search',
      payload: { q: cleaned, limit: 5 }
    };
  } else if (parts.length === 2) {
    return {
      endpoint: '/api/geocode',
      payload: { q: cleaned, limit: 5 }
    };
  } else {
    return {
      endpoint: '/api/geocode',
      payload: { q: cleaned, limit: 5 }
    };
  }
}

async function testLocationResolution() {
  console.log('🧪 Testing location resolution for:', testProfile.user_placeOfBirth);
  
  const geocodingConfig = determineGeocodingEndpoint(testProfile.user_placeOfBirth);
  console.log('📍 Selected endpoint:', geocodingConfig.endpoint);
  console.log('📦 Payload:', JSON.stringify(geocodingConfig.payload, null, 2));
  
  try {
    // Test geocoding
    const geocodeResponse = await axios.post(`${BFF_BASE_URL}${geocodingConfig.endpoint}`, geocodingConfig.payload);
    console.log('✅ Geocoding successful');
    console.log('📊 Response:', JSON.stringify(geocodeResponse.data, null, 2));
    
    // Extract location data
    let locationData = null;
    if (geocodeResponse.data.status === 'ok' && geocodeResponse.data.place) {
      locationData = geocodeResponse.data.place;
    } else if (geocodeResponse.data.status === 'ambiguous' && geocodeResponse.data.suggestions && geocodeResponse.data.suggestions.length > 0) {
      locationData = geocodeResponse.data.suggestions[0];
    }
    
    if (!locationData) {
      throw new Error('No location data found');
    }
    
    console.log('📍 Location extracted:', {
      city: locationData.city,
      country: locationData.country,
      lat: locationData.lat,
      lon: locationData.lon
    });
    
    // Test timezone lookup
    const timezonePayload = {
      lat: locationData.lat,
      lon: locationData.lon
    };
    
    const timezoneResponse = await axios.post(`${BFF_BASE_URL}/api/astrology/geo-details`, timezonePayload);
    console.log('✅ Timezone lookup successful');
    console.log('🕐 Timezone data:', JSON.stringify(timezoneResponse.data, null, 2));
    
    let timezone = 0;
    if (timezoneResponse.data.status === 'ok' && timezoneResponse.data.data) {
      timezone = timezoneResponse.data.data.timezone || timezoneResponse.data.data.utc_offset || 0;
    }
    
    console.log('🕐 Extracted timezone:', timezone);
    
    return { locationData, timezone };
    
  } catch (error) {
    console.error('❌ Error in location resolution:', error.message);
    if (error.response) {
      console.error('📊 Response data:', error.response.data);
    }
    throw error;
  }
}

async function testAstrologyCalculation(locationData, timezone) {
  console.log('\n🔮 Testing astrology calculation...');
  
  // Parse birth date and time
  const [year, month, date] = testProfile.user_dob.split('-').map(n => parseInt(n, 10));
  const timeParts = testProfile.user_timeOfBirth.split(':').map(n => parseInt(n, 10));
  const [hours, minutes, seconds] = [timeParts[0] || 0, timeParts[1] || 0, timeParts[2] || 0];
  
  const astrologyPayload = {
    year,
    month, 
    date,
    hours,
    minutes,
    seconds,
    latitude: locationData.lat,
    longitude: locationData.lon,
    timezone,
    settings: {
      observation_point: 'topocentric',
      ayanamsha: 'lahiri',
      language: 'en'
    }
  };
  
  console.log('📦 Astrology payload:', JSON.stringify(astrologyPayload, null, 2));
  
  try {
    // Test planets API
    console.log('\n🪐 Testing planets API...');
    const planetsResponse = await axios.post(`${BFF_BASE_URL}/api/astrology/planets`, astrologyPayload);
    console.log('✅ Planets API successful');
    console.log('🪐 Planets summary:', {
      status: planetsResponse.data.status,
      dataKeys: Object.keys(planetsResponse.data.data || {}),
      source: planetsResponse.data.source
    });
    
    // Test horoscope SVG API  
    console.log('\n🎨 Testing horoscope SVG API...');
    const svgPayload = {
      ...astrologyPayload,
      config: astrologyPayload.settings
    };
    
    const horoscopeSvgResponse = await axios.post(`${BFF_BASE_URL}/api/astrology/horoscope-svg`, svgPayload);
    console.log('✅ Horoscope SVG API successful');
    console.log('🎨 SVG summary:', {
      status: horoscopeSvgResponse.data.status,
      svgLength: horoscopeSvgResponse.data.data ? horoscopeSvgResponse.data.data.length : 0,
      source: horoscopeSvgResponse.data.source
    });
    
    return {
      planets: planetsResponse.data,
      horoscopeSvg: horoscopeSvgResponse.data
    };
    
  } catch (error) {
    console.error('❌ Error in astrology calculation:', error.message);
    if (error.response) {
      console.error('📊 Response data:', error.response.data);
    }
    throw error;
  }
}

async function runFullTest() {
  console.log('🚀 Starting complete astrology integration test...\n');
  console.log('👤 Test profile:', JSON.stringify(testProfile, null, 2));
  
  try {
    // Step 1: Test location resolution
    const { locationData, timezone } = await testLocationResolution();
    
    // Step 2: Test astrology calculation
    const astrologyResults = await testAstrologyCalculation(locationData, timezone);
    
    console.log('\n🎉 Complete integration test successful!');
    console.log('📋 Summary:');
    console.log('  ✅ Location resolved:', locationData.city, ',', locationData.country);
    console.log('  ✅ Timezone determined:', timezone);
    console.log('  ✅ Planets calculated:', astrologyResults.planets.status);
    console.log('  ✅ Horoscope SVG generated:', astrologyResults.horoscopeSvg.status);
    
  } catch (error) {
    console.error('\n💥 Integration test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  runFullTest().catch(console.error);
}

module.exports = { determineGeocodingEndpoint, testLocationResolution, testAstrologyCalculation };