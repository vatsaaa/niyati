# Niyati: Complete User and Application Interaction Script

## Table of Contents
1. [System Overview](#system-overview)
2. [Phase 1: Authentication & User Identification](#phase-1-authentication--user-identification)
3. [Phase 2: New User Onboarding](#phase-2-new-user-onboarding)
4. [Phase 3: Astrology Interaction & Query Classification](#phase-3-astrology-interaction--query-classification)
5. [Phase 4: Idempotent Billing & Credit Deduction](#phase-4-idempotent-billing--credit-deduction)
6. [Phase 5: Premium Gating & Payment Flow](#phase-5-premium-gating--payment-flow)
7. [Phase 6: Payment Verification & Credit Provisioning](#phase-6-payment-verification--credit-provisioning)
8. [Phase 7: Premium Query Execution](#phase-7-premium-query-execution)
9. [Phase 8: Credit Exhaustion & Top-Up Flow](#phase-8-credit-exhaustion--top-up-flow)
10. [Phase 9: Session Management & Persistence](#phase-9-session-management--persistence)
11. [Error Handling & Edge Cases](#error-handling--edge-cases)
12. [Technical Architecture](#technical-architecture)

---

## System Overview

**Niyati** is an AI-powered astrology chatbot that provides personalized horoscopes and birth chart analysis. The application uses a credit-based system with distinct free and paid tiers.

### Key Components
- **Frontend UI**: React-based chat interface
- **BFF (Backend for Frontend)**: `bff-auth` service for authentication, profile management, and billing
- **AI Agent**: n8n workflow orchestrating AI responses
- **Database**: PostgreSQL with tables: `users`, `user_profiles`, `user_credits`, `charge_transactions`, `payment_verifications`
- **NLP Services**: `profileExtractor.js`, `nlpClassifier.js` for client-side intent detection

### Credit System
- **Free Tier**: 10 monthly credits, access to daily horoscope only
- **Paid Tier**: 50 credits for ₹500, access to all premium queries
- **Credit Costs**: 
  - Daily horoscope: 2 credits
  - Premium queries (career, relationships, health, etc.): 4-6 credits

---

## Phase 1: Authentication & User Identification (The Gateway)

### User Action
1. Navigates to `http://localhost/`
2. Selects country from dropdown: **"INDIA"** (options: India, USA, UK, etc.)
3. Enters phone number: **"9899162012"**
4. Checks "I accept the privacy policy" checkbox
5. Clicks "Continue" button

### App Behavior

#### API Call
```
POST /api/v1/users/identify
Content-Type: application/json

{
  "countryCode": "IN",
  "phoneNumber": "9899162012",
  "privacyAccepted": true,
  "timestamp": "2026-02-15T14:30:00Z"
}
```

#### System Logic (Database Lookup)
The `bff-auth` service queries the `users` table:
```sql
SELECT user_id, phone_number, created_at 
FROM users 
WHERE phone_number = '9899162012' 
AND country_code = 'IN';
```

#### Case A: New User (Record Not Found)

**Backend Response:**
```json
{
  "returning": false,
  "userId": "usr_7f3a9b2c1d4e",
  "message": "Welcome! Let's get started."
}
```

**UI Behavior:**
- Creates new session with `userId` in memory and `sessionStorage`
- Initializes local state:
  ```javascript
  userState = {
    userId: "usr_7f3a9b2c1d4e",
    phoneNumber: "9899162012",
    credits: 10,
    isPaid: false,
    profileComplete: false
  }
  ```
- Displays Niyati's greeting message in chat
- Inserts record into `users` table:
  ```sql
  INSERT INTO users (user_id, phone_number, country_code, created_at)
  VALUES ('usr_7f3a9b2c1d4e', '9899162012', 'IN', NOW());
  ```
- Inserts initial credits record:
  ```sql
  INSERT INTO user_credits (user_id, credits, is_paid, last_reset_date)
  VALUES ('usr_7f3a9b2c1d4e', 10, false, NOW());
  ```

#### Case B: Returning User (Record Found)

**Backend Response:**
```json
{
  "returning": true,
  "userId": "usr_7f3a9b2c1d4e",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "profile": {
    "name": "Ankur Vatsa",
    "dob": "1979-05-19",
    "tob": "09:30",
    "birthPlace": "New Delhi",
    "timezone": "Asia/Kolkata",
    "latitude": 28.6139,
    "longitude": 77.2090
  },
  "credits": {
    "balance": 8,
    "isPaid": false
  },
  "message": "Welcome back!"
}
```

**UI Behavior:**
- Stores `accessToken` in `sessionStorage` and memory
- Loads user profile and credit balance into state
- Displays personalized welcome message: "Welcome back, Ankur! You have 8 credits remaining."
- Skips onboarding flow (Phase 2) and goes directly to chat interface

### Error Handling

#### Network Error
**Scenario**: API call fails due to network timeout
```
UI displays: "Connection error. Please check your internet and try again."
Retry button appears
```

#### Invalid Phone Number
**Scenario**: User enters incomplete/invalid phone number
```
Frontend validation: Highlights field in red
Error message: "Please enter a valid 10-digit phone number"
Continue button remains disabled
```

#### Privacy Policy Not Accepted
**Scenario**: User clicks Continue without checking the privacy policy
```
Checkbox border turns red
Error message: "Please accept the privacy policy to continue"
```

---

## Phase 2: New User Onboarding (Profile Discovery)

### App Behavior (Initial Greeting)

**Niyati's Message:**
```
Hello! I am Niyati, your personal astrology guide. 🌟

To create your birth chart and provide accurate insights, I need a few details:
- Your full name
- Date of birth
- Time of birth (as accurate as possible)
- Place of birth (city or town)

Please share these in a single message, for example: "I am Ankur Vatsa, born on 19 May 1979 at 09:30 am in New Delhi"
```

**UI State:**
- Chat interface is active
- Credit counter shows: "10 credits available"
- PayQR code is visible in sidebar with text: "Unlock premium features with 50 credits for ₹500"

### User Action
**User sends message:**
```
I am Ankur Vatsa, born on 19 May 1979 at 09:30 am in New Delhi
```

### App Behavior (NLP Extraction)

#### Step 1: Client-Side Parsing (profileExtractor.js)
```javascript
const extracted = profileExtractor.parse(userMessage);
// Result:
{
  name: "Ankur Vatsa",
  dob: "1979-05-19",
  tob: "09:30",
  timeFormat: "12h",
  birthPlace: "New Delhi",
  confidence: {
    name: 0.95,
    dob: 0.98,
    tob: 0.90,
    birthPlace: 0.85
  }
}
```

#### Step 2: Geocoding Resolution
```
API Call to geocoding service (or local database):
Query: "New Delhi"
Response:
{
  "city": "New Delhi",
  "state": "Delhi",
  "country": "India",
  "latitude": 28.6139,
  "longitude": 77.2090,
  "timezone": "Asia/Kolkata"
}
```

#### Step 3: Validation
- **Name**: Length > 2 characters, contains letters
- **DOB**: Valid date, not in future, user must be at least 13 years old
- **TOB**: Valid time format (HH:MM with optional AM/PM)
- **Birth Place**: Successfully geocoded with confidence > 0.7

### App Behavior (BFF Persistence)

#### API Call
```
POST /api/v1/users/profile
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "userId": "usr_7f3a9b2c1d4e",
  "name": "Ankur Vatsa",
  "dateOfBirth": "1979-05-19",
  "timeOfBirth": "09:30:00",
  "birthPlace": "New Delhi",
  "latitude": 28.6139,
  "longitude": 77.2090,
  "timezone": "Asia/Kolkata"
}
```

#### Database Operations
```sql
INSERT INTO user_profiles (
  user_id, name, dob, tob, birth_place, 
  latitude, longitude, timezone, created_at
)
VALUES (
  'usr_7f3a9b2c1d4e', 'Ankur Vatsa', '1979-05-19', '09:30:00',
  'New Delhi', 28.6139, 77.2090, 'Asia/Kolkata', NOW()
);

-- Update user credits table to mark profile as complete
UPDATE user_credits 
SET profile_complete = true 
WHERE user_id = 'usr_7f3a9b2c1d4e';
```

**Backend Response:**
```json
{
  "success": true,
  "message": "Profile saved successfully"
}
```

### App Behavior (Profile Intercept - No AI Call)

**Critical Rule**: This profile setup message is **intercepted** by the frontend and does NOT get forwarded to the AI agent.

**Niyati's Response (Pre-Composed, Local):**
```
Hi Ankur! 🙏

I now have your birth details:
- Born: May 19, 1979 at 9:30 AM
- Location: New Delhi, India

Your birth chart is ready for analysis. You have **10 free credits** to explore your daily horoscope.

💳 Want detailed insights? Upgrade to premium for 50 credits (₹500) and unlock:
- Career predictions
- Relationship compatibility
- Health guidance
- Financial forecasts
- Personalized remedies

Scan the QR code below to upgrade, or ask me: "What does today hold for me?"
```

**UI State Update:**
```javascript
userState.profileComplete = true;
```

### Edge Cases

#### Incomplete Information
**User message:** "I am Ankur, born on 19 May 1979"

**Niyati's Response:**
```
Thanks Ankur! I have your name and date of birth. 

I still need:
- Your time of birth (e.g., 9:30 AM)
- Your place of birth (city or town)

These are essential for creating an accurate birth chart. Please share them when you're ready!
```

**Backend**: Partial profile saved with NULL values for missing fields

#### Ambiguous Birth Place
**User message:** "I was born in Delhi"

**System Resolution:** 
- Geocoder returns multiple results (New Delhi, Delhi NCR, etc.)
- UI presents options:
  ```
  I found multiple locations for "Delhi":
  1. New Delhi, Delhi, India
  2. Delhi, New York, USA
  
  Please select the correct one or provide more details.
  ```

#### Invalid Date
**User message:** "Born on 31 February 1979"

**Niyati's Response:**
```
I noticed the date "31 February 1979" doesn't exist. Could you double-check your date of birth? 

Please provide it in a format like: "19 May 1979" or "1979-05-19"
```

#### Future Date
**User message:** "Born on 15 March 2030"

**Niyati's Response:**
```
The date you provided (March 15, 2030) is in the future. Please share your actual date of birth so I can create your birth chart accurately.
```

#### Underage User
**Scenario**: User's age calculated as < 13 years

**System Behavior:**
- Profile is NOT saved
- Error response:
  ```
  I'm sorry, but Niyati is only available for users aged 13 and above. 
  If you believe this is an error, please contact support.
  ```
- Session is terminated

---

## Phase 3: Astrology Interaction & Query Classification

### User Action
**User sends message:**
```
What is the date today and what does the day hold for me?
```

### App Behavior (BFF Classification)

#### API Call
```
POST /api/v1/chat/classify
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "userId": "usr_7f3a9b2c1d4e",
  "message": "What is the date today and what does the day hold for me?",
  "timestamp": "2026-02-15T14:35:00Z"
}
```

#### NLP Classification (nlpClassifier.js)
```javascript
const classification = nlpClassifier.classify(message);
// Result:
{
  "intent": "horoscope.today",
  "queryType": "horoscope",
  "entities": {
    "timeframe": "today"
  },
  "confidence": 0.92,
  "creditCost": 2
}
```

**Classification Logic:**
- Keywords: "today", "date", "day hold", "horoscope"
- Pattern matching: Daily horoscope requests
- Intent hierarchy: `horoscope.today` < `horoscope.weekly` < `horoscope.monthly`

**Backend Response:**
```json
{
  "queryType": "horoscope",
  "intent": "horoscope.today",
  "creditCost": 2,
  "isPremium": false,
  "currentBalance": 10
}
```

### App Behavior (Credit Check)

**Validation:**
```javascript
if (userState.credits < classification.creditCost) {
  // Show insufficient credits message
  displayInsufficientCreditsModal();
  return;
}

if (classification.isPremium && !userState.isPaid) {
  // Show premium gating message
  displayPremiumGatingMessage();
  return;
}

// Proceed with query
```

**UI State:**
- Display loading indicator: "Niyati is reading your stars..."
- Disable input field temporarily

### App Behavior (AI Orchestration)

#### Webhook Call to n8n
```
POST https://n8n.yourserver.com/webhook/niyati-chat
Content-Type: application/json
X-Request-ID: req_a1b2c3d4e5f6  // For idempotency

{
  "userId": "usr_7f3a9b2c1d4e",
  "message": "What is the date today and what does the day hold for me?",
  "queryType": "horoscope",
  "intent": "horoscope.today",
  "creditCost": 2,
  "metadata": {
    "name": "Ankur Vatsa",
    "dob": "1979-05-19",
    "tob": "09:30:00",
    "birthPlace": "New Delhi",
    "latitude": 28.6139,
    "longitude": 77.2090,
    "timezone": "Asia/Kolkata",
    "age": 46,
    "sunSign": "Taurus",
    "moonSign": "Libra",
    "ascendant": "Gemini"
  },
  "timestamp": "2026-02-15T14:35:00Z"
}
```

#### n8n Workflow Steps

**1. Metadata Validation Node**
- Checks if all required profile fields are present
- If missing, returns error: `{ "error": "Profile incomplete" }`

**2. Age Verification Node**
```javascript
const age = calculateAge(metadata.dob);
if (age < 18) {
  return {
    error: "Age restriction",
    message: "Birth chart analysis is only available for users 18 and above."
  };
}
```

**3. Astrological Computation Node**
- Calculates current planetary positions
- Determines current dasha (planetary period)
- Computes daily transits affecting user's chart

**4. AI Agent Node (Claude API)**
```
System Prompt:
You are Niyati, a compassionate and insightful Vedic astrologer. The user's birth details are:

Name: Ankur Vatsa
Date of Birth: May 19, 1979
Time of Birth: 9:30 AM
Place: New Delhi, India
Sun Sign: Taurus
Moon Sign: Libra
Ascendant: Gemini
Current Age: 46

Today's Date: February 15, 2026

The user asked: "What is the date today and what does the day hold for me?"

Provide a warm, personalized daily horoscope for Ankur. Include:
1. Today's date and day of the week
2. Overall energy and mood for the day
3. Specific guidance for: career, relationships, health
4. A lucky color or number
5. An affirmation or spiritual message

Keep the tone friendly, insightful, and empowering. Limit to 150-200 words.

CRITICAL: Do NOT ask for birth details as you already have them.
```

**AI Response Example:**
```
Good morning, Ankur! 🌞

Today is Saturday, February 15, 2026 — a day brimming with creative potential for you.

With the Moon transiting through your 5th house, expect a surge of inspiration and joy. This is an excellent day to pursue personal projects or spend quality time with loved ones. Your natural Taurus stability is beautifully balanced by Libra's diplomacy today.

**Career**: Hold off on major decisions; use today for planning and brainstorming instead.
**Relationships**: Express appreciation to those close to you — small gestures will strengthen bonds.
**Health**: A gentle yoga session or nature walk will recharge your energy.

**Lucky Color**: Emerald Green  
**Lucky Number**: 6

**Today's Affirmation**: "I trust the journey and embrace growth with an open heart."

Remember, the stars guide but you create your destiny. Make today count! ✨

— Niyati
```

#### n8n Response to BFF
```json
{
  "success": true,
  "response": "[AI-generated horoscope text]",
  "requestId": "req_a1b2c3d4e5f6",
  "metadata": {
    "sunSign": "Taurus",
    "moonSign": "Libra",
    "dailyTransit": "Moon in 5th house"
  }
}
```

### UI Behavior (Display Response)

**Niyati's message appears in chat:**
```
[Full AI-generated horoscope text displayed]
```

**UI Updates:**
- Remove loading indicator
- Re-enable input field
- Credits are NOT yet deducted (happens in Phase 4)

---

## Phase 4: Idempotent Billing & Credit Deduction

### Trigger
AI response successfully received and displayed to user

### App Behavior (Credit Deduction)

#### API Call
```
POST /api/v1/users/deduct-credits
Authorization: Bearer {accessToken}
Content-Type: application/json
X-Idempotency-Key: req_a1b2c3d4e5f6  // Same as n8n request ID

{
  "userId": "usr_7f3a9b2c1d4e",
  "creditCost": 2,
  "queryType": "horoscope",
  "intent": "horoscope.today",
  "timestamp": "2026-02-15T14:35:00Z"
}
```

### Backend Logic (Idempotency Check)

```sql
-- Check if transaction already processed
SELECT transaction_id, status 
FROM charge_transactions 
WHERE idempotency_key = 'req_a1b2c3d4e5f6';
```

**Case A: First Request (Transaction Not Found)**

```sql
BEGIN TRANSACTION;

-- Insert transaction record
INSERT INTO charge_transactions (
  transaction_id, user_id, idempotency_key, 
  credit_amount, query_type, status, created_at
)
VALUES (
  'txn_9d8c7b6a5e4f', 'usr_7f3a9b2c1d4e', 'req_a1b2c3d4e5f6',
  -2, 'horoscope', 'completed', NOW()
);

-- Deduct credits
UPDATE user_credits 
SET credits = credits - 2,
    updated_at = NOW()
WHERE user_id = 'usr_7f3a9b2c1d4e'
AND credits >= 2;  -- Ensures sufficient balance

-- Verify update
SELECT credits FROM user_credits WHERE user_id = 'usr_7f3a9b2c1d4e';

COMMIT;
```

**Backend Response:**
```json
{
  "success": true,
  "transactionId": "txn_9d8c7b6a5e4f",
  "newBalance": 8,
  "message": "2 credits deducted successfully"
}
```

**Case B: Duplicate Request (Transaction Already Processed)**

```sql
SELECT transaction_id, status, created_at
FROM charge_transactions 
WHERE idempotency_key = 'req_a1b2c3d4e5f6';
-- Returns existing record
```

**Backend Response (Idempotent):**
```json
{
  "success": true,
  "transactionId": "txn_9d8c7b6a5e4f",
  "newBalance": 8,
  "message": "Transaction already processed",
  "duplicate": true
}
```

**Critical**: Same response returned, no double-charging occurs

### UI Behavior (Update Display)

**Credit Counter Update:**
```
Before: "10 credits available"
After:  "8 credits available"
```

**Optional Notification:**
```
Toast message (subtle, bottom-right):
"✓ 2 credits used"
Auto-dismisses in 3 seconds
```

**Transaction Log (User Menu):**
```
Recent Activity:
- Feb 15, 2:35 PM: Daily Horoscope (-2 credits)
- Feb 15, 2:00 PM: Account created (+10 credits)
```

### Error Handling

#### Insufficient Credits
**Scenario**: User has 1 credit, query costs 2 credits

**Backend Response:**
```json
{
  "success": false,
  "error": "INSUFFICIENT_CREDITS",
  "currentBalance": 1,
  "requiredCredits": 2,
  "message": "You need 1 more credit to continue"
}
```

**UI Display:**
```
Modal overlay:
"Oops! You need 1 more credit for this query.

Your balance: 1 credit
Query cost: 2 credits

[Upgrade to Premium - ₹500 for 50 credits]
[Cancel]
```

#### Database Deadlock
**Scenario**: Concurrent requests cause database lock

**Backend Retry Logic:**
```javascript
async function deductCreditsWithRetry(params, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await deductCredits(params);
    } catch (error) {
      if (error.code === 'DEADLOCK' && i < maxRetries - 1) {
        await sleep(100 * Math.pow(2, i)); // Exponential backoff
        continue;
      }
      throw error;
    }
  }
}
```

#### Network Timeout
**Scenario**: Deduction API call times out

**UI Behavior:**
```
Error message: "Transaction processing... Please wait."
Automatic retry after 5 seconds
If retry fails: "Transaction pending. Your credits will be updated shortly."
```

**Backend**: Transaction is eventually processed via background job

---

## Phase 5: Premium Gating & Payment Flow

### User Action
**User sends message:**
```
When will I get a promotion?
```

### App Behavior (Classification)

#### API Call
```
POST /api/v1/chat/classify
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "userId": "usr_7f3a9b2c1d4e",
  "message": "When will I get a promotion?",
  "timestamp": "2026-02-15T15:00:00Z"
}
```

#### NLP Classification Result
```json
{
  "intent": "premium.career.promotion",
  "queryType": "premium",
  "category": "career",
  "entities": {
    "timeframe": "future",
    "topic": "promotion"
  },
  "confidence": 0.89,
  "creditCost": 4,
  "isPremium": true
}
```

### App Behavior (Premium Gating Check)

**Validation Logic:**
```javascript
if (classification.isPremium && !userState.isPaid) {
  displayPremiumGatingMessage();
  blockQueryExecution();
  showPaymentOptions();
  return;  // Stop here - do NOT call AI
}
```

### App Behavior (Display Premium Gate)

**Niyati's Response (Pre-Composed):**
```
I would love to help you with detailed career predictions, Ankur! 🌟

However, as a free user, you have access to:
✓ Daily horoscopes (2 credits each)

Premium features require paid credits:
- Career predictions (4 credits)
- Relationship compatibility (4 credits)
- Health guidance (3 credits)
- Financial forecasts (5 credits)
- Personalized remedies (6 credits)
- Marriage timing (6 credits)
- Business partnership analysis (5 credits)

📱 **Unlock Premium Access**
Get 50 credits for ₹500 (Valid for 6 months)

To upgrade, scan the QR code below and make a UPI payment. Then share your UPI ID and 12-digit transaction ID here in the chat.

Or click here: [Pay Now with UPI]

Your question will be answered as soon as your payment is verified! 🙏
```

**UI Changes:**
- PayQR code is highlighted with pulsing animation
- "Upgrade Now" button appears below chat input
- Input field shows placeholder: "Complete payment to continue..."

### User Action (Payment Initiation)

**Option A: User Scans QR Code**
1. Opens UPI app (Google Pay, PhonePe, Paytm, etc.)
2. Scans QR code displayed in UI
3. Sees payment details:
   ```
   Pay to: Niyati Astrology Services
   Amount: ₹500.00
   Note: 50 Credits - User ID: usr_7f3a9b2c1d4e
   ```
4. Completes UPI payment
5. Receives 12-digit transaction ID: `260215123456`

**Option B: User Clicks "Pay Now" Button**
1. Button opens UPI deep link:
   ```
   upi://pay?pa=niyati@paytm&pn=Niyati&am=500&tn=Credits-usr_7f3a9b2c1d4e
   ```
2. UPI app opens automatically with pre-filled details
3. User completes payment

### User Action (Transaction Details Submission)

**User sends message:**
```
I have paid. My UPI ID is ankur.vatsa@oksbi and transaction ID is 260215123456
```

### App Behavior (Payment Details Extraction)

#### Regex Parsing
```javascript
const upiRegex = /([a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+)/;
const txnIdRegex = /\b(\d{12})\b/;

const upiId = message.match(upiRegex)?.[1]; // "ankur.vatsa@oksbi"
const txnId = message.match(txnIdRegex)?.[1]; // "260215123456"

if (!upiId || !txnId) {
  displayExtractionError();
  return;
}
```

#### State Update
```javascript
userState.pendingPayment = {
  upiId: "ankur.vatsa@oksbi",
  txnId: "260215123456",
  amount: 500,
  credits: 50,
  timestamp: "2026-02-15T15:05:00Z",
  status: "pending_verification"
};
```

### App Behavior (Backend Submission)

#### API Call
```
POST /api/v1/payments/submit
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "userId": "usr_7f3a9b2c1d4e",
  "upiId": "ankur.vatsa@oksbi",
  "transactionId": "260215123456",
  "amount": 500,
  "currency": "INR",
  "expectedCredits": 50,
  "timestamp": "2026-02-15T15:05:00Z"
}
```

#### Database Operation
```sql
INSERT INTO payment_verifications (
  verification_id, user_id, upi_id, transaction_id,
  amount, currency, credits, status, submitted_at
)
VALUES (
  'verify_a1b2c3d4', 'usr_7f3a9b2c1d4e', 'ankur.vatsa@oksbi', '260215123456',
  500, 'INR', 50, 'pending', NOW()
);
```

**Backend Response:**
```json
{
  "success": true,
  "verificationId": "verify_a1b2c3d4",
  "status": "pending",
  "estimatedTime": "2-5 minutes",
  "message": "Payment verification in progress"
}
```

### UI Behavior (Pending State)

**Niyati's Response:**
```
Thank you for sharing your payment details! 🙏

Your payment is being verified:
- UPI ID: ankur.vatsa@oksbi
- Transaction ID: 260215123456
- Amount: ₹500

⏳ Verification usually takes 2-5 minutes. I'll notify you as soon as it's confirmed.

You can continue chatting, and your premium question will be answered once verification is complete!
```

**UI Visual Indicator:**
- Animated hourglass icon next to credit counter
- Status bar: "Payment Verification: In Progress..."
- Polling starts (checks status every 15 seconds)

### Edge Cases

#### Invalid UPI ID Format
**User message:** "My UPI is ankur123 and txn is 260215123456"

**Niyati's Response:**
```
I couldn't recognize a valid UPI ID in your message. 

UPI IDs typically look like:
- yourname@okaxis
- 9899162012@paytm
- ankur.vatsa@oksbi

Please share your complete UPI ID and 12-digit transaction ID again.
```

#### Invalid Transaction ID
**User message:** "UPI: ankur@oksbi, Transaction: 26021512"

**Niyati's Response:**
```
The transaction ID should be exactly 12 digits. 

You provided: "26021512" (8 digits)

Please check your UPI app and share the complete 12-digit transaction reference number.
```

#### Missing Information
**User message:** "I paid ₹500"

**Niyati's Response:**
```
Great! To verify your payment, I need two details:

1. Your UPI ID (e.g., yourname@paytm)
2. Your 12-digit transaction ID

You can find both in your UPI app's transaction history. Please share them here!
```

---

## Phase 6: Payment Verification & Credit Provisioning

### Backend Process (Verification Workflow)

#### Polling Mechanism
```javascript
// Runs every 15 seconds
async function checkPaymentStatus(verificationId) {
  const record = await db.query(
    'SELECT * FROM payment_verifications WHERE verification_id = ?',
    [verificationId]
  );
  
  if (record.status === 'verified') {
    return record;
  }
  
  // Call UPI verification API
  const verification = await verifyWithUPIProvider(record);
  return verification;
}
```

#### UPI Provider Verification

**Integration Options:**
1. **Razorpay Payment Links** (Recommended)
2. **PhonePe Payment Gateway**
3. **Paytm Business API**

**Razorpay Verification API:**
```
GET https://api.razorpay.com/v1/payments/{payment_id}
Authorization: Basic {base64(key_id:key_secret)}

Response:
{
  "id": "pay_a1b2c3d4",
  "entity": "payment",
  "amount": 50000,  // Amount in paise (500 INR = 50000)
  "currency": "INR",
  "status": "captured",
  "method": "upi",
  "vpa": "ankur.vatsa@oksbi",
  "created_at": 1708006200
}
```

#### Verification Logic

**Case A: Payment Verified Successfully**

```javascript
if (providerResponse.status === 'captured' && 
    providerResponse.amount === 50000 &&
    providerResponse.vpa === userSubmittedUPI) {
  
  // Mark as verified
  await updateVerificationStatus('verify_a1b2c3d4', 'verified');
  
  // Provision credits
  await provisionCredits('usr_7f3a9b2c1d4e', 50);
  
  // Notify user
  await notifyUser('usr_7f3a9b2c1d4e', 'payment_verified');
}
```

**Database Updates:**
```sql
BEGIN TRANSACTION;

-- Update verification record
UPDATE payment_verifications 
SET status = 'verified',
    verified_at = NOW(),
    provider_response = '{"id": "pay_a1b2c3d4", "status": "captured"}',
    verification_method = 'razorpay_api'
WHERE verification_id = 'verify_a1b2c3d4';

-- Add credits to user account
UPDATE user_credits 
SET credits = credits + 50,
    is_paid = true,
    last_payment_date = NOW(),
    updated_at = NOW()
WHERE user_id = 'usr_7f3a9b2c1d4e';

-- Create transaction record
INSERT INTO charge_transactions (
  transaction_id, user_id, credit_amount, 
  query_type, status, payment_id, created_at
)
VALUES (
  'txn_payment_001', 'usr_7f3a9b2c1d4e', 50,
  'payment', 'completed', 'verify_a1b2c3d4', NOW()
);

COMMIT;
```

**Case B: Payment Not Found**

```javascript
if (providerResponse.error === 'payment_not_found') {
  // Wait and retry (max 12 attempts = 3 minutes)
  if (retryCount < 12) {
    scheduleRetry('verify_a1b2c3d4', 15); // seconds
  } else {
    // Manual review required
    await updateVerificationStatus('verify_a1b2c3d4', 'manual_review');
    await notifyAdmin('verify_a1b2c3d4');
  }
}
```

**Case C: Payment Failed**

```javascript
if (providerResponse.status === 'failed') {
  await updateVerificationStatus('verify_a1b2c3d4', 'failed');
  await notifyUser('usr_7f3a9b2c1d4e', 'payment_failed');
}
```

**Case D: Amount Mismatch**

```javascript
if (providerResponse.amount !== 50000) {
  await updateVerificationStatus('verify_a1b2c3d4', 'amount_mismatch');
  await createRefundRequest('verify_a1b2c3d4');
  await notifyUser('usr_7f3a9b2c1d4e', 'amount_mismatch');
}
```

### App Behavior (Notification)

#### WebSocket Notification (Real-time)
```json
{
  "type": "PAYMENT_VERIFIED",
  "userId": "usr_7f3a9b2c1d4e",
  "data": {
    "verificationId": "verify_a1b2c3d4",
    "creditsAdded": 50,
    "newBalance": 58,
    "isPaid": true
  },
  "timestamp": "2026-02-15T15:08:30Z"
}
```

**UI Behavior (Success):**
1. **Confetti Animation** (3 seconds)
2. **Credit Counter Update:**
   ```
   Old: "8 credits available"
   New: "58 credits available" (with green highlight)
   ```
3. **Status Badge Update:**
   ```
   "FREE USER" → "PREMIUM USER" (gold badge)
   ```

### Niyati's Congratulations Message

```
🎉 Fantastic news, Ankur!

Your payment has been verified successfully!

✅ 50 credits added to your account
💎 You're now a Premium user

Your new balance: **58 credits**

Now, let me answer your career question: "When will I get a promotion?"

[AI proceeds to generate premium career prediction]
```

### Edge Cases

#### Duplicate Payment Detection
**Scenario**: User submits same transaction ID twice

**Backend Check:**
```sql
SELECT COUNT(*) FROM payment_verifications
WHERE transaction_id = '260215123456'
AND status IN ('verified', 'pending');
```

**If duplicate found:**
```
Niyati's Response:
"This transaction ID has already been submitted. 

If you made a new payment, please share the new transaction ID. 
If you're checking the status, your payment is still being verified."
```

#### Verification Timeout
**Scenario**: Verification exceeds 5 minutes

**Backend Status:**
```sql
UPDATE payment_verifications 
SET status = 'manual_review',
    review_reason = 'verification_timeout'
WHERE verification_id = 'verify_a1b2c3d4';
```

**Niyati's Response:**
```
Your payment verification is taking longer than usual. ⏳

Our team has been notified and will verify your payment manually within 30 minutes.

Verification ID: verify_a1b2c3d4

You'll receive a notification once it's confirmed. Thank you for your patience! 🙏

Need urgent help? Contact: support@niyati.com
```

#### Wrong Amount Paid
**Scenario**: User paid ₹400 instead of ₹500

**Backend Detection:**
```javascript
if (providerResponse.amount === 40000) { // ₹400
  await updateVerificationStatus('verify_a1b2c3d4', 'partial_payment');
}
```

**Niyati's Response:**
```
I see you've paid ₹400, but the premium package costs ₹500.

Options:
1. Pay the remaining ₹100 to get 50 credits
2. Get 40 credits for ₹400 (proportional)
3. Request a full refund

Please reply with your preferred option (1, 2, or 3).
```

---

## Phase 7: Premium Query Execution

### Trigger
Credits successfully provisioned after payment verification

### App Behavior (Resume Query)

#### Automatic Query Recall
```javascript
// System retrieves the original premium question
const originalQuery = chatHistory.find(
  msg => msg.userId === 'usr_7f3a9b2c1d4e' && 
         msg.queryType === 'premium' &&
         msg.status === 'blocked_payment_required'
);

// Resume execution
executeQuery(originalQuery);
```

### App Behavior (Premium AI Call)

#### Webhook Call to n8n
```
POST https://n8n.yourserver.com/webhook/niyati-chat
Content-Type: application/json
X-Request-ID: req_premium_001

{
  "userId": "usr_7f3a9b2c1d4e",
  "message": "When will I get a promotion?",
  "queryType": "premium",
  "intent": "premium.career.promotion",
  "creditCost": 4,
  "metadata": {
    "name": "Ankur Vatsa",
    "dob": "1979-05-19",
    "tob": "09:30:00",
    "birthPlace": "New Delhi",
    "latitude": 28.6139,
    "longitude": 77.2090,
    "timezone": "Asia/Kolkata",
    "age": 46,
    "sunSign": "Taurus",
    "moonSign": "Libra",
    "ascendant": "Gemini",
    "isPaid": true,
    "currentDasha": "Venus Mahadasha",
    "currentAntardasha": "Mercury"
  },
  "timestamp": "2026-02-15T15:09:00Z"
}
```

#### n8n Premium Workflow

**1. Advanced Astrological Computation**
```javascript
// Calculate career-specific planetary influences
const careerHouses = [2, 6, 10]; // Wealth, Service, Career
const careerPlanets = ['Saturn', 'Jupiter', 'Mercury'];

// Analyze transits for next 12 months
const promotionWindows = calculateCareerTransits({
  userChart: metadata,
  lookAhead: 12, // months
  focus: 'promotion'
});
```

**2. AI Agent with Extended Context**
```
System Prompt:
You are Niyati, an expert Vedic astrologer. Provide a detailed career analysis for:

Name: Ankur Vatsa
Date of Birth: May 19, 1979 at 9:30 AM
Place: New Delhi, India
Current Age: 46
Sun Sign: Taurus | Moon Sign: Libra | Ascendant: Gemini

Current Dasha: Venus Mahadasha, Mercury Antardasha
Career Houses: 10th Lord (Jupiter) in 2nd house
Key Career Planets: Saturn (strong), Jupiter (favorable), Mercury (neutral)

The user asked: "When will I get a promotion?"

Provide a comprehensive 300-400 word analysis including:
1. Current career planetary influences
2. Most favorable time periods for promotion in next 12 months
3. Specific months to focus efforts
4. Potential obstacles and how to navigate them
5. Recommended actions and remedies
6. Overall career trajectory for the year

Be specific with dates/months. Use a warm, professional tone.
```

**AI Response Example:**
```
Ankur, let me analyze your birth chart for career advancement opportunities. 🌟

**Current Planetary Influences**
You're currently in Venus Mahadasha with Mercury Antardasha — a highly favorable period for intellectual and communication-driven career growth. Your 10th house lord Jupiter is well-placed in the 2nd house, indicating financial gains through professional success.

**Promotion Timeline Analysis**

The most auspicious windows for a promotion are:

1. **April-May 2026** (80% likelihood) ⭐⭐⭐
   - Jupiter transits your 10th house, directly activating career advancement
   - Saturn's favorable aspect supports recognition for past work
   - Action: Initiate conversations with leadership in early April

2. **September-October 2026** (70% likelihood) ⭐⭐
   - Mercury's transit strengthens communication and networking
   - Venus brings support from mentors and colleagues
   - Action: Present key achievements and future vision

3. **December 2026** (60% likelihood) ⭐
   - Year-end reviews and budget planning favor advancements
   - Mars transit provides assertive energy to negotiate

**Potential Obstacles**
Saturn's influence may cause delays in April if paperwork or approvals are incomplete. Stay patient and ensure all documentation is thorough.

**Recommended Actions**
- Wear a Yellow Sapphire (Jupiter's gemstone) on your right index finger
- Chant "Om Brihaspataye Namaha" 108 times on Thursdays
- Network actively during March to plant seeds for April discussions
- Document all major achievements for review conversations

**Overall Outlook**
The year strongly favors your career growth. Focus your efforts in Q2 2026, maintain visibility with leadership, and trust the process. A promotion is highly likely before year-end, with April being your golden window.

May the stars align in your favor! ✨

— Niyati

*Want more details on any specific month or need relationship/health insights? Feel free to ask!*
```

### App Behavior (Credit Deduction)

#### API Call
```
POST /api/v1/users/deduct-credits
Authorization: Bearer {accessToken}
Content-Type: application/json
X-Idempotency-Key: req_premium_001

{
  "userId": "usr_7f3a9b2c1d4e",
  "creditCost": 4,
  "queryType": "premium",
  "intent": "premium.career.promotion",
  "timestamp": "2026-02-15T15:09:00Z"
}
```

#### Database Update
```sql
BEGIN TRANSACTION;

INSERT INTO charge_transactions (
  transaction_id, user_id, idempotency_key,
  credit_amount, query_type, status, created_at
)
VALUES (
  'txn_premium_001', 'usr_7f3a9b2c1d4e', 'req_premium_001',
  -4, 'premium.career', 'completed', NOW()
);

UPDATE user_credits 
SET credits = credits - 4,
    updated_at = NOW()
WHERE user_id = 'usr_7f3a9b2c1d4e';

COMMIT;
```

### UI Behavior

**Credit Counter Update:**
```
Before: "58 credits available"
After:  "54 credits available"
```

**Transaction Log:**
```
Recent Activity:
- Feb 15, 3:09 PM: Career Promotion Analysis (-4 credits)
- Feb 15, 3:08 PM: Payment Verified (+50 credits)
- Feb 15, 2:35 PM: Daily Horoscope (-2 credits)
```

---

## Phase 8: Credit Exhaustion & Top-Up Flow

### Scenario: Credits Running Low

#### Trigger
User's credit balance falls below 5 credits

### App Behavior (Proactive Notification)

**Niyati's Message (After answering current query):**
```
✨ You have 4 credits remaining.

To continue enjoying premium insights, you can top up your account:
- 50 credits for ₹500 (Best value — ₹10/credit)
- 25 credits for ₹275 (₹11/credit)
- 10 credits for ₹120 (₹12/credit)

Your credits are valid for 6 months from purchase.

[Top Up Now]
```

### Scenario: Credits Exhausted

**User Action:**
```
What does my birth chart say about my health this year?
```

**Classification:**
```json
{
  "intent": "premium.health.yearly",
  "queryType": "premium",
  "creditCost": 5,
  "isPremium": true
}
```

**Credit Check:**
```javascript
if (userState.credits < 5) {
  displayInsufficientCreditsModal();
  return;
}
```

### App Behavior (Insufficient Credits Gate)

**Niyati's Response:**
```
I'd love to provide a detailed health analysis for you, Ankur! 

However, this query requires 5 credits and you currently have 4 credits.

To continue, please top up your account:

**Top-Up Options:**
1. 10 credits — ₹120 (₹12/credit)
2. 25 credits — ₹275 (₹11/credit) 💡 Popular
3. 50 credits — ₹500 (₹10/credit) ⭐ Best Value

All credits are valid for 6 months.

Scan the QR code below or click [Pay with UPI] to top up instantly!
```

**UI Behavior:**
- Modal overlay with top-up options
- Each option shows:
  - Credit amount
  - Price
  - Per-credit cost
  - "Pay Now" button
- QR code updates based on selected amount

### Top-Up Payment Flow

**User Action:** Selects "25 credits — ₹275" and completes payment

**Workflow:**
1. User shares UPI ID and transaction ID
2. Backend verifies payment (same as Phase 6)
3. Credits added to account
4. Original health query automatically executes

**Simplified Flow:**
```
User query blocked → Top-up prompt → Payment → Verification → 
Credits added → Original query resumes → Answer delivered
```

---

## Phase 9: Session Management & Persistence

### Session Lifecycle

#### Session Creation
```javascript
// On successful authentication
sessionManager.create({
  userId: 'usr_7f3a9b2c1d4e',
  accessToken: 'eyJhbGc...',
  expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
  deviceInfo: {
    userAgent: navigator.userAgent,
    platform: 'web'
  }
});

// Store in sessionStorage and memory
sessionStorage.setItem('niyati_session', JSON.stringify(session));
```

#### Session Persistence
- **SessionStorage**: Cleared when tab closes
- **Refresh Token**: Stored in httpOnly cookie (if implemented)
- **Auto-Logout**: After 24 hours of inactivity

#### Session Restoration

**User returns within 24 hours:**
```javascript
// On page load
const storedSession = sessionStorage.getItem('niyati_session');
if (storedSession) {
  const session = JSON.parse(storedSession);
  
  // Validate token
  const isValid = await validateToken(session.accessToken);
  if (isValid) {
    // Restore user state
    await loadUserProfile(session.userId);
    await loadCreditBalance(session.userId);
    await loadChatHistory(session.userId);
  } else {
    // Token expired, request re-authentication
    redirectToLogin();
  }
}
```

### Chat History Persistence

#### Database Schema
```sql
CREATE TABLE chat_messages (
  message_id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  role ENUM('user', 'assistant') NOT NULL,
  content TEXT NOT NULL,
  query_type VARCHAR(50),
  credit_cost INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  INDEX idx_user_created (user_id, created_at)
);
```

#### Saving Messages
```javascript
// After each message exchange
await saveMessage({
  messageId: 'msg_abc123',
  userId: 'usr_7f3a9b2c1d4e',
  role: 'user',
  content: 'What does today hold for me?',
  queryType: 'horoscope',
  creditCost: 2,
  createdAt: new Date()
});

await saveMessage({
  messageId: 'msg_def456',
  userId: 'usr_7f3a9b2c1d4e',
  role: 'assistant',
  content: '[AI-generated horoscope]',
  queryType: 'horoscope',
  creditCost: 0,
  createdAt: new Date()
});
```

#### Loading History
```javascript
// On session restoration
const history = await loadChatHistory('usr_7f3a9b2c1d4e', {
  limit: 50,  // Last 50 messages
  order: 'DESC'
});

// Render in UI
history.forEach(msg => {
  renderMessage(msg.role, msg.content);
});
```

### Monthly Credit Reset (Free Users)

#### Scheduled Job
```javascript
// Runs on 1st of every month at 00:00 UTC
async function resetMonthlyCredits() {
  await db.query(`
    UPDATE user_credits 
    SET credits = 10,
        last_reset_date = CURRENT_DATE
    WHERE is_paid = false 
    AND last_reset_date < DATE_TRUNC('month', CURRENT_DATE)
  `);
  
  // Notify users
  const users = await db.query('SELECT user_id FROM user_credits WHERE is_paid = false');
  users.forEach(user => {
    notifyUser(user.user_id, 'monthly_credits_reset');
  });
}
```

#### Notification
**Niyati's Message (Push notification or in-app):**
```
🎁 Good news, Ankur!

Your monthly free credits have been reset. You now have 10 credits to explore your horoscope for March 2026.

Happy stargazing! ✨
```

### Credit Expiration (Paid Users)

#### Scheduled Job
```javascript
// Runs daily at 02:00 UTC
async function checkExpiredCredits() {
  const expiredUsers = await db.query(`
    SELECT user_id, credits 
    FROM user_credits 
    WHERE is_paid = true 
    AND last_payment_date < NOW() - INTERVAL '6 months'
    AND credits > 0
  `);
  
  expiredUsers.forEach(async user => {
    // Mark credits as expired
    await db.query(`
      UPDATE user_credits 
      SET credits = 0,
          expired_credits = credits,
          is_paid = false
      WHERE user_id = ?
    `, [user.user_id]);
    
    // Notify user
    notifyUser(user.user_id, 'credits_expired');
  });
}
```

#### Notification
```
⚠️ Your premium credits have expired.

You had 20 unused credits that were purchased 6 months ago. 

To continue enjoying premium insights, please top up your account:
- 50 credits for ₹500 (Valid for 6 months)

[Top Up Now]
```

---

## Error Handling & Edge Cases

### Network Errors

#### API Call Failure
**Scenario**: Backend is unreachable

**UI Behavior:**
```
Error message: "Unable to connect to Niyati. Please check your internet connection."
[Retry] button
```

**Retry Logic:**
```javascript
async function apiCallWithRetry(endpoint, data, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetch(endpoint, { method: 'POST', body: JSON.stringify(data) });
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(1000 * Math.pow(2, i)); // Exponential backoff
    }
  }
}
```

#### AI Response Timeout
**Scenario**: n8n webhook takes >30 seconds

**UI Behavior:**
```
After 30 seconds:
"Niyati is taking longer than usual... Please wait."

After 60 seconds:
"This is taking unusually long. Your query is being processed. 
You'll receive a notification when your answer is ready."
```

**Backend**: Queue request for async processing

### Input Validation Errors

#### Malformed Message
**User sends:** `<script>alert('xss')</script>`

**Sanitization:**
```javascript
const sanitized = DOMPurify.sanitize(userInput);
// Result: (empty string or escaped HTML)
```

**UI**: Message is not displayed, input is rejected silently

#### Extremely Long Message
**User sends:** 10,000-character message

**Validation:**
```javascript
if (message.length > 1000) {
  displayError("Message too long. Please keep it under 1000 characters.");
  return;
}
```

#### Empty Message
**User sends:** (blank message)

**Validation:**
```javascript
if (message.trim().length === 0) {
  // Ignore silently
  return;
}
```

### Payment Verification Errors

#### Payment Gateway Down
**Scenario**: Razorpay API returns 503

**Backend Behavior:**
```javascript
if (providerResponse.status === 503) {
  // Schedule manual verification after 1 hour
  await scheduleManualReview('verify_a1b2c3d4', { delay: 3600 });
  
  // Notify user
  await notifyUser(userId, 'verification_delayed');
}
```

**Niyati's Message:**
```
Our payment verification system is temporarily busy. 

Your payment will be verified within 1 hour, and credits will be added automatically.

Verification ID: verify_a1b2c3d4

Thank you for your patience! 🙏
```

#### Transaction ID Already Used
**Scenario**: Fraudulent attempt to reuse transaction ID

**Backend Check:**
```sql
SELECT user_id, status 
FROM payment_verifications 
WHERE transaction_id = '260215123456' 
AND status = 'verified';
```

**If found:**
```
Niyati's Response:
"This transaction ID has already been verified for another account.

If you believe this is an error, please contact support with:
- Your UPI ID
- Transaction date and time
- Screenshot of payment confirmation

Support: support@niyati.com"
```

### Concurrent Request Handling

#### Race Condition: Multiple Credit Deductions
**Scenario**: User rapidly sends 3 queries in 2 seconds

**Backend Protection:**
```javascript
// Use database row-level locking
const result = await db.query(`
  UPDATE user_credits 
  SET credits = credits - ?
  WHERE user_id = ?
  AND credits >= ?
  FOR UPDATE  -- Row-level lock
`, [creditCost, userId, creditCost]);

if (result.affectedRows === 0) {
  throw new Error('INSUFFICIENT_CREDITS');
}
```

**Result**: Only requests with sufficient credits succeed, others fail gracefully

#### Race Condition: Simultaneous Payments
**Scenario**: User submits payment from 2 devices

**Backend Protection:**
```sql
-- Unique constraint on transaction_id
ALTER TABLE payment_verifications
ADD UNIQUE INDEX idx_unique_txn (transaction_id);

-- Second submission will fail with duplicate key error
```

**UI Behavior:** Second submission displays:
```
"This payment is already being processed. Please wait for verification."
```

### Age Restriction Enforcement

#### Underage User Attempts Premium Query
**Scenario**: 16-year-old user bypasses profile check

**n8n Workflow Check:**
```javascript
const age = calculateAge(metadata.dob);
if (age < 18) {
  return {
    error: "AGE_RESTRICTED",
    message: "Premium features are only available for users 18 and above."
  };
}
```

**Backend**: No credits are deducted

**Niyati's Response:**
```
I'm unable to provide this analysis at this time.

Premium birth chart features are available for users aged 18 and above.

You can still enjoy:
- Daily horoscopes
- General astrological insights
- Planetary information

Thank you for understanding! 🙏
```

### Data Integrity Issues

#### Missing Profile After Authentication
**Scenario**: User authenticated but profile deleted manually

**Backend Check:**
```sql
SELECT * FROM user_profiles WHERE user_id = 'usr_7f3a9b2c1d4e';
-- Returns NULL
```

**System Behavior:**
- Treat as new user
- Re-initiate onboarding (Phase 2)

#### Negative Credit Balance
**Scenario**: Database corruption causes negative balance

**Backend Detection:**
```sql
-- Scheduled integrity check
SELECT user_id, credits 
FROM user_credits 
WHERE credits < 0;
```

**Automated Fix:**
```sql
UPDATE user_credits 
SET credits = 0,
    integrity_corrected = true
WHERE credits < 0;
```

**Admin Alert:** Email sent to ops team

---

## Technical Architecture

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                     User Interface                       │
│  (React SPA - localhost/ or niyati.com)                 │
│  - Chat Interface                                        │
│  - Credit Display                                        │
│  - Payment QR                                            │
│  - Session Management                                    │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ HTTPS/REST
                 │
┌────────────────▼────────────────────────────────────────┐
│              BFF (Backend for Frontend)                  │
│              Service: bff-auth                           │
│  Endpoints:                                              │
│  - POST /api/v1/users/identify                          │
│  - POST /api/v1/users/profile                           │
│  - POST /api/v1/chat/classify                           │
│  - POST /api/v1/users/deduct-credits                    │
│  - POST /api/v1/payments/submit                         │
│  - POST /api/v1/payments/verify                         │
└────────────────┬────────────────────────────────────────┘
                 │
                 │
      ┌──────────┴─────────┬───────────────┐
      │                    │               │
      │                    │               │
┌─────▼──────┐  ┌─────────▼────────┐  ┌──▼──────────────┐
│ PostgreSQL │  │   n8n Workflow    │  │  UPI Gateway    │
│  Database  │  │   (AI Agent)      │  │  (Razorpay)     │
│            │  │                   │  │                 │
│  Tables:   │  │  - Classify       │  │  - Verify Txn   │
│  - users   │  │  - Age Check      │  │  - Check Status │
│  - user_   │  │  - Astro Compute  │  │  - Webhooks     │
│    profiles│  │  - Claude API     │  └─────────────────┘
│  - user_   │  │  - Response       │
│    credits │  │                   │
│  - charge_ │  └───────────────────┘
│    transactions                     
│  - payment_                         
│    verifications                    
└────────────┘                        
```

### Database Schema

```sql
-- Users table
CREATE TABLE users (
  user_id VARCHAR(50) PRIMARY KEY,
  phone_number VARCHAR(20) NOT NULL UNIQUE,
  country_code VARCHAR(5) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_phone (phone_number, country_code)
);

-- User profiles table
CREATE TABLE user_profiles (
  profile_id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  dob DATE NOT NULL,
  tob TIME NOT NULL,
  birth_place VARCHAR(200) NOT NULL,
  latitude DECIMAL(10, 7) NOT NULL,
  longitude DECIMAL(10, 7) NOT NULL,
  timezone VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_user (user_id)
);

-- User credits table
CREATE TABLE user_credits (
  user_id VARCHAR(50) PRIMARY KEY,
  credits INT NOT NULL DEFAULT 10,
  is_paid BOOLEAN DEFAULT FALSE,
  last_payment_date TIMESTAMP NULL,
  last_reset_date DATE DEFAULT CURRENT_DATE,
  expired_credits INT DEFAULT 0,
  profile_complete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CHECK (credits >= 0)
);

-- Charge transactions table
CREATE TABLE charge_transactions (
  transaction_id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  idempotency_key VARCHAR(100) UNIQUE,
  credit_amount INT NOT NULL,  -- Negative for deductions, positive for additions
  query_type VARCHAR(50),
  status ENUM('pending', 'completed', 'failed') DEFAULT 'completed',
  payment_id VARCHAR(50) NULL,  -- Links to payment_verifications if applicable
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_user_created (user_id, created_at),
  INDEX idx_idempotency (idempotency_key)
);

-- Payment verifications table
CREATE TABLE payment_verifications (
  verification_id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  upi_id VARCHAR(100) NOT NULL,
  transaction_id VARCHAR(20) NOT NULL UNIQUE,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(5) DEFAULT 'INR',
  credits INT NOT NULL,
  status ENUM('pending', 'verified', 'failed', 'manual_review', 'amount_mismatch') DEFAULT 'pending',
  verification_method VARCHAR(50),
  provider_response JSON,
  review_reason VARCHAR(200),
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMP NULL,
  
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_user_status (user_id, status),
  INDEX idx_txn (transaction_id)
);

-- Chat messages table
CREATE TABLE chat_messages (
  message_id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  role ENUM('user', 'assistant') NOT NULL,
  content TEXT NOT NULL,
  query_type VARCHAR(50),
  credit_cost INT DEFAULT 0,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_user_created (user_id, created_at DESC)
);
```

### API Endpoints

#### Authentication
- `POST /api/v1/users/identify` - Identify new/returning user
- `POST /api/v1/users/logout` - Logout and invalidate session

#### Profile Management
- `POST /api/v1/users/profile` - Create/update user profile
- `GET /api/v1/users/profile` - Retrieve user profile
- `DELETE /api/v1/users/profile` - Delete user account

#### Chat & Classification
- `POST /api/v1/chat/classify` - Classify query intent and cost
- `POST /api/v1/chat/send` - Send message (proxy to n8n)
- `GET /api/v1/chat/history` - Retrieve chat history

#### Credits & Billing
- `GET /api/v1/users/credits` - Get current credit balance
- `POST /api/v1/users/deduct-credits` - Deduct credits after query
- `GET /api/v1/users/transactions` - Get transaction history

#### Payments
- `POST /api/v1/payments/submit` - Submit payment details
- `GET /api/v1/payments/status/:verificationId` - Check verification status
- `POST /api/v1/payments/verify` - Manual verification trigger (admin)

### Security Considerations

#### Authentication
- JWT tokens with 24-hour expiry
- Secure httpOnly cookies for refresh tokens
- Phone number + OTP verification (if implemented)

#### Data Protection
- All sensitive data encrypted at rest
- HTTPS/TLS for all API communications
- Input sanitization (DOMPurify) on frontend
- Parameterized SQL queries (prevent SQL injection)

#### Rate Limiting
```javascript
// API rate limits
const rateLimits = {
  '/api/v1/chat/send': { max: 10, window: '1m' },  // 10 queries per minute
  '/api/v1/payments/submit': { max: 5, window: '10m' },  // 5 submissions per 10 min
  '/api/v1/users/identify': { max: 3, window: '5m' }  // 3 attempts per 5 min
};
```

#### Payment Security
- PCI-DSS compliance (handled by Razorpay)
- No credit card data stored
- UPI IDs hashed before storage
- Transaction IDs validated against provider

---

## Appendices

### A. Query Classification Matrix

| User Query Example | Intent | Query Type | Credit Cost | Is Premium |
|-------------------|--------|------------|-------------|------------|
| "What does today hold for me?" | horoscope.today | horoscope | 2 | No |
| "My weekly horoscope please" | horoscope.weekly | horoscope | 2 | No |
| "When will I get married?" | premium.marriage.timing | premium | 6 | Yes |
| "Is this a good time to invest?" | premium.financial.investment | premium | 5 | Yes |
| "Career advice for this year" | premium.career.yearly | premium | 5 | Yes |
| "My compatibility with Pisces" | premium.relationship.compatibility | premium | 4 | Yes |
| "Health issues to watch out for" | premium.health.prediction | premium | 4 | Yes |
| "Remedies for financial problems" | premium.remedy.financial | premium | 6 | Yes |

### B. Error Codes Reference

| Error Code | Description | User Message |
|-----------|-------------|--------------|
| AUTH_001 | Invalid phone number | "Please enter a valid phone number" |
| AUTH_002 | Session expired | "Your session has expired. Please log in again." |
| PROFILE_001 | Missing required fields | "Please provide all required birth details" |
| PROFILE_002 | Invalid date of birth | "Please check your date of birth" |
| PROFILE_003 | Underage user | "Niyati is available for users 13 and above" |
| CREDIT_001 | Insufficient credits | "You need X more credits for this query" |
| CREDIT_002 | Deduction failed | "Unable to process. Please try again." |
| PAYMENT_001 | Invalid UPI ID | "Please provide a valid UPI ID" |
| PAYMENT_002 | Invalid transaction ID | "Transaction ID must be 12 digits" |
| PAYMENT_003 | Verification timeout | "Verification is taking longer than usual..." |
| PAYMENT_004 | Amount mismatch | "Payment amount doesn't match package price" |
| PAYMENT_005 | Duplicate transaction | "This transaction has already been processed" |
| AI_001 | AI response timeout | "Niyati is taking longer than usual..." |
| AI_002 | AI service unavailable | "Service temporarily unavailable" |

### C. Notification Templates

#### Monthly Credit Reset
```
Subject: Your free credits have been reset!
Body: Hi {name}, your 10 monthly free credits are now available. 
      Explore your horoscope at niyati.com
```

#### Payment Verified
```
Subject: Payment confirmed - 50 credits added!
Body: Hi {name}, your payment of ₹500 has been verified. 
      50 credits have been added to your account. 
      Valid until {expiry_date}.
```

#### Credits Expiring Soon
```
Subject: Your credits expire in 7 days
Body: Hi {name}, you have {credits} unused credits that will expire on {date}.
      Use them before they expire!
```

#### Credits Expired
```
Subject: Your premium credits have expired
Body: Hi {name}, your {credits} unused credits have expired. 
      Top up now to continue enjoying premium insights!
```

---

## Conclusion

This comprehensive interaction script covers the complete user journey through the Niyati astrology application, from initial authentication through premium feature usage. Key highlights:

- **Seamless Onboarding**: Intelligent NLP extraction minimizes user friction
- **Tiered Access**: Clear distinction between free and premium features
- **Robust Billing**: Idempotent credit deduction prevents double-charging
- **Payment Verification**: Automated UPI verification with fallback to manual review
- **Error Resilience**: Comprehensive error handling and retry mechanisms
- **Security First**: Multiple layers of validation and fraud prevention

The system is designed to provide users with an intuitive, trustworthy astrology consultation experience while maintaining business integrity through careful credit management and payment processing.

