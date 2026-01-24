# Niyati Astrology Application - Functional Specification

## System Architecture Overview

### Components
- **React UI**: Client-facing single-page application
- **Caddy**: Reverse proxy for TLS/HTTP routing and static hosting
- **bff-platform**: Core business logic, NLP processing, birth chart generation
- **bff-auth**: Authentication and user session management
- **PostgreSQL**: Primary relational database
- **n8n**: AI orchestration for astrological query processing
- **Ollama**: Local LLM provider used by n8n
- **Worker**: Background job processor (emails, webhooks, async jobs)
- **Redis**: Queue and cache backing the worker

---

## User Flow Specification

### Phase 1: Initial Access & Authentication

#### Step 1: Landing Page Access
**Action**: User navigates to `http://localhost/`

**Expected Behavior**:
- UI displays landing page with signup/login form
- Form fields visible:
  - Country dropdown (default: INDIA)
  - Phone number input field
  - Consent checkbox with text: "I consent to receive astrological insights and updates"
- "Begin Your Journey" button (disabled until all fields valid)

**Validation Rules**:
- Phone number: Must be 10 digits for INDIA (format: 9992223333)
- Country: Required selection
- Consent: Must be checked to proceed

**Test Assertions**:
- ✓ Page loads successfully (status 200)
- ✓ All form fields are visible and interactive
- ✓ Button remains disabled until validation passes
- ✓ No console errors

---

#### Step 2: User Input
**Action**: User fills form:
- Country: INDIA
- Phone: 9992223333
- Consent: ✓ checked

**Expected Behavior**:
- "Begin Your Journey" button becomes enabled
- Phone number auto-formats as user types (if applicable)
- All validation passes

**Test Assertions**:
- ✓ Button state changes to enabled
- ✓ No validation error messages displayed

---

#### Step 3: Authentication & User Identification

**Step 3.1**: Click "Begin Your Journey"

**Step 3.2**: Backend Processing (bff-auth)

**API Call**: `POST /api/v1/auth/login` or similar endpoint

**Request Payload**:
```json
{
  "phoneNumber": "+919992223333",
  "countryCode": "IN",
  "consent": true,
  "clientInfo": {
    "ip": "203.0.113.45",
    "userAgent": "Mozilla/5.0..."
  }
}
```

**Backend Actions** (bff-auth):

a) **IP Geolocation**:
- Extract user's IP address from request headers
- Call geocoding service using `GEOCODE_MAPS_KEY`
- Determine: city, state, country, timezone, coordinates
- Cache result in Redis (TTL: `GEOCODE_CACHE_TTL` = 86400 seconds)
- Retry logic: max 3 attempts with exponential backoff (400ms to 5000ms)

**Error Handling**:
- If geocoding fails after retries: use default location based on country code
- Log warning but continue authentication flow

b) **User Database Lookup**:
```sql
SELECT 
  id, phone_number, name, birth_date, time_of_birth, 
  place_of_birth, gender, locale, timezone, credits, 
  is_paid, created_at, updated_at, birth_chart_data,
  birth_chart_generated_at
FROM users 
WHERE phone_number = '+919992223333'
```

**Step 3.3**: User Classification Logic

**If User NOT EXISTS in DB** → **NEW USER**:
- Set `is_paid = false`
- Set `credits = 10` (initial free credits)
- User is NOT saved to DB yet (only saved after complete profile)
- Create in-memory session object

**If User EXISTS in DB** → **EXISTING USER**:
- Fetch all profile data from database
- Load credit balance
- Load `is_paid` flag
- Load birth chart data (if exists)

**Response to UI**:
```json
{
  "status": "authenticated",
  "sessionId": "5f8d7a9e-3c2b-4a1b-9f7a-2d6e1b9c4f00",
  "user": {
    "id": "user_9b3d6f2a-...",
    "phoneNumber": "+919992223333",
    "name": null,  // for new user
    "birthDate": null,
    "timeOfBirth": null,
    "placeOfBirth": null,
    "credits": 10,
    "isPaid": false,
    "isNewUser": true,
    "currentLocation": {
      "city": "Mumbai",
      "state": "Maharashtra",
      "country": "India",
      "countryCode": "IN",
      "timezone": "Asia/Kolkata",
      "coordinates": {
        "latitude": 19.0760,
        "longitude": 72.8777
      }
    },
    "birthChartGenerated": false
  },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Test Assertions**:
- ✓ API responds with 200 status
- ✓ Session ID is UUID v4 format
- ✓ Token is valid JWT
- ✓ For new user: `isNewUser: true`, `credits: 10`, `isPaid: false`
- ✓ Current location is populated
- ✓ UI receives and stores authentication data

---

### Phase 2: Profile Display & Initial Interaction

#### Step 4: Profile Section Display

**Step 4.1**: Phone Number Display
**Expected Behavior**:
- Profile section becomes visible on screen
- Phone number "9992223333" (or formatted "+91 999 222 3333") displayed
- Credit balance displayed above profile box: "Credits: 10"

**Step 4.2**: NEW USER - Blank Profile
**Expected Behavior**:
- Name field: Empty/placeholder
- Date of Birth: Empty/placeholder  
- Time of Birth: Empty/placeholder
- Place of Birth: Empty/placeholder
- Gender: Empty/placeholder
- Current Location: Displays "Mumbai, Maharashtra, India"
- Birth Chart Status: "Not Generated"

**Step 4.3**: EXISTING USER - Populated Profile
**Expected Behavior**:
- All fields populated from database
- Birth chart status shows:
  - "Generated on [date]" if exists
  - "Download Chart" button if generated
  - "Not Generated" if never created

**Step 4.4**: Current Location Detection
**Expected Behavior**:
- Current location displayed in dedicated section
- Format: "[City], [State/Region], [Country]"
- Shown separately from "Place of Birth"
- Visual distinction (e.g., "Currently in: Mumbai, Maharashtra, India")

**Step 4.5**: Paid Status Indicator
**Expected Behavior**:
- NEW USER: No explicit "unpaid" label shown
- EXISTING USER (paid): Badge/indicator showing "Premium Member" or similar
- EXISTING USER (unpaid): No badge, but prompt shown after 3 queries

**UI Layout**:
```
┌─────────────────────────────────────┐
│         Credits: 10                 │
├─────────────────────────────────────┤
│  Profile                            │
│  ───────                            │
│  Phone: +91 999 222 3333           │
│  Name: [Empty/Value]                │
│  Date of Birth: [Empty/Value]       │
│  Time of Birth: [Empty/Value]       │
│  Place of Birth: [Empty/Value]      │
│  Gender: [Empty/Value]              │
│                                     │
│  Currently in: Mumbai, India        │
│  Birth Chart: [Status/Download]     │
└─────────────────────────────────────┘
```

**Test Assertions**:
- ✓ Profile section is visible
- ✓ Phone number matches input
- ✓ Credit balance shows "10" for new user
- ✓ Current location is displayed correctly
- ✓ For new user: all profile fields are empty
- ✓ For existing user: all fields populated from DB

---

### Phase 3: Conversational Profile Completion (NEW USER)

#### Step 5: Welcome Message & Profile Collection

**Step 5.1**: NEW USER Welcome Message

**Trigger**: After authentication, if `isNewUser === true`

**Backend Processing** (bff-platform):
- Use NLP.js to generate natural, varied welcome messages
- Message construction rules:
  - No contractions (use "I am" not "I'm", "you are" not "you're")
  - Warm, personal tone
  - Clear request for information
  - First-person perspective as "Niyati"

**Message Generation**:
The bff-platform maintains message templates with NLP.js variations:

```javascript
// Template categories
const welcomeTemplates = [
  "Welcome, I am Niyati! I am your personal astrologer. To create your birth chart and reveal what destiny has in store for you, I need a few details. Could you please tell me your full name, date of birth, time of birth, and place of birth?",
  
  "Hello! My name is Niyati, and I will be guiding you through your astrological journey. To begin, I need to understand the cosmic blueprint you were born under. Please share your full name, birth date, birth time, and the city where you were born.",
  
  "Greetings! I am Niyati, your personal astrology guide. The stars and planets were aligned in a unique way when you entered this world. To map your celestial chart, please provide your name, date of birth, exact time of birth, and your birthplace."
];
```

**Response to UI**:
```json
{
  "type": "assistant_message",
  "message": "Welcome, I am Niyati! I am your personal astrologer. To create your birth chart and reveal what destiny has in store for you, I need a few details. Could you please tell me your full name, date of birth, time of birth, and place of birth?",
  "requiresUserInput": true,
  "expectedInputs": ["name", "birthDate", "timeOfBirth", "placeOfBirth"],
  "creditsDeducted": 0
}
```

**UI Display**:
- Message appears in chat interface
- Typing indicator animation (optional)
- Message attributed to "Niyati" with avatar/icon

---

**Step 5.2**: EXISTING USER Welcome Message

**Trigger**: After authentication, if `isNewUser === false`

**Backend Processing** (bff-platform):
- Fetch user data from session
- Use NLP.js to generate personalized greeting
- Include current location if different from stored location
- Reference user by name

**Message Template Variables**:
```javascript
{
  userName: "Ankur",
  currentCity: "New York",
  currentCountry: "United States",
  lastLoginDate: "2026-01-20",
  daysSinceLastLogin: 3
}
```

**Generated Message Examples**:
```
"Welcome, Ankur! How are you today? I see that you have logged in from New York today. So, how have you been? Tell me how can I be of help for you."

"Hello again, Ankur! It is wonderful to connect with you. I notice you are in New York, United States today. What brings you to me? How may I assist you with your astrological insights?"

"Greetings, Ankur! I hope you are doing well. You are currently in New York. How can I guide you through the cosmic energies surrounding you today?"
```

**Response to UI**:
```json
{
  "type": "assistant_message",
  "message": "Welcome, Ankur! How are you today? I see that you have logged in from New York today. So, how have you been? Tell me how can I be of help for you.",
  "requiresUserInput": true,
  "creditsDeducted": 0
}
```

**Step 5.3**: Contraction Rule Enforcement

**Processing Rule**: Before sending ANY message to UI, bff-platform must:
1. Scan message for contractions using regex pattern
2. Replace all contractions with full forms:

```javascript
const contractionMap = {
  "I'm": "I am",
  "I've": "I have",
  "I'll": "I will",
  "you're": "you are",
  "you've": "you have",
  "you'll": "you will",
  "it's": "it is",
  "that's": "that is",
  "there's": "there is",
  "what's": "what is",
  "can't": "cannot",
  "won't": "will not",
  "don't": "do not",
  "doesn't": "does not",
  "isn't": "is not",
  "aren't": "are not",
  "wasn't": "was not",
  "weren't": "were not",
  "hasn't": "has not",
  "haven't": "have not",
  "hadn't": "had not"
  // ... complete map
};
```

3. Log if contractions detected (for quality monitoring)
4. Return cleaned message

**Test Assertions**:
- ✓ Welcome message displayed in chat
- ✓ Message contains no contractions
- ✓ Message asks for required profile fields
- ✓ Credits remain at 10 (not deducted)

---

**Step 5.4**: Current Location Context

**Already Established**: Yes, from Step 3.2(a)

**Storage**:
- Session object: Contains `currentLocation`
- Redis cache: IP → Location mapping (24hr TTL)
- Not persisted to PostgreSQL for privacy

**Usage**:
- Referenced in welcome messages
- Used for timezone calculations
- Compared with birth location for insights

**Test Assertions**:
- ✓ Current location available in session before message sent
- ✓ Current location displayed in profile section
- ✓ Current location different from "Place of Birth" field

---

### Phase 4: Profile Information Extraction

#### Step 6: Name Extraction

**User Message**: "Hi Niyati, I am Ankur Vatsa"

**Processing Flow**:

1. **Message Received by UI**:
   - User types in chat input
   - Click "Send" or press Enter
   - Message appears in chat history (user bubble)

2. **Sent to bff-platform**:

**API Call**: `POST /api/v1/chat/profile-extract`

**Request**:
```json
{
  "message": "Hi Niyati, I am Ankur Vatsa",
  "sessionId": "5f8d7a9e-3c2b-4a1b-9f7a-2d6e1b9c4f00",
  "extractionType": "profile",
  "metadata": {
    "currentExtractedFields": {},
    "requiredFields": ["name", "birthDate", "timeOfBirth", "placeOfBirth"]
  }
}
```

3. **NLP Processing** (bff-platform):

**NLP.js Name Extraction**:
```javascript
// Named Entity Recognition
const entities = nlp.extract(userMessage, {
  entities: ['PERSON', 'NAME']
});

// Pattern matching for "I am [Name]", "My name is [Name]"
const namePatterns = [
  /I am ([A-Z][a-z]+(?: [A-Z][a-z]+)*)/i,
  /my name is ([A-Z][a-z]+(?: [A-Z][a-z]+)*)/i,
  /call me ([A-Z][a-z]+(?: [A-Z][a-z]+)*)/i,
  /this is ([A-Z][a-z]+(?: [A-Z][a-z]+)*)/i
];

// Extract: "Ankur Vatsa"
```

**Validation**:
- Minimum 2 characters
- Maximum 100 characters
- Contains at least one alphabetic character
- Remove extra whitespace

4. **Response to UI**:

**API Response**:
```json
{
  "type": "profile_update",
  "extractedFields": {
    "name": "Ankur Vatsa"
  },
  "fieldsRemaining": ["birthDate", "timeOfBirth", "placeOfBirth"],
  "profileComplete": false,
  "creditsDeducted": 0,
  "assistantMessage": null  // No automatic reply yet
}
```

5. **UI Updates**:
- Profile section: Name field populated with "Ankur Vatsa"
- No message from Niyati yet (waiting for more fields)
- Credits remain: 10

**Test Assertions**:
- ✓ Message sent successfully
- ✓ Name extracted correctly
- ✓ Profile section updated in real-time
- ✓ Credits not deducted (value still 10)
- ✓ No error messages
- ✓ Message NOT forwarded to n8n

---

#### Step 7: Profile Completion Prompt

**Trigger**: Name extracted successfully

**Backend Processing** (bff-platform):
- Check extracted fields vs required fields
- Generate contextual follow-up message

**Message Generation**:
```javascript
// If only name extracted:
const followUpTemplates = [
  `Hi ${userName}, could you tell me your date of birth, which city and state you were born in, and your time of birth?`,
  
  `Thank you, ${userName}. Now I need to know when and where you entered this world. Please share your birth date, birth time, and birth place.`,
  
  `Nice to meet you, ${userName}! To create your birth chart, I need your date of birth, the exact time you were born, and the city where you were born.`
];
```

**Response to UI**:
```json
{
  "type": "assistant_message",
  "message": "Hi Ankur, could you tell me your date of birth, which city and state you were born in, and your time of birth?",
  "requiresUserInput": true,
  "expectedInputs": ["birthDate", "timeOfBirth", "placeOfBirth"],
  "creditsDeducted": 0
}
```

**UI Display**:
- Message appears in chat (Niyati bubble)
- User can type response

**Test Assertions**:
- ✓ Follow-up message appears automatically
- ✓ Message requests remaining fields
- ✓ No contractions in message
- ✓ Message NOT sent to n8n (comes from bff-platform)

---

#### Step 8: Complete Profile Extraction

**User Message**: "I was born in New Delhi on 19 May 1979 at 7:31 am"

**Processing Flow**:

1. **Message Sent to bff-platform**:

**API Call**: `POST /api/v1/chat/profile-extract`

**Request**:
```json
{
  "message": "I was born in New Delhi on 19 May 1979 at 7:31 am",
  "sessionId": "5f8d7a9e-3c2b-4a1b-9f7a-2d6e1b9c4f00",
  "extractionType": "profile",
  "metadata": {
    "currentExtractedFields": {
      "name": "Ankur Vatsa"
    },
    "requiredFields": ["birthDate", "timeOfBirth", "placeOfBirth"]
  }
}
```

2. **NLP Processing** (bff-platform):

**A) Date Extraction**:
```javascript
// NLP.js date parsing with multiple format support
const datePatterns = [
  /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i,
  /(\d{4})-(\d{2})-(\d{2})/,
  /(\d{1,2})\/(\d{1,2})\/(\d{4})/
];

// Extracted: "19 May 1979"
// Normalized: "1979-05-19"
```

**B) Time Extraction**:
```javascript
// Time pattern matching
const timePatterns = [
  /(\d{1,2}):(\d{2})\s*(am|pm)/i,
  /(\d{1,2}):(\d{2}):(\d{2})\s*(am|pm)?/i,
  /(\d{1,2})\s*(am|pm)/i
];

// Extracted: "7:31 am"
// Normalized to 24hr: "07:31:00"
```

**C) Location Extraction**:
```javascript
// Named Entity Recognition - LOCATION
const locationEntities = nlp.extract(userMessage, {
  entities: ['LOCATION', 'GPE', 'CITY']
});

// Pattern matching: "in [Location]", "from [Location]", "at [Location]"
const locationPatterns = [
  /\b(?:in|from|at)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)*(?:,\s*[A-Z][a-z]+)*)/,
  /\bborn\s+(?:in|at)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)*)/
];

// Extracted: "New Delhi"
```

**D) Geocoding Birth Location**:
```javascript
// Call Geocoding API
const geocodeResult = await geocodeLocation("New Delhi, India");

// Result:
{
  city: "New Delhi",
  state: "Delhi",
  country: "India",
  countryCode: "IN",
  timezone: "Asia/Kolkata",
  coordinates: {
    latitude: 28.6139,
    longitude: 77.2090
  }
}
```

**E) Age & Adult Verification**:
```javascript
const birthDate = new Date("1979-05-19");
const today = new Date("2026-01-23");
const age = calculateAge(birthDate, today);  // 46

const isAdult = age >= 18;  // true

// CRITICAL: If age < 18, block all processing
if (!isAdult) {
  return {
    type: "error",
    message: "I am sorry, but I can only provide astrological services to adults aged 18 and above. Thank you for your understanding.",
    blocked: true
  };
}
```

3. **Database Operations**:

**A) Upsert User Record**:
```sql
INSERT INTO users (
  phone_number, name, birth_date, time_of_birth, 
  place_of_birth, birth_location_data, age, 
  gender, locale, timezone, credits, is_paid, 
  created_at, updated_at
) VALUES (
  '+919992223333', 
  'Ankur Vatsa', 
  '1979-05-19', 
  '07:31:00', 
  'New Delhi, Delhi, India',
  '{"city":"New Delhi","state":"Delhi","country":"India","timezone":"Asia/Kolkata","coordinates":{"lat":28.6139,"lng":77.2090}}'::jsonb,
  46,
  NULL,  -- to be filled later
  'en-IN',
  'Asia/Kolkata',
  10,
  false,
  NOW(),
  NOW()
)
ON CONFLICT (phone_number) 
DO UPDATE SET
  name = EXCLUDED.name,
  birth_date = EXCLUDED.birth_date,
  time_of_birth = EXCLUDED.time_of_birth,
  place_of_birth = EXCLUDED.place_of_birth,
  birth_location_data = EXCLUDED.birth_location_data,
  age = EXCLUDED.age,
  timezone = EXCLUDED.timezone,
  updated_at = NOW()
RETURNING id;
```

**B) Session Update**:
- Update in-memory session with complete user data
- Mark as `profileComplete: true`

4. **Response to UI**:

```json
{
  "type": "profile_update",
  "extractedFields": {
    "name": "Ankur Vatsa",
    "birthDate": "1979-05-19",
    "timeOfBirth": "07:31:00",
    "placeOfBirth": "New Delhi, Delhi, India",
    "age": 46,
    "isAdult": true,
    "timezone": "Asia/Kolkata"
  },
  "fieldsRemaining": [],
  "profileComplete": true,
  "creditsDeducted": 0,
  "assistantMessage": null,  // Will come in next step
  "triggerBirthChart": true
}
```

5. **UI Updates**:
- Profile section: All fields populated
- Date of Birth: "19 May 1979"
- Time of Birth: "07:31 AM"
- Place of Birth: "New Delhi, Delhi, India"
- Age: "46 years"
- Credits remain: 10

**Test Assertions**:
- ✓ All profile fields extracted correctly
- ✓ Date parsed and normalized (YYYY-MM-DD)
- ✓ Time converted to 24-hour format
- ✓ Location geocoded successfully
- ✓ Age calculated correctly
- ✓ User record created/updated in database
- ✓ Profile section shows all data
- ✓ Credits not deducted
- ✓ Message NOT sent to n8n

**Error Handling Test Cases**:
- ✗ If user is minor (age < 18): Block with appropriate message
- ✗ If geocoding fails: Prompt user to clarify location
- ✗ If date format invalid: Ask user to provide in "DD Month YYYY" format
- ✗ If time missing: Prompt specifically for birth time

---

### Phase 5: Birth Chart Generation

**Trigger**: When `profileComplete === true` (after Step 8)

**Processing Flow**:

1. **Automatic Birth Chart Generation**:

**Backend Process** (bff-platform):

**A) Call Astrology API**:
```javascript
// POST to freeastrologyapi.com
const birthChartRequest = {
  year: 1979,
  month: 5,
  day: 19,
  hour: 7,
  min: 31,
  lat: 28.6139,
  lon: 77.2090,
  tzone: 5.5  // Asia/Kolkata offset
};

const apiUrl = process.env.ASTRO_API_URL + '/natal-wheel-chart';
const apiKey = process.env.ASTRO_API_KEY;

const response = await fetch(apiUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey
  },
  body: JSON.stringify(birthChartRequest)
});

const astrologyData = await response.json();
```

**B) Parse Astrological Data**:
```javascript
// Extract planetary positions
const planetaryPositions = {
  sun: { sign: "Taurus", degree: 28.45, house: 1 },
  moon: { sign: "Libra", degree: 12.30, house: 5 },
  mercury: { sign: "Taurus", degree: 15.20, house: 1 },
  venus: { sign: "Aries", degree: 22.10, house: 12 },
  mars: { sign: "Aries", degree: 18.45, house: 12 },
  jupiter: { sign: "Cancer", degree: 5.30, house: 3 },
  saturn: { sign: "Virgo", degree: 20.15, house: 4 },
  rahu: { sign: "Leo", degree: 14.25, house: 3 },
  ketu: { sign: "Aquarius", degree: 14.25, house: 9 }
};

// Extract house cusps
const houses = [
  { number: 1, sign: "Taurus", degree: 10.30 },
  { number: 2, sign: "Gemini", degree: 8.45 },
  // ... all 12 houses
];

// Ascendant (Rising Sign)
const ascendant = { sign: "Taurus", degree: 10.30 };
```

**C) Generate SVG Birth Chart**:
```javascript
// Create circular chart with zodiac wheel
// Place planets at calculated positions
// Draw aspects (conjunctions, trines, squares, etc.)
// Add house divisions

const svgChart = generateBirthChartSVG({
  planets: planetaryPositions,
  houses: houses,
  ascendant: ascendant,
  chartStyle: "north-indian"  // or "south-indian", "western"
});

// SVG is a complete, standalone image
// Size: 800x800px, viewBox optimized for responsive display
```

**D) Store Birth Chart in Database**:
```sql
UPDATE users 
SET 
  birth_chart_data = '{
    "planetaryPositions": {...},
    "houses": [...],
    "ascendant": {...},
    "generatedAt": "2026-01-23T10:15:30.000Z",
    "svgChart": "<svg>...</svg>",
    "apiResponse": {...}
  }'::jsonb,
  birth_chart_generated_at = NOW(),
  updated_at = NOW()
WHERE phone_number = '+919992223333';
```

**E) Cache SVG for Quick Access**:
```javascript
// Store in Redis for 7 days
await redis.setex(
  `birth_chart:${userId}`,
  604800,  // 7 days
  svgChart
);
```

2. **Response to UI**:

```json
{
  "type": "birth_chart_generated",
  "success": true,
  "birthChart": {
    "generatedAt": "2026-01-23T10:15:30.000Z",
    "preview": "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAw...",
    "downloadAvailable": true,
    "downloadCost": 100
  }
}
```

3. **UI Updates**:
- Profile section: "Birth Chart: Generated on 23 Jan 2026"
- Small preview thumbnail of chart visible
- "View Birth Chart" button appears
- "Download Birth Chart (100 credits)" button appears (disabled if credits < 100)

**Test Assertions**:
- ✓ Birth chart generation triggered automatically
- ✓ API call to ASTRO_API successful
- ✓ SVG chart created successfully
- ✓ Data saved to database
- ✓ Profile section updated with generation timestamp
- ✓ Preview thumbnail visible
- ✓ Download button shows correct cost (100 credits)
- ✓ Process completes within 5 seconds

**Error Handling**:
- If ASTRO_API fails: Retry 3 times, then show error message to user
- If API returns invalid data: Log error, notify user generation failed
- If SVG generation fails: Use fallback text-based chart representation

---

#### Step 9: Profile Complete - Readiness Message

**Trigger**: After birth chart generated successfully

**Backend Processing** (bff-platform):

**Message Construction**:
```javascript
// Gather context
const userName = "Ankur";
const currentLocation = "London, United Kingdom";
const credits = 10;
const isPaid = false;

// NLP.js message generation with variables
const messageTemplate = `Hi ${userName}, I now know your name and birth details. I also see that you are in ${currentLocation}. You have ${credits} credits and you can ask questions about what today holds for you. To be able to ask questions about your future, love life, career and more, you will need additional credits.`;

// Apply contraction removal
const finalMessage = removeContractions(messageTemplate);
```

**Rules for Message Construction**:
- Must acknowledge profile completion
- Must mention current location naturally (not forced)
- Must state available credits
- MUST NOT explicitly label user as "non-paid" or "unpaid"
- For non-paid users: Mention limitation subtly (e.g., "to ask about future, you will need additional credits")
- For paid users: Mention freedom to ask any questions
- No contractions

**Message Variations**:

**For Non-Paid User** (credits: 10, isPaid: false):
```
"Hi Ankur, I now know your name and birth details. I also see that you are in London, United Kingdom. You have 10 credits and you can ask questions about what today holds for you. To be able to ask questions about your future, love life, career and more, you will need additional credits."

"Hello Ankur! Your birth chart has been prepared. I notice you are currently in London, United Kingdom. With your 10 credits, you can explore what the stars have aligned for you today. For insights into future dates, relationships, career paths, and deeper guidance, additional credits are available."

"Welcome, Ankur! I have all the details I need. You are connecting from London, United Kingdom today. You have 10 credits available to discover what the cosmic energies hold for you today. Questions about tomorrow and beyond require more credits."
```

**For Paid User** (credits: 150, isPaid: true):
```
"Hi Ankur, I now know your name and birth details. I also see that you are in London, United Kingdom. You have 150 credits available. You can ask me anything about your present, future, love life, career, health, and more. How may I guide you today?"

"Hello Ankur! Your birth chart is ready. I see you are in London, United Kingdom. With 150 credits at your disposal, you can explore any aspect of your life's journey—today, tomorrow, or the years ahead. What would you like to know?"
```

**Response to UI**:
```json
{
  "type": "assistant_message",
  "message": "Hi Ankur, I now know your name and birth details. I also see that you are in London, United Kingdom. You have 10 credits and you can ask questions about what today holds for you. To be able to ask questions about your future, love life, career and more, you will need additional credits.",
  "requiresUserInput": true,
  "creditsDeducted": 0,
  "contextInfo": {
    "profileComplete": true,
    "birthChartGenerated": true,
    "readyForQuestions": true
  }
}
```

**Test Assertions**:
- ✓ Message acknowledges profile completion
- ✓ Message mentions current location correctly
- ✓ Credits (10) mentioned in message
- ✓ Message does NOT explicitly say "you are not a paid user"
- ✓ Message subtly indicates limitation for non-paid users
- ✓ No contractions present
- ✓ Message NOT sent to n8n (from bff-platform)
- ✓ Credits not deducted

---

### Phase 6: Question Classification & Processing

#### Step 10: User Asks First Question

**User Message**: "Yes, tell me what does the future hold for me?"

**Processing Flow**:

**1. Message Received by UI** → **Sent to bff-platform**

**API Call**: `POST /api/v1/chat`

**Request Payload**:
```json
{
  "message": "Yes, tell me what does the future hold for me?",
  "sessionId": "5f8d7a9e-3c2b-4a1b-9f7a-2d6e1b9c4f00",
  "metadata": {
    "user": {
      "id": "user_9b3d6f2a-1c4b-4e2a-a9f1-2b7c8d9e0f11",
      "name": "Ankur Vatsa",
      "phoneNumber": "+919992223333",
      "birthDate": "1979-05-19",
      "timeOfBirth": "07:31:00",
      "placeOfBirth": "New Delhi, Delhi, India",
      "age": 46,
      "isAdult": true,
      "gender": null,
      "locale": "en-IN",
      "timezone": "Asia/Kolkata",
      "location": { 
        "city": "London", 
        "country": "United Kingdom" 
      }
    },
    "profile": {
      "name": "Ankur Vatsa",
      "date_of_birth": "1979-05-19",
      "time_of_birth": "07:31:00",
      "place_of_birth": "New Delhi, Delhi, India",
      "consent_given": true
    },
    "reqId": "req_2a7f5c9b-6d3e-4b2a-a8c2-1f0e9d7c5b88",
    "isSystemContext": false,
    "credits": 10,
    "isPaid": false,
    "source": "niyati-ui",
    "conversationContext": {
      "previousMessages": [
        { "who": "assistant", "text": "Welcome, I am Niyati...", "ts": "2026-01-23T08:10:01.000Z" },
        { "who": "user", "text": "Hi Niyati, I am Ankur Vatsa", "ts": "2026-01-23T08:10:45.000Z" },
        { "who": "user", "text": "I was born in New Delhi on 19 May 1979 at 7:31 am", "ts": "2026-01-23T08:11:30.000Z" },
        { "who": "assistant", "text": "Hi Ankur, I now know your name...", "ts": "2026-01-23T08:12:15.000Z" }
      ]
    }
  }
}
```

**2. Question Classification** (bff-platform using NLP.js):

**NLP.js Analysis**:
```javascript
// A) Temporal Analysis
const temporalKeywords = {
  today: ['today', 'now', 'currently', 'present', 'this moment', 'right now'],
  future: ['future', 'tomorrow', 'next week', 'next month', 'next year', 'coming days', 'ahead', 'later', 'soon', 'will'],
  specific_dates: /\b(january|february|march|...|monday|tuesday|...|\d{1,2}\/\d{1,2}\/\d{2,4})\b/i
};

// B) Topic Analysis
const topicKeywords = {
  career: ['career', 'job', 'work', 'profession', 'business', 'promotion', 'interview', 'employment', 'salary', 'income'],
  love: ['love', 'relationship', 'marriage', 'partner', 'romance', 'dating', 'soulmate', 'spouse', 'wedding'],
  health: ['health', 'illness', 'disease', 'medical', 'wellness', 'fitness', 'body', 'mental health'],
  finance: ['money', 'wealth', 'finance', 'investment', 'savings', 'debt', 'financial', 'prosperity'],
  general: ['future', 'life', 'destiny', 'fate', 'fortune', 'luck', 'stars']
};

// C) Analyze user message
const userMessage = "Yes, tell me what does the future hold for me?";

// Tokenization and entity extraction
const tokens = nlp.tokenize(userMessage.toLowerCase());
const intents = nlp.classify(userMessage);

// Results:
const classification = {
  timeScope: 'future',  // contains "future" keyword
  topics: ['general'],  // general question about future
  isPremium: true,      // NOT about today
  specificity: 'vague'  // no specific date or topic
};
```

**3. Credit & Access Check** (bff-platform):

```javascript
// Decision tree
const credits = 10;
const isPaid = false;
const timeScope = 'future';  // from classification

// Rule evaluation
if (timeScope === 'today') {
  // TODAY questions: allowed for both paid and non-paid
  // Cost: 2 credits
  if (credits >= 2) {
    action = 'FORWARD_TO_N8N';
    creditsToDeduct = 2;
  } else {
    action = 'INSUFFICIENT_CREDITS';
  }
} else if (timeScope === 'future' || timeScope === 'specific_date') {
  // FUTURE/PREMIUM questions
  if (isPaid) {
    // Paid users can ask premium questions
    // Cost: 3 credits
    if (credits >= 3) {
      action = 'FORWARD_TO_N8N';
      creditsToDeduct = 3;
    } else {
      action = 'INSUFFICIENT_CREDITS';
    }
  } else {
    // Non-paid users: blocked from premium questions
    action = 'PROMPT_UPGRADE';
    creditsToDeduct = 0;
  }
}

// In this case:
// isPaid = false, timeScope = 'future'
// Result: action = 'PROMPT_UPGRADE'
```

**4. Response to UI** (BLOCKED - Non-paid user asking premium question):

```json
{
  "type": "assistant_message",
  "message": "I would love to share insights about your future with you, Ankur. However, questions about future dates, career paths, love life, and other life areas beyond today require premium access. You can add credits to your account to unlock these deeper astrological insights. Would you like to know about what today holds for you instead?",
  "requiresUserInput": true,
  "creditsDeducted": 0,
  "blocked": true,
  "blockReason": "premium_question_non_paid_user",
  "suggestedAction": "upgrade",
  "alternativeOffer": "ask_about_today"
}
```

**Alternative Message Variations** (NLP.js generated):
```
"Questions about the future are part of our premium service, Ankur. With additional credits, I can guide you through what lies ahead in your career, relationships, and life journey. For now, I can tell you about the energies surrounding you today. What would you prefer?"

"I am here to help you understand your future, Ankur. To provide insights beyond today, you will need to add credits to your account. Would you like to explore what today has in store for you, or would you like to learn about adding credits?"

"Ankur, I would be delighted to answer your question about the future once you have premium access. Adding credits will unlock guidance on your career, love life, health, and any future dates. Shall I tell you about today first?"
```

**UI Display**:
- Message appears from Niyati
- Credits remain: 10 (not deducted)
- Optional: Display "Add Credits" button/link prominently

**Test Assertions**:
- ✓ Message classified as "future" / "premium"
- ✓ Non-paid user + premium question = blocked
- ✓ Response from bff-platform (NOT from n8n)
- ✓ Credits NOT deducted (still 10)
- ✓ Message suggests alternative (asking about today)
- ✓ Message does not say "you are not a paid user" explicitly
- ✓ No contractions in response

---

#### Step 11: User Asks About Today (Allowed Question)

**User Message**: "Okay, what does today hold for me?"

**Processing Flow**:

**1. Question Classification** (bff-platform):

```javascript
const userMessage = "Okay, what does today hold for me?";

const classification = {
  timeScope: 'today',   // contains "today" keyword
  topics: ['general'],
  isPremium: false,     // about today
  specificity: 'daily_reading'
};

// Credit check
const credits = 10;
const isPaid = false;
const requiredCredits = 2;  // TODAY questions cost 2 credits

if (credits >= requiredCredits) {
  action = 'FORWARD_TO_N8N';
} else {
  action = 'INSUFFICIENT_CREDITS';
}

// Result: FORWARD_TO_N8N
```

**2. Deduct Credits BEFORE Forwarding**:

```sql
-- Atomic credit deduction
UPDATE users 
SET 
  credits = credits - 2,
  updated_at = NOW()
WHERE 
  id = 'user_9b3d6f2a-1c4b-4e2a-a9f1-2b7c8d9e0f11'
  AND credits >= 2  -- Prevent negative balance
RETURNING credits;

-- Result: credits = 8
```

**Session Update**:
```javascript
session.user.credits = 8;
session.questionsAsked = (session.questionsAsked || 0) + 1;
```

**3. Prepare Canonical Payload for n8n**:

```json
{
  "message": "Okay, what does today hold for me?",
  "sessionId": "5f8d7a9e-3c2b-4a1b-9f7a-2d6e1b9c4f00",
  "metadata": {
    "user": {
      "id": "user_9b3d6f2a-1c4b-4e2a-a9f1-2b7c8d9e0f11",
      "name": "Ankur Vatsa",
      "phoneNumber": "+919992223333",
      "birthDate": "1979-05-19",
      "timeOfBirth": "07:31:00",
      "placeOfBirth": "New Delhi, Delhi, India",
      "age": 46,
      "isAdult": true,
      "gender": null,
      "locale": "en-IN",
      "timezone": "Asia/Kolkata",
      "location": { 
        "city": "London", 
        "country": "United Kingdom" 
      },
      "preferences": { 
        "tone": "warm", 
        "responseLength": "medium" 
      }
    },
    "session": {
      "id": "5f8d7a9e-3c2b-4a1b-9f7a-2d6e1b9c4f00",
      "startedAt": "2026-01-23T08:10:00.000Z"
    },
    "reqId": "req_3b8g6d2c-7e4f-5c3b-b9d3-2g1f0e8d6c99",
    "source": "bff-platform",
    "isSystemContext": false,
    "credits": 8,
    "isPaid": false
  }
}
```

**Note**: As per your specification, `timeOfBirth` and `placeOfBirth` ARE included in the canonical payload sent to n8n.

**4. Forward to n8n**:

**API Call**: `POST http://n8n:5678/webhook/chat`

**Headers**:
```
Content-Type: application/json
Authorization: Bearer <SERVICE_TOKEN>
User-Agent: bff-platform/1.0
```

**n8n Webhook receives payload and processes**:
- Ollama LLM analyzes the question
- Generates astrological reading for today
- Uses birth chart data + current planetary transits
- Personalizes response based on user profile

**5. n8n Response** (example):

```json
{
  "success": true,
  "response": "Good morning, Ankur! Today, the Sun is transiting through your tenth house of career and public image, bringing opportunities for recognition. With Venus in harmonious aspect to your natal Moon, your emotional intelligence will be heightened. This is an excellent day for networking and building professional relationships. However, Mars in your third house suggests you should be mindful of how you communicate—choose your words carefully to avoid misunderstandings. Overall, the cosmic energies favor progress in your professional life, but patience in communication is key.",
  "metadata": {
    "readingType": "daily",
    "planetsAnalyzed": ["Sun", "Moon", "Venus", "Mars"],
    "significantTransits": [
      "Sun in 10th house",
      "Venus trine natal Moon",
      "Mars in 3rd house"
    ],
    "generatedAt": "2026-01-23T10:20:45.000Z"
  }
}
```

**6. bff-platform receives n8n response and forwards to UI**:

```json
{
  "type": "assistant_message",
  "message": "Good morning, Ankur! Today, the Sun is transiting through your tenth house of career and public image, bringing opportunities for recognition. With Venus in harmonious aspect to your natal Moon, your emotional intelligence will be heightened. This is an excellent day for networking and building professional relationships. However, Mars in your third house suggests you should be mindful of how you communicate—choose your words carefully to avoid misunderstandings. Overall, the cosmic energies favor progress in your professional life, but patience in communication is key.",
  "requiresUserInput": false,
  "creditsDeducted": 2,
  "creditsRemaining": 8,
  "questionType": "daily_reading",
  "source": "n8n"
}
```

**7. UI Updates**:
- Message displayed in chat (Niyati bubble)
- Credits updated: 8 (was 10, now 8)
- Credit display updates in real-time

**Test Assertions**:
- ✓ Question classified as "today"
- ✓ Credits checked (sufficient: 10 >= 2)
- ✓ Credits deducted BEFORE API call (10 → 8)
- ✓ Canonical payload constructed correctly
- ✓ Payload sent to n8n webhook
- ✓ Authorization header included
- ✓ n8n response received successfully
- ✓ Response displayed in UI
- ✓ Credit balance updated in UI (shows 8)
- ✓ No errors in console

---

#### Step 12: Premium User Experience

**Scenario 1: Paid User Asking Premium Question**

**User Profile**:
- Name: Priya Sharma
- Credits: 150
- isPaid: true

**User Message**: "What does my career look like next month?"

**Processing Flow**:

**1. Question Classification**:
```javascript
const classification = {
  timeScope: 'future',      // "next month"
  topics: ['career'],
  isPremium: true,
  specificity: 'career_forecast'
};
```

**2. Access Check**:
```javascript
const isPaid = true;
const credits = 150;
const requiredCredits = 3;  // Premium questions cost 3 credits

if (isPaid && credits >= requiredCredits) {
  action = 'FORWARD_TO_N8N';
  creditsToDeduct = 3;
} else if (!isPaid) {
  action = 'PROMPT_UPGRADE';
} else {
  action = 'INSUFFICIENT_CREDITS';
}

// Result: FORWARD_TO_N8N
```

**3. Credit Deduction**:
```sql
UPDATE users 
SET credits = credits - 3, updated_at = NOW()
WHERE id = 'user_priya123' AND credits >= 3
RETURNING credits;
-- Result: credits = 147
```

**4. Forward to n8n** → **Receive Response** → **Display**

**UI Shows**:
- Astrological reading for career in February 2026
- Credits: 147 (was 150)

**Test Assertions**:
- ✓ Paid user can ask premium questions
- ✓ Premium question costs 3 credits
- ✓ Credits deducted correctly (150 → 147)
- ✓ Message forwarded to n8n
- ✓ Response received and displayed

---

**Scenario 2: Non-Paid User with Low Credits**

**User Profile**:
- Name: Ankur Vatsa  
- Credits: 4
- isPaid: false
- Questions asked in session: 3

**User Message**: "Tell me about today's energy."

**Processing Flow**:

**1. Low Credit Warning Check**:
```javascript
const credits = 4;
const warningThreshold = 5;
const questionsAnswered = 3;
const upgradePromptThreshold = 3;

const shouldShowLowCreditWarning = credits < warningThreshold;
const shouldShowUpgradePrompt = questionsAnswered >= upgradePromptThreshold;

// Both conditions met
```

**2. Process Question** (it is about today, so allowed):
- Deduct 2 credits (4 → 2)
- Forward to n8n
- Get response

**3. Response with Warning**:
```json
{
  "type": "assistant_message",
  "message": "[Astrological reading content...]",
  "creditsDeducted": 2,
  "creditsRemaining": 2,
  "warnings": [
    {
      "type": "low_credits",
      "message": "You have only 2 credits remaining. Consider adding more credits to continue receiving insights."
    },
    {
      "type": "upgrade_suggestion",
      "message": "You have received 3 insightful readings! Become a premium member to unlock questions about your future, career, love life, and much more. Add credits to your account now."
    }
  ]
}
```

**UI Display**:
- Shows astrological reading
- Displays warning banner: "⚠️ Low Credits: You have 2 credits left"
- Shows upgrade prompt after message: "✨ Unlock Your Full Potential - Upgrade to Premium"
- "Add Credits" button prominent

**Test Assertions**:
- ✓ Question processed successfully
- ✓ Credits deducted (4 → 2)
- ✓ Low credit warning displayed (credits < 5)
- ✓ Upgrade prompt shown (3 questions answered)
- ✓ Response still delivered (not blocked)

---

#### Step 13: Birth Chart Download

**User Message**: "Can I download my birth chart?"

**Processing Flow**:

**1. Request Classification**:
```javascript
const intent = nlp.classify("Can I download my birth chart?");
// Result: intent = 'download_birth_chart'
```

**2. Check Birth Chart Availability**:
```javascript
const user = await db.query(
  'SELECT birth_chart_data, birth_chart_generated_at FROM users WHERE id = ?',
  [userId]
);

if (!user.birth_chart_data) {
  action = 'CHART_NOT_GENERATED';
} else {
  action = 'PROCESS_DOWNLOAD_REQUEST';
}
```

**3. Credit Check**:
```javascript
const downloadCost = 100;  // credits
const currentCredits = 2;

if (currentCredits >= downloadCost) {
  action = 'ALLOW_DOWNLOAD';
} else {
  action = 'INSUFFICIENT_CREDITS_FOR_DOWNLOAD';
}

// Result: INSUFFICIENT_CREDITS_FOR_DOWNLOAD
```

**4. Response to User**:
```json
{
  "type": "assistant_message",
  "message": "I have your birth chart ready, Ankur. Downloading the birth chart requires 100 credits. You currently have 2 credits. Would you like to add credits to your account to download your personalized birth chart?",
  "requiresUserInput": true,
  "creditsDeducted": 0,
  "action": {
    "type": "download_blocked",
    "reason": "insufficient_credits",
    "required": 100,
    "available": 2,
    "shortfall": 98
  }
}
```

**Scenario: User with Sufficient Credits**:

**User Profile**: Credits = 150

**Processing**:
```javascript
// Deduct credits
await db.query(
  'UPDATE users SET credits = credits - 100 WHERE id = ? AND credits >= 100',
  [userId]
);

// Retrieve SVG from cache or DB
const svgChart = await redis.get(`birth_chart:${userId}`) || 
                 user.birth_chart_data.svgChart;

// Generate downloadable PDF
const pdfBuffer = await generatePDF({
  svg: svgChart,
  userData: {
    name: user.name,
    birthDate: user.birth_date,
    timeOfBirth: user.time_of_birth,
    placeOfBirth: user.place_of_birth
  },
  generatedAt: user.birth_chart_generated_at
});

// Create secure download token
const downloadToken = jwt.sign(
  { userId, fileType: 'birth_chart', expiresIn: '1h' },
  process.env.ACCESS_TOKEN_SECRET
);
```

**Response**:
```json
{
  "type": "download_ready",
  "message": "Your birth chart is ready for download, Ankur. I have prepared a detailed PDF with your complete astrological chart.",
  "creditsDeducted": 100,
  "creditsRemaining": 50,
  "download": {
    "url": "/api/v1/download/birth-chart?token=eyJhbGc...",
    "filename": "BirthChart_AnkurVatsa_19May1979.pdf",
    "expiresAt": "2026-01-23T11:20:45.000Z"
  }
}
```

**UI Action**:
- Trigger browser download automatically
- Show success message
- Update credit display (150 → 50)

**Test Assertions**:
- ✓ Download request classified correctly
- ✓ Credit requirement enforced (100 credits)
- ✓ Insufficient credits blocked with clear message
- ✓ Sufficient credits allow download
- ✓ Credits deducted (150 → 50)
- ✓ PDF generated successfully
- ✓ Download URL secured with token
- ✓ Token expires in 1 hour

---

### Phase 7: Advanced Question Handling

#### Question Type Matrix

| Question Type | Time Scope | User Type | Credits | Allowed | Forwarded to n8n |
|--------------|------------|-----------|---------|---------|------------------|
| "What about today?" | Today | Non-paid | 2 | ✓ Yes | ✓ Yes |
| "What about today?" | Today | Paid | 2 | ✓ Yes | ✓ Yes |
| "Career next month?" | Future | Non-paid | N/A | ✗ No | ✗ No (blocked) |
| "Career next month?" | Future | Paid | 3 | ✓ Yes | ✓ Yes |
| "Love life tomorrow?" | Future | Non-paid | N/A | ✗ No | ✗ No (blocked) |
| "Love life tomorrow?" | Future | Paid | 3 | ✓ Yes | ✓ Yes |
| "Health this week?" | Future | Non-paid | N/A | ✗ No | ✗ No (blocked) |
| "Health this week?" | Future | Paid | 3 | ✓ Yes | ✓ Yes |
| Download chart | N/A | Any | 100 | If credits | No (bff-platform) |

---

#### Complex Question Examples

**Example 1: Multi-Topic Question**

**User Message**: "How will my career and love life be next week?"

**Classification**:
```javascript
{
  timeScope: 'future',        // "next week"
  topics: ['career', 'love'],  // multiple topics
  isPremium: true,
  specificity: 'multi_topic_forecast'
}
```

**Credit Cost**: 3 credits (same as single-topic premium)

**Access Logic**: Same as premium questions

---

**Example 2: Ambiguous Time Reference**

**User Message**: "When will I get married?"

**Classification**:
```javascript
{
  timeScope: 'future',  // implicit future (no date specified)
  topics: ['love', 'marriage'],
  isPremium: true,
  specificity: 'life_event_prediction'
}
```

**Access Logic**: Treated as premium question

---

**Example 3: Past Events**

**User Message**: "Why did I lose my job last year?"

**Classification**:
```javascript
{
  timeScope: 'past',
  topics: ['career'],
  isPremium: false,  // analyzing past is allowed
  specificity: 'past_event_analysis'
}
```

**Credit Cost**: 2 credits (similar to "today" questions)

**Access Logic**: Allowed for both paid and non-paid users

---

### Phase 8: Error Handling & Edge Cases

#### Error Scenario 1: n8n Unavailable

**Trigger**: n8n service down or not responding

**Detection**:
```javascript
try {
  const response = await fetch(n8nWebhookUrl, {
    method: 'POST',
    headers: {...},
    body: JSON.stringify(canonicalPayload),
    timeout: 30000  // 30 second timeout
  });
} catch (error) {
  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
    // n8n unavailable
  }
}
```

**Handling**:
1. **Retry Logic**: 3 attempts with exponential backoff
2. **If still fails**: 
   - Refund credits to user
   - Send fallback response from bff-platform

**Fallback Response**:
```json
{
  "type": "assistant_message",
  "message": "I apologize, Ankur. I am currently experiencing technical difficulties connecting to my astrological calculation engine. Your credits have been refunded. Please try again in a few moments.",
  "creditsDeducted": 0,
  "creditsRefunded": 2,
  "error": true,
  "errorType": "service_unavailable"
}
```

**Test Assertions**:
- ✓ Timeout detected after 30 seconds
- ✓ Retry attempted 3 times
- ✓ Credits refunded automatically
- ✓ Fallback message displayed
- ✓ Error logged for monitoring

---

#### Error Scenario 2: Geocoding Failure

**Trigger**: User provides birth place that cannot be geocoded

**User Message**: "I was born in Xyzville on 10 Jan 1990 at 3pm"

**Processing**:
```javascript
const birthPlace = "Xyzville";
const geocodeResult = await geocodeLocation(birthPlace);

if (!geocodeResult || geocodeResult.error) {
  // Geocoding failed
}
```

**Response**:
```json
{
  "type": "clarification_needed",
  "message": "I could not locate 'Xyzville' in my geographical database, Ankur. Could you please provide more details? For example, which state or country is it in? Or perhaps the nearest major city?",
  "requiresUserInput": true,
  "field": "placeOfBirth",
  "error": "geocoding_failed"
}
```

**Retry Flow**:
- User provides clarification: "It's near Mumbai, India"
- System attempts geocoding with "Mumbai, India"
- If successful, uses Mumbai coordinates
- Stores clarified location

**Test Assertions**:
- ✓ Geocoding failure detected
- ✓ User prompted for clarification
- ✓ Profile NOT saved until location resolved
- ✓ Retry with corrected location successful

---

#### Error Scenario 3: Minor User Detected

**Trigger**: User provides birth date showing age < 18

**User Message**: "I was born on 5 January 2010"

**Age Calculation**:
```javascript
const birthDate = new Date('2010-01-05');
const today = new Date('2026-01-23');
const age = calculateAge(birthDate, today);  // 16

if (age < 18) {
  // BLOCK ALL PROCESSING
}
```

**Response**:
```json
{
  "type": "blocked",
  "message": "I am sorry, but I can only provide astrological services to adults aged 18 and above. Thank you for your understanding.",
  "blocked": true,
  "blockReason": "user_is_minor",
  "sessionTerminated": true
}
```

**UI Action**:
- Display message
- Disable all input fields
- Clear session data
- Redirect to landing page after 5 seconds

**Test Assertions**:
- ✓ Age < 18 detected
- ✓ All processing blocked
- ✓ Appropriate message displayed
- ✓ Profile NOT saved to database
- ✓ Session terminated
- ✓ User cannot proceed

---

#### Error Scenario 4: Database Connection Lost

**Trigger**: PostgreSQL connection failure

**Detection**:
```javascript
try {
  await db.query('SELECT 1');
} catch (error) {
  if (error.code === 'ECONNREFUSED' || error.code === '57P01') {
    // Database unavailable
  }
}
```

**Handling**:
1. **Connection Pool Retry**: Automatic reconnection (handled by pg library)
2. **If persistent failure**:
   - Return error to UI
   - Do NOT deduct credits
   - Log critical error for alerting

**Response**:
```json
{
  "type": "system_error",
  "message": "I apologize, but I am experiencing technical difficulties. Please try again in a few moments. Your credits have not been affected.",
  "error": true,
  "errorType": "database_unavailable",
  "retryAfter": 60
}
```

**Test Assertions**:
- ✓ Database failure detected
- ✓ No credit deduction
- ✓ Error message displayed
- ✓ Critical alert triggered
- ✓ Retry suggested after 60 seconds

---

#### Error Scenario 5: Insufficient Credits Mid-Session

**Scenario**: User has 1 credit, asks a question requiring 2 credits

**User Message**: "What about today?"

**Processing**:
```javascript
const credits = 1;
const requiredCredits = 2;

if (credits < requiredCredits) {
  action = 'INSUFFICIENT_CREDITS';
}
```

**Response**:
```json
{
  "type": "assistant_message",
  "message": "You have 1 credit remaining, which is not enough to answer this question. Questions about today require 2 credits. Would you like to add more credits to continue?",
  "creditsDeducted": 0,
  "blocked": true,
  "blockReason": "insufficient_credits",
  "suggestedAction": "add_credits"
}
```

**UI Display**:
- Shows message
- Displays prominent "Add Credits" button
- Credits remain at 1 (not deducted)

**Test Assertions**:
- ✓ Insufficient credits detected
- ✓ Question blocked
- ✓ Credits NOT deducted
- ✓ Clear message about requirement
- ✓ Upgrade path offered

---

### Phase 9: Session Management & Persistence

#### Session Lifecycle

**Session Creation** (Step 3):
```javascript
const session = {
  id: uuidv4(),
  userId: 'user_9b3d6f2a-...',
  startedAt: new Date(),
  expiresAt: new Date(Date.now() + parseInt(process.env.REFRESH_TOKEN_TTL_MS)),
  user: { ...userData },
  conversationHistory: [],
  questionsAsked: 0,
  creditsUsedThisSession: 0
};

// Store in Redis
await redis.setex(
  `session:${session.id}`,
  parseInt(process.env.REFRESH_TOKEN_TTL_MS) / 1000,
  JSON.stringify(session)
);
```

**Session Duration**: 
- TTL: `REFRESH_TOKEN_TTL_MS = 2592000000` (30 days)
- Sliding expiration: Each activity extends TTL

**Session Storage**:
- Redis: Active session data (fast access)
- PostgreSQL: User profile data (persistent)

---

#### Conversation History

**Stored in Session**:
```javascript
session.conversationHistory = [
  {
    who: 'assistant',
    text: 'Welcome, I am Niyati!...',
    timestamp: '2026-01-23T08:10:01.000Z',
    type: 'greeting'
  },
  {
    who: 'user',
    text: 'Hi Niyati, I am Ankur Vatsa',
    timestamp: '2026-01-23T08:10:45.000Z',
    type: 'profile_input'
  },
  {
    who: 'user',
    text: 'What does today hold for me?',
    timestamp: '2026-01-23T08:15:30.000Z',
    type: 'question',
    creditsDeducted: 2
  },
  {
    who: 'assistant',
    text: 'Good morning, Ankur! Today, the Sun is transiting...',
    timestamp: '2026-01-23T08:15:45.000Z',
    type: 'astrological_reading',
    source: 'n8n'
  }
];
```

**Sent to n8n in Context** (last 5 messages):
```javascript
const recentMessages = session.conversationHistory.slice(-5);

canonicalPayload.metadata.conversationContext = {
  previousMessages: recentMessages,
  memoryHints: extractMemoryHints(recentMessages)
};
```

---

#### Logout Functionality

**User Action**: Click "Logout" button

**API Call**: `POST /api/v1/auth/logout`

**Backend Processing**:
```javascript
// Invalidate session
await redis.del(`session:${sessionId}`);

// Optionally: Save conversation to database for history
await db.query(
  'INSERT INTO conversation_logs (user_id, session_id, messages, ended_at) VALUES (?, ?, ?, NOW())',
  [userId, sessionId, JSON.stringify(conversationHistory)]
);
```

**Response**:
```json
{
  "status": "logged_out",
  "message": "You have been successfully logged out. See you soon!"
}
```

**UI Action**:
- Clear local storage
- Clear session data
- Redirect to landing page

**Test Assertions**:
- ✓ Session invalidated in Redis
- ✓ Conversation saved to database
- ✓ UI cleared
- ✓ Redirect successful

---

### Phase 10: Testing Strategy for Playwright

#### Test Suite Structure

```
tests/
├── e2e/
│   ├── 01-authentication/
│   │   ├── new-user-signup.spec.js
│   │   ├── existing-user-login.spec.js
│   │   ├── invalid-phone.spec.js
│   │   └── minor-user-blocked.spec.js
│   ├── 02-profile/
│   │   ├── profile-extraction.spec.js
│   │   ├── partial-profile.spec.js
│   │   ├── geocoding-failure.spec.js
│   │   └── birth-chart-generation.spec.js
│   ├── 03-questions/
│   │   ├── today-question-nonpaid.spec.js
│   │   ├── today-question-paid.spec.js
│   │   ├── future-question-blocked.spec.js
│   │   ├── future-question-paid.spec.js
│   │   ├── multi-topic-question.spec.js
│   │   └── past-event-question.spec.js
│   ├── 04-credits/
│   │   ├── credit-deduction.spec.js
│   │   ├── low-credit-warning.spec.js
│   │   ├── insufficient-credits.spec.js
│   │   └── upgrade-prompt.spec.js
│   ├── 05-downloads/
│   │   ├── birth-chart-download.spec.js
│   │   ├── insufficient-credits-download.spec.js
│   │   └── download-not-generated.spec.js
│   ├── 06-errors/
│   │   ├── n8n-unavailable.spec.js
│   │   ├── database-failure.spec.js
│   │   ├── api-timeout.spec.js
│   │   └── network-failure.spec.js
│   └── 07-session/
│       ├── session-persistence.spec.js
│       ├── session-expiry.spec.js
│       └── logout.spec.js
```

---

#### Critical Test Cases

**Test 1: New User Complete Flow**
```javascript
test('New user signup, profile completion, and first question', async ({ page }) => {
  // Navigate to landing page
  await page.goto('http://localhost/');
  
  // Fill signup form
  await page.selectOption('[data-testid="country-select"]', 'INDIA');
  await page.fill('[data-testid="phone-input"]', '9992223333');
  await page.check('[data-testid="consent-checkbox"]');
  
  // Verify button enabled
  await expect(page.locator('[data-testid="begin-journey-btn"]')).toBeEnabled();
  
  // Click Begin Journey
  await page.click('[data-testid="begin-journey-btn"]');
  
  // Wait for profile section
  await expect(page.locator('[data-testid="profile-section"]')).toBeVisible();
  
  // Verify phone displayed
  await expect(page.locator('[data-testid="profile-phone"]')).toHaveText('9992223333');
  
  // Verify credits
  await expect(page.locator('[data-testid="credit-balance"]')).toHaveText('10');
  
  // Verify welcome message
  await expect(page.locator('[data-testid="chat-messages"]'))
    .toContainText('Welcome, I am Niyati');
  
  // Input name
  await page.fill('[data-testid="chat-input"]', 'Hi Niyati, I am Ankur Vatsa');
  await page.click('[data-testid="send-btn"]');
  
  // Verify name extracted
  await expect(page.locator('[data-testid="profile-name"]')).toHaveText('Ankur Vatsa');
  
  // Verify credits not deducted
  await expect(page.locator('[data-testid="credit-balance"]')).toHaveText('10');
  
  // Input birth details
  await page.fill('[data-testid="chat-input"]', 'I was born in New Delhi on 19 May 1979 at 7:31 am');
  await page.click('[data-testid="send-btn"]');
  
  // Wait for profile completion
  await page.waitForTimeout(2000);
  
  // Verify all profile fields
  await expect(page.locator('[data-testid="profile-dob"]')).toHaveText('19 May 1979');
  await expect(page.locator('[data-testid="profile-tob"]')).toHaveText('07:31 AM');
  await expect(page.locator('[data-testid="profile-pob"]')).toHaveText(/New Delhi/);
  
  // Verify birth chart status
  await expect(page.locator('[data-testid="birth-chart-status"]')).toContainText('Generated');
  
  // Verify readiness message
  await expect(page.locator('[data-testid="chat-messages"]'))
    .toContainText('I now know your name and birth details');
  
  // Ask today question
  await page.fill('[data-testid="chat-input"]', 'What does today hold for me?');
  await page.click('[data-testid="send-btn"]');
  
  // Wait for response
  await page.waitForResponse(response => 
    response.url().includes('/api/v1/chat') && response.status() === 200
  );
  
  // Verify credits deducted
  await expect(page.locator('[data-testid="credit-balance"]')).toHaveText('8');
  
  // Verify response received
  await expect(page.locator('[data-testid="chat-messages"]').last())
    .toContainText(/Sun|Moon|Venus|Mars/);  // Contains astrological content
});
```

---

**Test 2: Non-Paid User Premium Question Blocked**
```javascript
test('Non-paid user blocked from asking premium question', async ({ page }) => {
  // Setup: Login as non-paid user with existing profile
  await loginAsUser(page, {
    phone: '9992223333',
    isPaid: false,
    credits: 10
  });
  
  // Ask future question
  await page.fill('[data-testid="chat-input"]', 'What does my career look like next month?');
  await page.click('[data-testid="send-btn"]');
  
  // Verify blocked message
  await expect(page.locator('[data-testid="chat-messages"]').last())
    .toContainText(/premium|credits|upgrade/i);
  
  // Verify credits NOT deducted
  await expect(page.locator('[data-testid="credit-balance"]')).toHaveText('10');
  
  // Verify upgrade button visible
  await expect(page.locator('[data-testid="add-credits-btn"]')).toBeVisible();
});
```

---

**Test 3: Credit Deduction and Warning**
```javascript
test('Low credit warning after 3 questions', async ({ page }) => {
  // Setup: User with 6 credits
  await loginAsUser(page, { credits: 6, isPaid: false });
  
  // Ask 3 questions (2 credits each)
  for (let i = 0; i < 3; i++) {
    await page.fill('[data-testid="chat-input"]', 'Tell me about today');
    await page.click('[data-testid="send-btn"]');
    await page.waitForResponse(response => response.url().includes('/api/v1/chat'));
  }
  
  // Verify credits: 6 - (2*3) = 0
  await expect(page.locator('[data-testid="credit-balance"]')).toHaveText('0');
  
  // Verify low credit warning
  await expect(page.locator('[data-testid="low-credit-warning"]')).toBeVisible();
  
  // Verify upgrade prompt after 3 questions
  await expect(page.locator('[data-testid="upgrade-prompt"]')).toBeVisible();
});
```

---

**Test 4: Birth Chart Download**
```javascript
test('Birth chart download with sufficient credits', async ({ page }) => {
  // Setup: User with 150 credits and generated chart
  await loginAsUser(page, { credits: 150, birthChartGenerated: true });
  
  // Request download
  await page.fill('[data-testid="chat-input"]', 'Can I download my birth chart?');
  await page.click('[data-testid="send-btn"]');
  
  // Wait for download ready message
  await expect(page.locator('[data-testid="chat-messages"]').last())
    .toContainText(/download|ready|PDF/i);
  
  // Verify credits deducted
  await expect(page.locator('[data-testid="credit-balance"]')).toHaveText('50');
  
  // Click download button
  const downloadPromise = page.waitForEvent('download');
  await page.click('[data-testid="download-chart-btn"]');
  const download = await downloadPromise;
  
  // Verify filename
  expect(download.suggestedFilename()).toContain('BirthChart');
  expect(download.suggestedFilename()).toContain('.pdf');
});
```

---

**Test 5: n8n Service Failure**
```javascript
test('Graceful handling when n8n is unavailable', async ({ page, context }) => {
  // Mock n8n endpoint to fail
  await context.route('**/webhook/chat', route => route.abort());
  
  // Login and ask question
  await loginAsUser(page, { credits: 10 });
  await page.fill('[data-testid="chat-input"]', 'What about today?');
  await page.click('[data-testid="send-btn"]');
  
  // Wait for error handling
  await page.waitForTimeout(5000);
  
  // Verify error message
  await expect(page.locator('[data-testid="chat-messages"]').last())
    .toContainText(/technical difficulties|try again/i);
  
  // Verify credits refunded
  await expect(page.locator('[data-testid="credit-balance"]')).toHaveText('10');
});
```

---

### Summary of Key Functional Requirements

#### 1. Authentication & User Management
- ✓ Phone-based authentication (10-digit for India)
- ✓ IP-based current location detection
- ✓ New vs existing user classification
- ✓ 10 free credits for new users
- ✓ Session management (30-day TTL)

#### 2. Profile Management
- ✓ Conversational profile extraction using NLP.js
- ✓ Name, DoB, ToB, PoB extraction from natural language
- ✓ Age verification (must be 18+)
- ✓ Geocoding for birth location
- ✓ Timezone calculation
- ✓ Profile saved only when complete

#### 3. Birth Chart
- ✓ Automatic generation after profile complete
- ✓ Uses ASTRO_API (freeastrologyapi.com)
- ✓ SVG chart creation
- ✓ Stored in database + cached in Redis
- ✓ Download costs 100 credits

#### 4. Question Classification
- ✓ NLP.js-based temporal analysis (today vs future)
- ✓ Topic extraction (career, love, health, finance, general)
- ✓ Today questions: 2 credits
- ✓ Premium questions (future): 3 credits
- ✓ Past event analysis: 2 credits

#### 5. Access Control
- ✓ Non-paid users: Only "today" questions allowed
- ✓ Paid users: All questions allowed
- ✓ Credit check before processing
- ✓ Atomic credit deduction
- ✓ Upgrade prompts at strategic points

#### 6. Message Processing
- ✓ Profile extraction: bff-platform only
- ✓ Today/allowed questions: forwarded to n8n
- ✓ Blocked questions: response from bff-platform
- ✓ All messages: no contractions
- ✓ NLP.js for natural variations

#### 7. Credit System
- ✓ Initial: 10 credits for new users
- ✓ Deduction before API call
- ✓ Refund on failure
- ✓ Low credit warning (< 5 credits)
- ✓ Upgrade prompt after 3 questions
- ✓ Real-time balance display

#### 8. Error Handling
- ✓ n8n unavailable: retry + refund + fallback
- ✓ Geocoding failure: prompt for clarification
- ✓ Minor user: block completely
- ✓ Database failure: no deduction + retry
- ✓ Insufficient credits: clear messaging

#### 9. UI/UX Requirements
- ✓ Profile section visible from login
- ✓ Real-time credit balance
- ✓ Chat interface for all interactions
- ✓ Current location displayed
- ✓ Birth chart status indicator
- ✓ Loading states for async operations

#### 10. Data Flow
- ✓ Canonical payload format to n8n
- ✓ Conversation history (last 5 messages)
- ✓ Session persistence in Redis
- ✓ User data in PostgreSQL
- ✓ Birth chart cached for 7 days

---

This specification provides comprehensive, defensive coverage of all application functionality for Playwright test creation.