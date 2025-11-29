#!/usr/bin/env node

// Test script to verify the location integration works correctly
const axios = require('axios');

async function testLocationIntegration() {
  console.log('Testing current location API integration...\n');
  
  try {
    // Test the current location API endpoint
    const response = await axios.get('http://localhost:3000/api/geocode/current-location');
    
    console.log('✅ API Response Status:', response.status);
    console.log('✅ API Response:\n', JSON.stringify(response.data, null, 2));
    
    // Verify the response structure
    if (response.data.status === 'ok' && response.data.location) {
      console.log('\n✅ Response structure is correct');
      console.log('✅ Location data found:', {
        country: response.data.location.country,
        countryCode: response.data.location.countryCode,
        state: response.data.location.state,
        city: response.data.location.city,
        postal: response.data.location.postal,
        latitude: response.data.location.latitude,
        longitude: response.data.longitude
      });
      
      // Simulate what would be stored in the user profile
      const userProfile = {
        user_name: 'Test User',
        user_dob: '1990-11-23',
        user_placeOfBirth: 'Pune, India',
        user_timeOfBirth: '07:30',
        user_currentLocation: response.data.location, // This is what gets stored
        user_verified: {},
        user_consentGiven: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      console.log('\n✅ Sample user profile with location data:\n', JSON.stringify(userProfile, null, 2));
      
      // Test the formatting function
      const formatCurrentLocationForDisplay = (currentLocation) => {
        if (!currentLocation) return null;
        if (typeof currentLocation === 'string') return currentLocation;
        if (typeof currentLocation === 'object') {
          const parts = [];
          if (currentLocation.city) parts.push(currentLocation.city);
          if (currentLocation.state) parts.push(currentLocation.state);
          if (currentLocation.country) parts.push(currentLocation.country);
          return parts.join(', ') || null;
        }
        return null;
      };
      
      const displayFormat = formatCurrentLocationForDisplay(response.data.location);
      console.log('\n✅ Formatted for display:', displayFormat);
      
    } else {
      console.log('❌ Unexpected response structure');
    }
    
  } catch (error) {
    console.error('❌ Error testing location API:', error.message);
    if (error.response) {
      console.error('❌ Response status:', error.response.status);
      console.error('❌ Response data:', error.response.data);
    }
  }
}

// Run the test
testLocationIntegration();