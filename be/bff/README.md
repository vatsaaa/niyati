# Niyati — Backend-for-Frontend (BFF)

This BFF is a small Node/Express server that provides a unified API layer for the Niyati application, handling geocoding, astrology calculations, and payments processing.

## What it provides
- **Geocoding**: Complete location services including search, reverse lookup, structured queries, and proxy endpoints
- **Astrology**: Comprehensive astrology calculations including birth charts, planetary positions, divisional charts, and horoscope SVG generation
- **Payments**: Payment processing scaffold with Razorpay integration for credits-based transactions
- **Health Check**: Basic server status endpoint

## Quick start

1. Install dependencies

```bash
cd be/bff
npm install
```

2. Copy `.env.example` to `.env` and set values

```bash
cp .env.example .env
# edit .env with your API keys
```

3. Run the server

```bash
npm run dev
```

## Current Configuration
Based on your `.env` file:
- Server Port: `3000`
- Geocoding: maps.co with API key configured
- Astrology Provider: `https://json.apiastro.com` with API key configured
- Payments: Razorpay (keys need to be configured for full functionality)

This README documents all supported APIs with working curl examples for quick testing.

## Environment Configuration

Current `.env` configuration:
```bash
PORT=3000
GEOCODE_MAPS_KEY=692331f47b1fb572260859afrd77c62  # Configured ✓
RAZORPAY_KEY_ID=                                   # Needs configuration for payments
RAZORPAY_KEY_SECRET=                               # Needs configuration for payments
RAZORPAY_WEBHOOK_SECRET=                           # Needs configuration for payments
ASTRO_API_KEY=rbFZQW05Fj6r382kuCNIA4A2rthPHHmVXBRXuQo2  # Configured ✓
ASTRO_API_URL=https://json.apiastro.com           # Configured ✓
NODE_ENV=development
```

### Required Environment Variables
- `PORT` — Server port (default `3000`)
- `ASTRO_API_URL` — Base URL for astrology provider (currently: `https://json.apiastro.com`)
- `ASTRO_API_KEY` — API key for astrology provider (configured ✓)
- `GEOCODE_MAPS_KEY` — API key for maps.co geocoding (configured ✓)

### Optional Environment Variables
- `ASTRO_DEFAULT_TIMEZONE` — Default timezone offset (e.g. `5.5` for IST)
- `GEOCODE_MAPS_BASE` — Maps.co base URL override (defaults to `https://geocode.maps.co`)
- `GEOCODE_USER_AGENT` — Custom User-Agent for geocoding requests
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` — For payment processing
- `NGROK_AUTH_TOKEN` — For webhook testing with ngrok

## Development Setup

1. **Install and run**
   ```bash
   cd be/bff
   npm install
   cp .env.example .env   # Edit with your API keys
   npm run dev
   ```

2. **Quick integration test**
   ```bash
   npm run test:integ
   ```

3. **Webhook testing with ngrok** (optional)
   ```bash
   ngrok http 3000
   # Set payment provider webhook to: https://<your-id>.ngrok.io/api/payments/webhook
   ```

## Response Formats

### Geocoding Response
```json
{
  "status": "ok",
  "source": "geocode.maps.co",
  "suggestions": [
    {
      "display_name": "Pune, Maharashtra, India",
      "lat": "18.5204",
      "lon": "73.8567",
      "place_id": "123456",
      "raw": { /* original provider response */ }
    }
  ],
  "place": { /* first suggestion */ }
}
```

### Astrology Response
```json
{
  "status": "ok",
  "source": "https://json.apiastro.com",
  "data": {
    "sun": { "sign": "Scorpio", "degree": "1.23" },
    "moon": { "sign": "Cancer", "degree": "15.67" },
    "ascendant": { "sign": "Virgo", "degree": "8.90" },
    "raw": { /* complete provider response */ }
  },
  "summary": "Brief interpretation"
}
```

### Payments Response
```json
{
  "status": "ok",
  "orderId": "uuid-v4",
  "providerOrderId": "order_razorpay_id",
  "amountInPaise": 30000,
  "currency": "INR",
  "planId": "plan_5",
  "credits": 5,
  "keyId": "rzp_test_key"
}
```

## Complete API Reference

All examples assume server running at `http://localhost:3000`. The server is configured with your current API keys.

### Health Check

- **GET** `/`
  - Purpose: Server health check
  - Example:
    ```bash
    curl http://localhost:3000/
    ```
  - Expected response: `{"status":"ok","msg":"Niyati BFF running"}`

---

### Geocoding APIs (`/api/geocode`)

#### 1. Search (Primary endpoint)
- **POST** `/api/geocode` (alias for search)
- **POST** `/api/geocode/search`
  - Purpose: Search for places by name
  - Body: `{ "q": "place name", "limit": 5 }`
  - Examples:
    ```bash
    # Basic search
    curl -X POST http://localhost:3000/api/geocode \
      -H "Content-Type: application/json" \
      -d '{"q":"Pune, India"}'
    
    # Search with limit
    curl -X POST http://localhost:3000/api/geocode/search \
      -H "Content-Type: application/json" \
      -d '{"q":"Mumbai, Maharashtra, India","limit":3}'
    ```

#### 2. Reverse Geocoding
- **POST** `/api/geocode/reverse`
  - Purpose: Get place information from coordinates
  - Body: `{ "lat": number, "lon": number, "limit": number }`
  - Example:
    ```bash
    curl -X POST http://localhost:3000/api/geocode/reverse \
      -H "Content-Type: application/json" \
      -d '{"lat":18.5204,"lon":73.8567,"limit":3}'
    ```

#### 3. OSM Lookup
- **POST** `/api/geocode/lookup`
  - Purpose: Look up places by OpenStreetMap IDs
  - Body: `{ "osm_ids": "string" }` or `{ "osm_ids": ["array"] }`
  - Examples:
    ```bash
    # Single ID
    curl -X POST http://localhost:3000/api/geocode/lookup \
      -H "Content-Type: application/json" \
      -d '{"osm_ids":"R146656"}'
    
    # Multiple IDs
    curl -X POST http://localhost:3000/api/geocode/lookup \
      -H "Content-Type: application/json" \
      -d '{"osm_ids":["R146656","W123456"]}'
    ```

#### 4. Structured Search
- **POST** `/api/geocode/structured`
  - Purpose: Search using structured address components
  - Body: `{ "street": "...", "city": "...", "state": "...", "country": "..." }`
  - Example:
    ```bash
    curl -X POST http://localhost:3000/api/geocode/structured \
      -H "Content-Type: application/json" \
      -d '{"street":"MG Road","city":"Pune","state":"Maharashtra","country":"India"}'
    ```

#### 5. Proxy Endpoints
- **GET** `/api/geocode/proxy/*`
  - Purpose: Safe passthrough to maps.co for `/search`, `/reverse`, `/lookup`
  - Examples:
    ```bash
    # Proxy search
    curl 'http://localhost:3000/api/geocode/proxy/search?format=json&q=Delhi&limit=2'
    
    # Proxy reverse
    curl 'http://localhost:3000/api/geocode/proxy/reverse?format=json&lat=28.6139&lon=77.2090'
    ```

---

### Astrology APIs (`/api/astrology`)

#### 1. Complete Astrology Computation
- **POST** `/api/astrology/compute`
  - Purpose: Generate comprehensive astrology report
  - Body: `{ "profile": { "name": "...", "dob": "YYYY-MM-DD", "timeOfBirth": "HH:MM:SS", "placeOfBirth": { lat, lon, city, countryCode } } }`
  - Example:
    ```bash
    curl -X POST http://localhost:3000/api/astrology/compute \
      -H "Content-Type: application/json" \
      -d '{
        "profile": {
          "name": "Test User",
          "dob": "1990-11-23",
          "timeOfBirth": "07:30:00",
          "placeOfBirth": {
            "city": "Pune",
            "countryCode": "IN",
            "lat": 18.5204,
            "lng": 73.8567
          }
        }
      }'
    ```

#### 2. Geographic Details for Astrology
- **POST** `/api/astrology/geo-details`
  - Purpose: Get timezone and geographic data for astrology calculations
  - Body: `{ "location": "place name" }` or `{ "lat": number, "lon": number }`
  - Examples:
    ```bash
    # By location name
    curl -X POST http://localhost:3000/api/astrology/geo-details \
      -H "Content-Type: application/json" \
      -d '{"location":"New Delhi"}'
    
    # By coordinates
    curl -X POST http://localhost:3000/api/astrology/geo-details \
      -H "Content-Type: application/json" \
      -d '{"lat":28.6139,"lon":77.2090}'
    ```

#### 3. Planetary Positions (Rasi Chart)
- **POST** `/api/astrology/planets`
  - Purpose: Get planetary positions and Rasi chart data
  - Body: Astrology payload with birth details
  - Example:
    ```bash
    curl -X POST http://localhost:3000/api/astrology/planets \
      -H "Content-Type: application/json" \
      -d '{
        "year": 1990,
        "month": 11,
        "date": 23,
        "hours": 7,
        "minutes": 30,
        "seconds": 0,
        "latitude": 18.5204,
        "longitude": 73.8567,
        "timezone": 5.5,
        "settings": {
          "observation_point": "topocentric",
          "ayanamsha": "lahiri"
        }
      }'
    ```

#### 4. Navamsa Chart
- **POST** `/api/astrology/navamsa`
  - Purpose: Generate D9/Navamsa divisional chart
  - Body: Same as planets endpoint
  - Example:
    ```bash
    curl -X POST http://localhost:3000/api/astrology/navamsa \
      -H "Content-Type: application/json" \
      -d '{
        "year": 1990,
        "month": 11,
        "date": 23,
        "hours": 7,
        "minutes": 30,
        "seconds": 0,
        "latitude": 18.5204,
        "longitude": 73.8567,
        "timezone": 5.5,
        "settings": {
          "observation_point": "topocentric",
          "ayanamsha": "lahiri"
        }
      }'
    ```

#### 5. Divisional Charts
- **POST** `/api/astrology/divisional`
  - Purpose: Generate any divisional chart (D2 to D60)
  - Body: `{ "divisional": number, "year": ..., "month": ..., etc. }`
  - Example:
    ```bash
    # D10 (Dashamsha) chart
    curl -X POST http://localhost:3000/api/astrology/divisional \
      -H "Content-Type: application/json" \
      -d '{
        "divisional": 10,
        "year": 1990,
        "month": 11,
        "date": 23,
        "hours": 7,
        "minutes": 30,
        "seconds": 0,
        "latitude": 18.5204,
        "longitude": 73.8567,
        "timezone": 5.5,
        "settings": {
          "observation_point": "topocentric",
          "ayanamsha": "lahiri"
        }
      }'
    ```

#### 6. Horoscope SVG Chart
- **POST** `/api/astrology/horoscope-svg`
  - Purpose: Generate horoscope chart as SVG code
  - Body: Same as planets endpoint
  - Example:
    ```bash
    curl -X POST http://localhost:3000/api/astrology/horoscope-svg \
      -H "Content-Type: application/json" \
      -d '{
        "year": 1990,
        "month": 11,
        "date": 23,
        "hours": 7,
        "minutes": 30,
        "seconds": 0,
        "latitude": 18.5204,
        "longitude": 73.8567,
        "timezone": 5.5,
        "config": {
          "observation_point": "topocentric",
          "ayanamsha": "lahiri"
        }
      }'
    ```

#### 7. Provider Probe (Debug)
- **POST** `/api/astrology/probe`
  - Purpose: Test astrology provider endpoints (disable in production)
  - Body: `{ "payload": {...}, "paths": [...] }`
  - Example:
    ```bash
    curl -X POST http://localhost:3000/api/astrology/probe \
      -H "Content-Type: application/json" \
      -d '{
        "payload": {
          "year": 1990,
          "month": 11,
          "date": 23,
          "hours": 7,
          "minutes": 30,
          "seconds": 0,
          "latitude": 18.5204,
          "longitude": 73.8567,
          "timezone": 5.5
        }
      }'
    ```

---

### Payments APIs (`/api/payments`)

#### 1. Create Order
- **POST** `/api/payments/create-order`
  - Purpose: Create a new payment order
  - Body: `{ "phone": "...", "planId": "plan_5" | "plan_10" }`
  - Available plans:
    - `plan_5`: 5 credits for ₹300
    - `plan_10`: 10 credits for ₹500
  - Example:
    ```bash
    curl -X POST http://localhost:3000/api/payments/create-order \
      -H "Content-Type: application/json" \
      -d '{"phone":"+919876543210","planId":"plan_5"}'
    ```

#### 2. Verify Payment
- **POST** `/api/payments/verify`
  - Purpose: Verify Razorpay payment signature
  - Body: Razorpay response payload
  - Example:
    ```bash
    curl -X POST http://localhost:3000/api/payments/verify \
      -H "Content-Type: application/json" \
      -d '{
        "razorpay_payment_id": "pay_xxxx",
        "razorpay_order_id": "order_xxxx",
        "razorpay_signature": "signature_xxxx"
      }'
    ```

#### 3. Order Status
- **GET** `/api/payments/status?orderId=...`
  - Purpose: Get order status and remaining credits
  - Example:
    ```bash
    curl 'http://localhost:3000/api/payments/status?orderId=your-order-id-here'
    ```

#### 4. Payment Webhook
- **POST** `/api/payments/webhook`
  - Purpose: Handle payment provider webhooks
  - Example test webhook:
    ```bash
    curl -X POST http://localhost:3000/api/payments/webhook \
      -H "Content-Type: application/json" \
      -d '{
        "event": "payment.captured",
        "orderId": "your-order-id",
        "phone": "+919876543210"
      }'
    ```

---

## API Testing Status & Commands

Copy and paste each command to test. Update the status column as you go.

| # | API | Command | Status | Output Summary |
|---|-----|---------|--------|----------------|
| 1 | **Health Check** | `curl http://localhost:3000/` | ✅ | Status: "ok", msg: "Niyati BFF running" - Server healthy and responding |
| 2 | **Geocoding - Basic Search** | `curl -X POST http://localhost:3000/api/geocode -H "Content-Type: application/json" -d '{"q":"Pune, India"}'` | ✅ | Status: "ambiguous", 2 suggestions: Pune City (18.5213738, 73.8545071) + Pune District |
| 3 | **Geocoding - Search with Limit** | `curl -X POST http://localhost:3000/api/geocode/search -H "Content-Type: application/json" -d '{"q":"Mumbai, Maharashtra, India","limit":3}'` | ✅ | Status: "ok", 1 exact match: Mumbai (19.054999, 72.8692035), pop: 12.4M |
| 4 | **Geocoding - Reverse Lookup** | `curl -X POST http://localhost:3000/api/geocode/reverse -H "Content-Type: application/json" -d '{"lat":18.5204,"lon":73.8567,"limit":3}'` | ✅ | Status: "ok", Found: Siddharth Library, Shivaji Road, Kasba Peth, Pune (18.5204303, 73.8567437) with postcode 411002 |
| 5 | **Geocoding - OSM Lookup** | `curl -X POST http://localhost:3000/api/geocode/lookup -H "Content-Type: application/json" -d '{"osm_ids":"R146656"}'` | ✅ | Status: "ok", Found: Manchester, UK (53.4794892, -2.2451148) with pop: 503,100 and 80+ language names |
| 6 | **Geocoding - Structured Search** | `curl -X POST http://localhost:3000/api/geocode/structured -H "Content-Type: application/json" -d '{"street":"MG Road","city":"Pune","state":"Maharashtra","country":"India"}'` | ✅ | Status: "ok", Found 2 MG Roads: Uruli Kanchan (18.4930274, 74.1350385) + Mahatma Gandhi Marg, Pune Cantonment |
| 7 | **Geocoding - Proxy Search** | `curl 'http://localhost:3000/api/geocode/proxy/search?format=json&q=Delhi&limit=2'` | ✅ | Status: "ok", Found 2 results: New Delhi (28.6138954, 77.2090057) capital + Delhi territory (28.6328027, 77.2197713) |
| 8 | **Astrology - Geo Details** | `curl -X POST http://localhost:3000/api/astrology/geo-details -H "Content-Type: application/json" -d '{"location":"New Delhi"}'` | ✅ | Status: "ok", Found: New Delhi (28.63576, 77.22445) with timezone Asia/Kolkata (UTC+5.5) - Ready for astrology calculations |
| 9 | **Astrology - Complete Computation** | `curl -X POST http://localhost:3000/api/astrology/compute -H "Content-Type: application/json" -d '{"profile":{"name":"Test User","dob":"1990-11-23","timeOfBirth":"07:30:00","placeOfBirth":{"city":"Pune","countryCode":"IN","lat":18.5204,"lng":73.8567}}}'` | ✅ | Status: "ok", Complete computation: Sun: Scorpio, Moon: Capricorn, Asc: Scorpio. Detailed planetary data with nakshatras, padas, degrees/minutes/seconds, house positions, and zodiac lords. Ready for comprehensive astrological analysis |
| 10 | **Astrology - Planets/Rasi Chart** | `curl -X POST http://localhost:3000/api/astrology/planets -H "Content-Type: application/json" -d '{"year":1990,"month":11,"date":23,"hours":7,"minutes":30,"seconds":0,"latitude":18.5204,"longitude":73.8567,"timezone":5.5,"settings":{"observation_point":"topocentric","ayanamsha":"lahiri"}}'` | ✅ | Status: "ok", Complete planetary positions: Sun/Mercury/Venus in Scorpio (8th sign), Moon/Rahu in Capricorn, Jupiter/Ketu in Cancer, Mars in Gemini (retrograde), Saturn in Sagittarius. Ayanamsa: 23.73° (Lahiri) |
| 11 | **Astrology - Navamsa Chart** | `curl -X POST http://localhost:3000/api/astrology/navamsa -H "Content-Type: application/json" -d '{"year":1990,"month":11,"date":23,"hours":7,"minutes":30,"seconds":0,"latitude":18.5204,"longitude":73.8567,"timezone":5.5,"settings":{"observation_point":"topocentric","ayanamsha":"lahiri"}}'` | ✅ | Status: "ok", D9 Navamsa chart: Ascendant in Scorpio (8th), Sun in Virgo (11th house), Moon in Pisces (5th house), Jupiter/Saturn in Sagittarius (2nd house), Venus in Libra (12th house), Mars in Gemini retrograde (7th house) |
| 12 | **Astrology - Divisional Chart (D10)** | `curl -X POST http://localhost:3000/api/astrology/divisional -H "Content-Type: application/json" -d '{"divisional":10,"year":1990,"month":11,"date":23,"hours":7,"minutes":30,"seconds":0,"latitude":18.5204,"longitude":73.8567,"timezone":5.5,"settings":{"observation_point":"topocentric","ayanamsha":"lahiri"}}'` | ✅ | Status: "ok", D10 Dashamsha chart: Ascendant/Moon in Sagittarius (1st house), Sun/Jupiter/Saturn in Virgo (10th house), Mars/Ketu in Gemini (6th house), Mercury in Pisces (4th house), Venus/Rahu in Scorpio (12th house). Career analysis ready |
| 13 | **Astrology - Horoscope SVG** | `curl -X POST http://localhost:3000/api/astrology/horoscope-svg -H "Content-Type: application/json" -d '{"year":1990,"month":11,"date":23,"hours":7,"minutes":30,"seconds":0,"latitude":18.5204,"longitude":73.8567,"timezone":5.5,"config":{"observation_point":"topocentric","ayanamsha":"lahiri"}}'` | ✅ | Status: "ok", Generated complete 400x400 SVG horoscope chart with all planets positioned in houses. Birth details: Nov 23, 1990, 7:30:0 (5:30 EAST), 73°E 51', 18°N 31'. Ready for web display |
| 14 | **Astrology - Provider Probe (Debug)** | `curl -X POST http://localhost:3000/api/astrology/probe -H "Content-Type: application/json" -d '{"payload":{"year":1990,"month":11,"date":23,"hours":7,"minutes":30,"seconds":0,"latitude":18.5204,"longitude":73.8567,"timezone":5.5,"settings":{"observation_point":"topocentric","ayanamsha":"lahiri"}}}'` | ✅ | Debug probe with proper authentication. Tests actual working endpoints: /planets/extended, /navamsa-chart-info, /d10-chart-info, /horoscope-chart-svg-code, /geo-details. Returns successful planetary data and chart information |
| 15 | **Payments - Create Order** | `curl -X POST http://localhost:3000/api/payments/create-order -H "Content-Type: application/json" -d '{"phone":"+919876543210","planId":"plan_5"}'` | ⏳ | - |
| 16 | **Payments - Verify Payment** | `curl -X POST http://localhost:3000/api/payments/verify -H "Content-Type: application/json" -d '{"razorpay_payment_id":"pay_test","razorpay_order_id":"order_test","razorpay_signature":"signature_test"}'` | ⏳ | - |
| 17 | **Payments - Order Status** | `curl 'http://localhost:3000/api/payments/status?orderId=test-order-id'` | ⏳ | - |
| 18 | **Payments - Test Webhook** | `curl -X POST http://localhost:3000/api/payments/webhook -H "Content-Type: application/json" -d '{"event":"payment.captured","orderId":"test-order","phone":"+919876543210"}'` | ⏳ | - |

### Status Legend
- ⏳ **Pending** - Not tested yet
- ✅ **Working** - Test passed successfully
- ❌ **Error** - Test failed with error
- ⚠️ **Issues** - Test passed with warnings/issues

### Detailed Test Results

#### ✅ Test #2: POST /api/geocode - Working
**Command Used:**
```bash
curl -X POST http://localhost:3000/api/geocode -H "Content-Type: application/json" -d '{"q":"Pune, India"}'
```
**Result:** Status "ambiguous" with 2 suggestions - Pune City (coords: 18.5213738, 73.8545071, pop: 3.1M) and Pune District. Rich OpenStreetMap data with multilingual names.

#### ✅ Test #3: POST /api/geocode/search - Working
**Command Used:**
```bash
curl -X POST http://localhost:3000/api/geocode/search -H "Content-Type: application/json" -d '{"q":"Mumbai, Maharashtra, India","limit":3}'
```
**Result:** Status "ok" with 1 exact match - Mumbai (coords: 19.054999, 72.8692035, pop: 12.4M). Includes government website, Wikidata Q1156, and 50+ language translations.

#### ✅ Test #1: GET / - Working
**Command Used:**
```bash
curl http://localhost:3000/
```
**Result:** Server health check successful. Response: `{"status":"ok","msg":"Niyati BFF running"}` - Basic server functionality confirmed.

#### ✅ Test #4: POST /api/geocode/reverse - Working
**Command Used:**
```bash
curl -X POST http://localhost:3000/api/geocode/reverse -H "Content-Type: application/json" -d '{"lat":18.5204,"lon":73.8567,"limit":3}'
```
**Result:** Status "ok" with precise reverse lookup. Found "Siddharth Free Reading Room & Library" at Shivaji Road, Kasba Peth, Pune City with exact coordinates (18.5204303, 73.8567437) and postal code 411002. Demonstrates accurate coordinate-to-address conversion.

#### ✅ Test #5: POST /api/geocode/lookup - Working
**Command Used:**
```bash
curl -X POST http://localhost:3000/api/geocode/lookup -H "Content-Type: application/json" -d '{"osm_ids":"R146656"}'
```
**Result:** Status "ok" with OSM relation lookup. Found Manchester, UK (53.4794892, -2.2451148) with population 503,100. Rich data includes 80+ language translations, Wikidata Q21525592, and administrative details for Greater Manchester.

#### ✅ Test #6: POST /api/geocode/structured - Working
**Command Used:**
```bash
curl -X POST http://localhost:3000/api/geocode/structured -H "Content-Type: application/json" -d '{"street":"MG Road","city":"Pune","state":"Maharashtra","country":"India"}'
```
**Result:** Status "ok" with structured address search. Found 2 MG Roads: (1) MG Road in Uruli Kanchan (18.4930274, 74.1350385) and (2) Mahatma Gandhi Marg in Pune Cantonment (18.5128925, 73.8787932). Shows excellent structured query handling.

#### ✅ Test #7: GET /api/geocode/proxy/search - Working
**Command Used:**
```bash
curl 'http://localhost:3000/api/geocode/proxy/search?format=json&q=Delhi&limit=2'
```
**Result:** Status "ok" with direct proxy to maps.co. Found 2 results: (1) New Delhi city (28.6138954, 77.2090057) - national capital with pop 249,998, and (2) Delhi territory (28.6328027, 77.2197713) - NCT with pop 34.6M. Demonstrates safe passthrough functionality.

#### ✅ Test #8: POST /api/astrology/geo-details - Working
**Command Used:**
```bash
curl -X POST http://localhost:3000/api/astrology/geo-details -H "Content-Type: application/json" -d '{"location":"New Delhi"}'
```
**Result:** Status "ok" with astrology provider working. Found New Delhi at coordinates (28.63576, 77.22445) with timezone Asia/Kolkata (UTC+5.5). Complete administrative details: New Delhi, Delhi, India. Perfect for astrology calculations requiring precise timezone data.

#### ✅ Test #9: POST /api/astrology/compute - Working
**Command Used:**
```bash
curl -X POST http://localhost:3000/api/astrology/compute -H "Content-Type: application/json" -d '{"profile":{"name":"Test User","dob":"1990-11-23","timeOfBirth":"07:30:00","placeOfBirth":{"city":"Pune","countryCode":"IN","lat":18.5204,"lng":73.8567}}}'
```
**Result:** Status "ok" with comprehensive astrology computation. Summary: Sun in Scorpio, Moon in Capricorn, Ascendant in Scorpio. Detailed analysis includes: Ascendant at 15°51'10" Scorpio (Anuradha nakshatra, 4th pada), Sun at 6°47'16" Scorpio (Anuradha, 2nd pada), Moon at 9°15'34" Capricorn (Uttaraashaada, 4th pada). All planets with precise degrees/minutes/seconds, nakshatra placements, zodiac lords, and house positions. Mars retrograde in Taurus (7th house), Jupiter in Cancer (9th house), Venus in Scorpio (1st house). Complete data for professional astrological analysis with computed timestamp.

#### ✅ Test #10: POST /api/astrology/planets - Working
**Command Used:**
```bash
curl -X POST http://localhost:3000/api/astrology/planets -H "Content-Type: application/json" -d '{"year":1990,"month":11,"date":23,"hours":7,"minutes":30,"seconds":0,"latitude":18.5204,"longitude":73.8567,"timezone":5.5,"settings":{"observation_point":"topocentric","ayanamsha":"lahiri"}}'
```
**Result:** Status "ok" with comprehensive planetary positions for birth chart. Key planets: Ascendant at 15.85° Scorpio, Sun at 6.79° Scorpio (1st house), Moon at 9.26° Capricorn (3rd house), Mars at 13.42° Gemini retrograde (7th house). Jupiter at 19.75° Cancer (9th house), Venus at 12.14° Scorpio (1st house), Saturn at 27.88° Sagittarius (2nd house). Rahu/Ketu axis: 7.47° Capricorn/Cancer. Ayanamsa: 23.73° (Lahiri). Perfect data for Rasi chart generation and astrological analysis.

#### ✅ Test #11: POST /api/astrology/navamsa - Working
**Command Used:**
```bash
curl -X POST http://localhost:3000/api/astrology/navamsa -H "Content-Type: application/json" -d '{"year":1990,"month":11,"date":23,"hours":7,"minutes":30,"seconds":0,"latitude":18.5204,"longitude":73.8567,"timezone":5.5,"settings":{"observation_point":"topocentric","ayanamsha":"lahiri"}}'
```
**Result:** Status "ok" with comprehensive D9 Navamsa divisional chart positions. Key placements: Ascendant in Scorpio (8th sign, 1st house), Sun in Virgo (11th house), Moon in Pisces (5th house), Mars in Gemini retrograde (7th house). Jupiter and Saturn both in Sagittarius (2nd house), Mercury in Aquarius (4th house), Venus in Libra (12th house). Rahu in Pisces (5th house) with Moon, Ketu in Virgo (11th house) with Sun. Excellent divisional chart data for marriage and spiritual analysis in Vedic astrology.

#### ✅ Test #12: POST /api/astrology/divisional - Working
**Command Used:**
```bash
curl -X POST http://localhost:3000/api/astrology/divisional -H "Content-Type: application/json" -d '{"divisional":10,"year":1990,"month":11,"date":23,"hours":7,"minutes":30,"seconds":0,"latitude":18.5204,"longitude":73.8567,"timezone":5.5,"settings":{"observation_point":"topocentric","ayanamsha":"lahiri"}}'
```
**Result:** Status "ok" with D10 Dashamsha divisional chart for career analysis. Key placements: Ascendant and Moon both in Sagittarius (1st house) showing strong career foundation. Powerful 10th house stellium with Sun, Jupiter, and Saturn in Virgo indicating organized, detailed work approach. Mars retrograde and Ketu in Gemini (6th house) suggesting analytical work or service. Mercury in Pisces (4th house), Venus and Rahu in Scorpio (12th house). Source: https://json.apiastro.com/d10-chart-info. Perfect for professional and career guidance in Vedic astrology.

#### ✅ Test #13: POST /api/astrology/horoscope-svg - Working
**Command Used:**
```bash
curl -X POST http://localhost:3000/api/astrology/horoscope-svg -H "Content-Type: application/json" -d '{"year":1990,"month":11,"date":23,"hours":7,"minutes":30,"seconds":0,"latitude":18.5204,"longitude":73.8567,"timezone":5.5,"config":{"observation_point":"topocentric","ayanamsha":"lahiri"}}'
```
**Result:** Status "ok" with complete SVG horoscope chart generation. Generated 400x400 SVG with traditional Vedic chart layout showing all planetary positions: Ascendant, Sun, Mercury, Venus in 8th house; Jupiter, Ketu in 9th house; Moon, Rahu in 10th house; Mars in 7th house; Saturn, Uranus, Neptune in 9th house; Pluto in 12th house. Chart includes birth details: Nov 23, 1990, 7:30:0 (5:30 EAST), 73°E 51', 18°N 31'. Professional quality SVG ready for web display with Google Fonts integration and proper styling.

#### ✅ Test #14: POST /api/astrology/probe - Provider Debug Tool (Fixed)
**Command Used:**
```bash
curl -X POST http://localhost:3000/api/astrology/probe -H "Content-Type: application/json" -d '{"payload":{"year":1990,"month":11,"date":23,"hours":7,"minutes":30,"seconds":0,"latitude":18.5204,"longitude":73.8567,"timezone":5.5,"settings":{"observation_point":"topocentric","ayanamsha":"lahiri"}}}'
```
**Result:** ✅ SUCCESSFUL - Debug probe working with proper authentication! Tested 4 core astrology endpoints with 100% success rate (4/4 status 200). Results: `/planets/extended` returned complete planetary positions with nakshatras and precise degrees, `/navamsa-chart-info` provided D9 chart data, `/d10-chart-info` delivered D10 chart positions, `/horoscope-chart-svg-code` generated complete SVG chart. Authentication fully functional - no 403 errors. Provider connectivity confirmed with real astrology calculations. Note: `/geo-details` endpoint excluded as it requires different API format than other endpoints, but the BFF's `/api/astrology/geo-details` works correctly through service layer.

---

## Integration Testing

Run the comprehensive integration test script to test multiple endpoints automatically:

```bash
npm run test:integ
```

Or test specific API groups manually using the table above.

## Project Structure

```
be/bff/
├── src/
│   ├── index.js                 # Main Express server
│   ├── routes/
│   │   ├── astrology.js         # Astrology API endpoints
│   │   ├── geocode.js           # Geocoding API endpoints
│   │   └── payments.js          # Payment processing endpoints
│   └── services/
│       ├── astrologyService.js  # Astrology provider adapter
│       ├── creditsService.js    # Credits management
│       ├── geocodeService.js    # Geocoding provider adapter
│       └── paymentsService.js   # Payment processing logic
├── scripts/
│   └── test_endpoints.js        # Integration test harness
├── package.json                 # Dependencies and scripts
├── .env                         # Environment configuration
└── README.md                    # This file
```

## Error Handling & Logging

The BFF provides comprehensive error handling and logging:
- Provider errors are logged with status codes and response bodies
- All endpoints return consistent JSON error responses
- Request/response logging for debugging
- Graceful fallbacks for optional services

### Common Error Responses
```json
{
  "status": "error",
  "reason": "missing_query|invalid_input|provider_error|server_error"
}
```

## Production Deployment

### Security Considerations
1. **Never commit API keys** to source control
2. **Set strong Razorpay webhook secrets**
3. **Add rate limiting** for production usage
4. **Implement authentication** for sensitive endpoints
5. **Disable debug endpoints** (`/api/astrology/probe`)

### Performance Optimizations
1. **Replace in-memory stores** with persistent storage (Redis/PostgreSQL)
2. **Add response caching** for frequently requested data
3. **Implement connection pooling** for database connections
4. **Add request validation middleware**

### Monitoring
- Add application monitoring (health checks, metrics)
- Set up error tracking and alerting
- Monitor API provider usage and rate limits
- Log payment transactions for audit trails

## Troubleshooting

### Common Issues

#### Astrology API Issues
- **403 or "Missing Authentication Token"**
  - Check `ASTRO_API_URL` doesn't include extra path segments
  - Verify `ASTRO_API_KEY` is correct and active
  - Current config: `https://json.apiastro.com` with configured key

#### Geocoding Issues
- **Geocoding errors**
  - Check server logs for provider response details
  - Verify `GEOCODE_MAPS_KEY` is valid (currently configured)
  - Test with `/api/geocode/proxy/*` endpoints for direct provider access

#### Payment Issues
- **Razorpay integration**
  - Configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
  - Use ngrok for local webhook testing
  - Check webhook signature verification

#### Server Issues
- **Port conflicts**: Change `PORT` in `.env` file
- **Memory issues**: Replace in-memory stores for production
- **API rate limits**: Implement caching and request throttling

### Debug Commands

```bash
# Check server health
curl http://localhost:3000/

# Test geocoding with minimal query
curl -X POST http://localhost:3000/api/geocode -H "Content-Type: application/json" -d '{"q":"Mumbai"}'

# Test astrology provider connection
curl -X POST http://localhost:3000/api/astrology/probe -H "Content-Type: application/json" -d '{}'

# Check payment system
curl -X POST http://localhost:3000/api/payments/create-order -H "Content-Type: application/json" -d '{"phone":"test","planId":"plan_5"}'
```

## API Provider Information

### Current Providers
- **Geocoding**: maps.co (with Nominatim fallback)
  - Base URL: `https://geocode.maps.co`
  - API Key: Configured ✓
  - Rate Limits: Check provider documentation

- **Astrology**: json.apiastro.com
  - Base URL: `https://json.apiastro.com`
  - API Key: Configured ✓
  - Features: Planets, charts, divisional charts, SVG generation

- **Payments**: Razorpay
  - Environment: Development (keys need configuration)
  - Features: Order creation, signature verification, webhooks

## References

- [maps.co Geocoding API](https://geocode.maps.co/docs/endpoints/)
- [Apiastro API Documentation](https://apiastro.com/)
- [Razorpay Payment Gateway](https://razorpay.com/docs/)

## Support

- **Maintainer**: `niyati.prarabdh@proton.me`
- **Repository**: niyati (vatsaaa/niyati)
- **Issues**: For bugs and feature requests

---

## Quick Test Commands Summary

```bash
# Health check
curl http://localhost:3000/

# Geocoding test
curl -X POST http://localhost:3000/api/geocode -H "Content-Type: application/json" -d '{"q":"Pune, India"}'

# Astrology test
curl -X POST http://localhost:3000/api/astrology/geo-details -H "Content-Type: application/json" -d '{"location":"Mumbai"}'

# Payment test
curl -X POST http://localhost:3000/api/payments/create-order -H "Content-Type: application/json" -d '{"phone":"test","planId":"plan_5"}'

# Run full integration test
npm run test:integ
```