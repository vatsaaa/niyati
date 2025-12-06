// Artillery load test processor
// Provides custom functions for test scenarios

module.exports = {
  $randomLocation,
  beforeRequest,
  afterResponse
};

// Generate random location from a predefined list
function $randomLocation(context, events, done) {
  const locations = [
    'Pune, India',
    'New York, USA',
    'London, UK',
    'Tokyo, Japan',
    'Mumbai, India',
    'Delhi, India',
    'Sydney, Australia',
    'Paris, France',
    'Berlin, Germany',
    'Toronto, Canada',
    'São Paulo, Brazil',
    'Singapore',
    'Dubai, UAE',
    'Los Angeles, USA',
    'San Francisco, USA'
  ];
  
  const randomLocation = locations[Math.floor(Math.random() * locations.length)];
  context.vars.randomLocation = randomLocation;
  return done();
}

// Hook to run before each request
function beforeRequest(requestParams, context, ee, next) {
  // Add custom headers or logging
  if (!requestParams.headers) {
    requestParams.headers = {};
  }
  
  requestParams.headers['x-test-id'] = context.vars.$uuid;
  requestParams.headers['x-timestamp'] = Date.now();
  
  return next();
}

// Hook to run after each response
function afterResponse(requestParams, response, context, ee, next) {
  // Log slow responses
  if (response.timings && response.timings.phases) {
    const totalTime = Object.values(response.timings.phases).reduce((a, b) => a + b, 0);
    
    if (totalTime > 1000) {
      console.log(`Slow request detected: ${requestParams.url} took ${totalTime}ms`);
    }
  }
  
  // Check for errors
  if (response.statusCode >= 500) {
    console.error(`Server error: ${response.statusCode} for ${requestParams.url}`);
  }
  
  return next();
}
