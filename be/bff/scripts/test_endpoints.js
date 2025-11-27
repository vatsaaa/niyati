const axios = require('axios');

const base = process.env.BFF_BASE || 'http://localhost:3000';

async function testGeocode() {
  console.log('\n== Geocode: Search ==');
  try {
    const resp = await axios.post(`${base}/api/geocode/search`, { q: 'Pune, India', limit: 3 }, { timeout: 10000 });
    console.log('Status:', resp.status);
    console.log('Body:', JSON.stringify(resp.data, null, 2));
    return resp.data;
  } catch (err) {
    console.error('Geocode search error:', err.message);
    if (err.response) console.error('Response:', err.response.status, err.response.data);
    return null;
  }
}

async function testGeocodeReverse() {
  console.log('\n== Geocode: Reverse ==');
  try {
    const resp = await axios.post(`${base}/api/geocode/reverse`, { lat: 18.5204, lon: 73.8567 }, { timeout: 10000 });
    console.log('Status:', resp.status);
    console.log('Body:', JSON.stringify(resp.data, null, 2));
  } catch (err) {
    console.error('Geocode reverse error:', err.message);
    if (err.response) console.error('Response:', err.response.status, err.response.data);
  }
}

async function testGeocodeLookup(fromSearch) {
  console.log('\n== Geocode: Lookup ==');
  try {
    if (!fromSearch || !fromSearch.suggestions || !fromSearch.suggestions.length) {
      console.log('No search suggestions available to derive OSM id for lookup. Skipping lookup test.');
      return;
    }
    const first = fromSearch.suggestions[0];
    const raw = first.raw || {};
    const osm_id = raw.osm_id;
    const osm_type = raw.osm_type; // 'node' | 'way' | 'relation'
    if (!osm_id || !osm_type) {
      console.log('No osm_id/osm_type on first suggestion. Skipping lookup.');
      return;
    }
    const prefix = osm_type.startsWith('relation') ? 'R' : osm_type.startsWith('way') ? 'W' : 'N';
    const osm_ids = `${prefix}${osm_id}`;
    const resp = await axios.post(`${base}/api/geocode/lookup`, { osm_ids }, { timeout: 10000 });
    console.log('Status:', resp.status);
    console.log('Body:', JSON.stringify(resp.data, null, 2));
  } catch (err) {
    console.error('Geocode lookup error:', err.message);
    if (err.response) console.error('Response:', err.response.status, err.response.data);
  }
}

async function testGeocodeStructured() {
  console.log('\n== Geocode: Structured ==');
  try {
    const resp = await axios.post(`${base}/api/geocode/structured`, { street: 'FC Road', city: 'Pune', country: 'India', limit: 3 }, { timeout: 10000 });
    console.log('Status:', resp.status);
    console.log('Body:', JSON.stringify(resp.data, null, 2));
  } catch (err) {
    console.error('Geocode structured error:', err.message);
    if (err.response) console.error('Response:', err.response.status, err.response.data);
  }
}

async function testGeocodeProxySearch() {
  console.log('\n== Geocode: Proxy Search ==');
  try {
    const resp = await axios.get(`${base}/api/geocode/proxy/search`, { params: { q: 'Pune, India', limit: 2 }, timeout: 10000 });
    console.log('Status:', resp.status);
    console.log('Body:', JSON.stringify(resp.data, null, 2));
  } catch (err) {
    console.error('Geocode proxy search error:', err.message);
    if (err.response) console.error('Response:', err.response.status, err.response.data);
  }
}

async function testCurrentLocation() {
  console.log('\n== Geocode: Current Location ==');
  try {
    const resp = await axios.get(`${base}/api/geocode/current-location`, { timeout: 10000 });
    console.log('Status:', resp.status);
    console.log('Body:', JSON.stringify(resp.data, null, 2));
  } catch (err) {
    console.error('Current location error:', err.message);
    if (err.response) console.error('Response:', err.response.status, err.response.data);
  }
}

async function testAstroProbe() {
  console.log('\n== Astrology: Probe ==');
  try {
    const resp = await axios.post(`${base}/api/astrology/probe`, {}, { timeout: 20000 });
    console.log('Status:', resp.status);
    console.log('Body:', JSON.stringify(resp.data, null, 2));
  } catch (err) {
    console.error('Astro probe error:', err.message);
    if (err.response) console.error('Response:', err.response.status, err.response.data);
  }
}

async function testAstroCompute() {
  console.log('\n== Astrology: Compute ==');
  const payload = {
    profile: {
      name: 'Test User',
      dob: '1990-11-23',
      timeOfBirth: '07:30',
      placeOfBirth: { raw: 'Pune, India', city: 'Pune', countryCode: 'IN', lat: 18.5204, lng: 73.8567 }
    }
  };
  try {
    const resp = await axios.post(`${base}/api/astrology/compute`, payload, { timeout: 20000 });
    console.log('Status:', resp.status);
    console.log('Body:', JSON.stringify(resp.data, null, 2));
  } catch (err) {
    console.error('Astrology compute error:', err.message);
    if (err.response) console.error('Response:', err.response.status, err.response.data);
  }
}

async function testAstroGeoDetails() {
  console.log('\n== Astrology: Geo-Details ==');
  try {
    const resp = await axios.post(`${base}/api/astrology/geo-details`, { q: 'Pune, India' }, { timeout: 15000 });
    console.log('Status:', resp.status);
    console.log('Body:', JSON.stringify(resp.data, null, 2));
  } catch (err) {
    console.error('Astrology geo-details error:', err.message);
    if (err.response) console.error('Response:', err.response.status, err.response.data);
  }
}

async function testAstroPlanets() {
  console.log('\n== Astrology: Planets ==');
  const payload = {
    name: 'Test User',
    dob: '1990-11-23',
    time: '07:30',
    place: { lat: 18.5204, lng: 73.8567 }
  };
  try {
    const resp = await axios.post(`${base}/api/astrology/planets`, payload, { timeout: 20000 });
    console.log('Status:', resp.status);
    console.log('Body:', JSON.stringify(resp.data, null, 2));
  } catch (err) {
    console.error('Astrology planets error:', err.message);
    if (err.response) console.error('Response:', err.response.status, err.response.data);
  }
}

async function run() {
  const searchResult = await testGeocode();
  await testGeocodeReverse();
  await testGeocodeLookup(searchResult);
  await testGeocodeStructured();
  await testGeocodeProxySearch();
  await testCurrentLocation();

  await testAstroProbe();
  await testAstroCompute();
  await testAstroGeoDetails();
  await testAstroPlanets();
}

run().catch(e => { console.error('Test script failed:', e); process.exit(1); });
