# 🚀 Development Roadmap & Enhancement Guide

This guide outlines strategic enhancements, feature additions, and technical improvements to evolve Niyati into a comprehensive astrology platform.

## 📋 Table of Contents

1. [Immediate Priorities](#immediate-priorities)
2. [Testing Infrastructure](#testing-infrastructure)
3. [User Authentication & Accounts](#user-authentication--accounts)
4. [Chat History & Persistence](#chat-history--persistence)
5. [Advanced Astrology Features](#advanced-astrology-features)
6. [UI/UX Enhancements](#uiux-enhancements)
7. [AI/ML Integration](#aiml-integration)
8. [Social & Community Features](#social--community-features)
9. [Monetization Features](#monetization-features)
10. [Technical Debt & Refactoring](#technical-debt--refactoring)

---

## Immediate Priorities

### 1. Complete Testing Infrastructure

**Current State:** No test suites configured

**Priority Tasks:**

#### Unit Tests (BFF)
```bash
# Install dependencies
npm install --save-dev jest supertest @jest/globals

# Create test structure
mkdir -p be/bff/tests/{unit,integration,load}
```

**Test Coverage Goals:**
- **Services:** 80%+ coverage (astrologyService, geocodeService)
- **Routes:** 90%+ coverage (all API endpoints)
- **Utilities:** 95%+ coverage (logger, sanitize, responses)

**Example Test Structure:**
```javascript
// tests/unit/services/geocodeService.test.js
const geocodeService = require('../../../src/services/geocodeService');

describe('GeocodeService', () => {
  describe('geocode', () => {
    it('should return coordinates for valid location', async () => {
      const result = await geocodeService.geocode('Pune, India');
      expect(result).toHaveProperty('lat');
      expect(result).toHaveProperty('lng');
    });
    
    it('should handle invalid locations gracefully', async () => {
      await expect(geocodeService.geocode(''))
        .rejects.toThrow();
    });
    
    it('should use cache for repeated requests', async () => {
      // First call
      await geocodeService.geocode('Mumbai, India');
      // Second call should hit cache
      const result = await geocodeService.geocode('Mumbai, India');
      expect(result).toBeDefined();
    });
  });
});
```

#### Integration Tests
```javascript
// tests/integration/api.test.js
const request = require('supertest');
const app = require('../../src/index');

describe('API Integration Tests', () => {
  describe('POST /api/v1/geocode', () => {
    it('should return geocoded location', async () => {
      const response = await request(app)
        .post('/api/v1/geocode')
        .send({ location: 'Pune, India' })
        .expect(200);
      
      expect(response.body).toHaveProperty('lat');
      expect(response.body).toHaveProperty('lng');
    });
  });
});
```

#### E2E Tests (UI)
```bash
# Install Playwright
cd ui
npm install --save-dev @playwright/test

# Initialize Playwright
npx playwright install
```

**Critical User Flows:**
1. **Login Flow:** Enter name → Submit → See profile
2. **Profile Creation:** Fill DOB → Place of birth → Time → Submit
3. **Chat Flow:** Send message → Receive response → See formatted markdown
4. **Astrology Reading:** Complete profile → Request reading → See detailed analysis

**Example E2E Test:**
```javascript
// ui/tests/e2e/complete-flow.spec.js
import { test, expect } from '@playwright/test';

test('complete astrology reading flow', async ({ page }) => {
  await page.goto('http://localhost:5173');
  
  // Login
  await page.fill('input[placeholder="Your name"]', 'Test User');
  await page.click('button:has-text("Start")');
  
  // Fill profile
  await page.fill('input[type="date"]', '1990-01-15');
  await page.fill('input[placeholder="Birth place"]', 'Pune, India');
  await page.fill('input[type="time"]', '14:30');
  await page.click('button:has-text("Save")');
  
  // Send message
  await page.fill('textarea', 'Tell me about my sun sign');
  await page.click('button[type="submit"]');
  
  // Wait for response
  await expect(page.locator('.message-ai')).toBeVisible({ timeout: 10000 });
});
```

#### Load Tests
```bash
# Install Artillery
npm install -g artillery

# Create load test config
mkdir -p be/bff/tests/load
```

**Load Test Scenarios:**
```yaml
# tests/load/baseline.yml
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Sustained load"
    - duration: 60
      arrivalRate: 100
      name: "Peak load"

scenarios:
  - name: "Geocode API"
    flow:
      - post:
          url: "/api/v1/geocode"
          json:
            location: "Pune, India"
  
  - name: "Health check"
    flow:
      - get:
          url: "/api/v1/telemetry/health"
```

**Performance Targets:**
- 100 requests/sec sustained
- p95 latency < 500ms
- p99 latency < 1000ms
- 0% error rate under normal load

---

## User Authentication & Accounts

### Current State
- No user accounts
- Profile stored in localStorage only
- No multi-device sync

### Implementation Plan

#### Phase 1: Basic Authentication

**Tech Stack:**
- **JWT** for token-based auth
- **bcrypt** for password hashing
- **Redis** for session storage

**Database Schema:**
```sql
-- PostgreSQL schema
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  email_verified BOOLEAN DEFAULT FALSE
);

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  dob DATE NOT NULL,
  time_of_birth TIME,
  place_of_birth JSONB NOT NULL, -- {city, country, lat, lng}
  gender VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_profiles_user_id ON user_profiles(user_id);
```

**BFF Routes:**
```javascript
// src/routes/auth.js
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  
  // Validation
  if (!email || !password || !name) {
    return res.error('MISSING_FIELDS', 'Email, password, and name required');
  }
  
  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);
  
  // Create user
  const user = await db.query(
    'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
    [email, passwordHash, name]
  );
  
  // Generate JWT
  const token = jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  
  res.success({ user, token });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  // Find user
  const user = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  if (!user) {
    return res.error('INVALID_CREDENTIALS', 'Invalid email or password');
  }
  
  // Verify password
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.error('INVALID_CREDENTIALS', 'Invalid email or password');
  }
  
  // Generate token
  const token = jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  
  res.success({ user: { id: user.id, email: user.email, name: user.name }, token });
});
```

**Authentication Middleware:**
```javascript
// src/middleware/auth.js
const jwt = require('jsonwebtoken');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.error('UNAUTHORIZED', 'Authentication required', 401);
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.error('INVALID_TOKEN', 'Invalid or expired token', 401);
  }
};

module.exports = { authenticate };
```

#### Phase 2: Social Login

**Providers:**
- Google OAuth 2.0
- GitHub
- Apple Sign-In

**Implementation:**
```bash
npm install passport passport-google-oauth20 passport-github2
```

```javascript
// src/auth/strategies/google.js
const GoogleStrategy = require('passport-google-oauth20').Strategy;

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  // Find or create user
  let user = await db.query('SELECT * FROM users WHERE email = $1', [profile.emails[0].value]);
  
  if (!user) {
    user = await db.query(
      'INSERT INTO users (email, name, oauth_provider, oauth_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [profile.emails[0].value, profile.displayName, 'google', profile.id]
    );
  }
  
  done(null, user);
}));
```

#### Phase 3: Email Verification

```javascript
// Send verification email
const sendVerificationEmail = async (user) => {
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '24h' });
  const verificationUrl = `${process.env.APP_URL}/verify-email?token=${token}`;
  
  await emailService.send({
    to: user.email,
    subject: 'Verify your Niyati account',
    template: 'verify-email',
    data: { name: user.name, verificationUrl }
  });
};

router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    await db.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [decoded.userId]);
    res.redirect('/login?verified=true');
  } catch (err) {
    res.error('INVALID_TOKEN', 'Verification link expired or invalid');
  }
});
```

---

## Chat History & Persistence

### Current State
- Messages stored only in component state
- Lost on page refresh
- No history across sessions

### Implementation Plan

**Database Schema:**
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL, -- 'user' or 'assistant'
  content TEXT NOT NULL,
  metadata JSONB, -- Store profile data, astrology results, etc.
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
```

**BFF Routes:**
```javascript
// src/routes/conversations.js
router.get('/', authenticate, async (req, res) => {
  const conversations = await db.query(
    `SELECT c.*, COUNT(m.id) as message_count, MAX(m.created_at) as last_message_at
     FROM conversations c
     LEFT JOIN messages m ON c.id = m.conversation_id
     WHERE c.user_id = $1
     GROUP BY c.id
     ORDER BY last_message_at DESC`,
    [req.user.userId]
  );
  
  res.success({ conversations });
});

router.post('/', authenticate, async (req, res) => {
  const { title } = req.body;
  
  const conversation = await db.query(
    'INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING *',
    [req.user.userId, title || 'New Conversation']
  );
  
  res.success({ conversation });
});

router.get('/:id/messages', authenticate, async (req, res) => {
  const { id } = req.params;
  
  // Verify ownership
  const conversation = await db.query(
    'SELECT * FROM conversations WHERE id = $1 AND user_id = $2',
    [id, req.user.userId]
  );
  
  if (!conversation) {
    return res.error('NOT_FOUND', 'Conversation not found', 404);
  }
  
  const messages = await db.query(
    'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
    [id]
  );
  
  res.success({ messages });
});

router.post('/:id/messages', authenticate, async (req, res) => {
  const { id } = req.params;
  const { role, content, metadata } = req.body;
  
  const message = await db.query(
    'INSERT INTO messages (conversation_id, role, content, metadata) VALUES ($1, $2, $3, $4) RETURNING *',
    [id, role, content, metadata]
  );
  
  res.success({ message });
});
```

**UI Updates:**
```javascript
// hooks/useConversations.js
export const useConversations = () => {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  
  const loadConversations = async () => {
    const response = await fetch(`${API_URL}/api/v1/conversations`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();
    setConversations(data.conversations);
  };
  
  const createConversation = async (title) => {
    const response = await fetch(`${API_URL}/api/v1/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ title })
    });
    const data = await response.json();
    setConversations([data.conversation, ...conversations]);
    return data.conversation;
  };
  
  return { conversations, activeConversation, loadConversations, createConversation };
};
```

---

## Advanced Astrology Features

### Feature Set

#### 1. Detailed Birth Chart Analysis

```javascript
// src/services/astrology/birthChart.js
const generateBirthChart = async (profile) => {
  const planets = await astrologyAPI.getPlanetPositions(profile);
  const houses = await astrologyAPI.getHouses(profile);
  const aspects = await astrologyAPI.getAspects(profile);
  
  return {
    planets,
    houses,
    aspects,
    chart: {
      ascendant: houses[0],
      midheaven: houses[9],
      sunSign: planets.sun.sign,
      moonSign: planets.moon.sign,
      risingSign: houses[0].sign
    }
  };
};
```

#### 2. Daily Horoscope

```javascript
router.get('/horoscope/daily/:sign', async (req, res) => {
  const { sign } = req.params;
  const date = req.query.date || new Date().toISOString().split('T')[0];
  
  // Check cache
  const cacheKey = `horoscope:daily:${sign}:${date}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return res.success(JSON.parse(cached));
  }
  
  const horoscope = await astrologyService.getDailyHoroscope(sign, date);
  
  // Cache for 12 hours
  await redis.setex(cacheKey, 43200, JSON.stringify(horoscope));
  
  res.success(horoscope);
});
```

#### 3. Compatibility Matching

```sql
CREATE TABLE compatibility_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id UUID REFERENCES users(id),
  user2_id UUID REFERENCES users(id),
  compatibility_score INTEGER,
  analysis JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

```javascript
router.post('/compatibility', authenticate, async (req, res) => {
  const { profile1, profile2 } = req.body;
  
  const compatibility = await astrologyService.calculateCompatibility(profile1, profile2);
  
  // Save reading
  await db.query(
    'INSERT INTO compatibility_readings (user1_id, user2_id, compatibility_score, analysis) VALUES ($1, $2, $3, $4)',
    [req.user.userId, profile2.userId, compatibility.score, compatibility.analysis]
  );
  
  res.success(compatibility);
});
```

#### 4. Transit Predictions

```javascript
const getTransits = async (profile) => {
  const birthChart = await getBirthChart(profile);
  const currentPlanets = await getCurrentPlanetPositions();
  
  const transits = [];
  
  for (const [planet, position] of Object.entries(currentPlanets)) {
    const natalPosition = birthChart.planets[planet];
    const aspect = calculateAspect(position, natalPosition);
    
    if (aspect.isSignificant) {
      transits.push({
        planet,
        aspect: aspect.type,
        interpretation: interpretTransit(planet, aspect.type),
        startDate: aspect.startDate,
        endDate: aspect.endDate
      });
    }
  }
  
  return transits;
};
```

#### 5. Vedic Astrology Support

```javascript
// src/services/astrology/vedic.js
const calculateVedicChart = async (profile) => {
  // Convert to sidereal zodiac
  const ayanamsa = calculateAyanamsa(profile.dob);
  
  const planets = await getPlanetPositions(profile);
  const vedicPlanets = planets.map(p => ({
    ...p,
    vedicSign: convertToVedicSign(p.longitude - ayanamsa),
    nakshatra: calculateNakshatra(p.longitude - ayanamsa),
    pada: calculatePada(p.longitude - ayanamsa)
  }));
  
  return {
    planets: vedicPlanets,
    ascendant: calculateVedicAscendant(profile),
    dasha: calculateDasha(profile),
    divisionalCharts: calculateDivisionalCharts(profile)
  };
};
```

---

## UI/UX Enhancements

### 1. Conversation Sidebar

```jsx
// components/ConversationSidebar.jsx
const ConversationSidebar = ({ conversations, activeId, onSelect, onNew }) => {
  return (
    <div className="w-64 bg-purple-900/20 border-r border-purple-500/20">
      <div className="p-4">
        <button
          onClick={onNew}
          className="w-full px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-500"
        >
          + New Conversation
        </button>
      </div>
      
      <div className="overflow-y-auto">
        {conversations.map(conv => (
          <div
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={`p-4 cursor-pointer hover:bg-purple-800/30 ${
              activeId === conv.id ? 'bg-purple-800/50' : ''
            }`}
          >
            <div className="font-medium text-white">{conv.title}</div>
            <div className="text-sm text-purple-300">
              {conv.message_count} messages
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

### 2. Rich Astrology Visualizations

```bash
npm install chart.js react-chartjs-2 d3
```

**Birth Chart Wheel:**
```jsx
// components/BirthChartWheel.jsx
import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const BirthChartWheel = ({ planets, houses }) => {
  const svgRef = useRef();
  
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    const width = 500;
    const height = 500;
    const radius = Math.min(width, height) / 2 - 40;
    
    // Draw zodiac wheel
    const zodiacSigns = ['Aries', 'Taurus', 'Gemini', /* ... */];
    const arc = d3.arc()
      .innerRadius(radius - 40)
      .outerRadius(radius);
    
    const pie = d3.pie()
      .value(30) // 30 degrees per sign
      .sort(null);
    
    svg.selectAll('.zodiac-slice')
      .data(pie(zodiacSigns))
      .enter()
      .append('path')
      .attr('class', 'zodiac-slice')
      .attr('d', arc)
      .attr('transform', `translate(${width/2}, ${height/2})`)
      .style('fill', (d, i) => d3.schemeCategory10[i % 10]);
    
    // Draw planets
    planets.forEach(planet => {
      const angle = (planet.longitude - 90) * Math.PI / 180;
      const x = width/2 + (radius - 20) * Math.cos(angle);
      const y = height/2 + (radius - 20) * Math.sin(angle);
      
      svg.append('circle')
        .attr('cx', x)
        .attr('cy', y)
        .attr('r', 8)
        .style('fill', planet.color);
      
      svg.append('text')
        .attr('x', x)
        .attr('y', y + 20)
        .text(planet.symbol)
        .style('text-anchor', 'middle');
    });
  }, [planets, houses]);
  
  return <svg ref={svgRef} width="500" height="500" />;
};
```

### 3. Progressive Web App (PWA)

```javascript
// vite.config.js
import { VitePWA } from 'vite-plugin-pwa';

export default {
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Niyati - AI Astrology Chat',
        short_name: 'Niyati',
        description: 'Personalized astrology readings powered by AI',
        theme_color: '#7c3aed',
        background_color: '#1e1b4b',
        display: 'standalone',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.yourdomain\.com\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 3600
              }
            }
          }
        ]
      }
    })
  ]
};
```

### 4. Dark/Light Theme Toggle

```jsx
// hooks/useTheme.js
export const useTheme = () => {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark';
  });
  
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);
  
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  
  return { theme, toggleTheme };
};
```

### 5. Accessibility Improvements

```jsx
// Add ARIA labels
<button
  aria-label="Send message"
  aria-disabled={isLoading}
  className="send-button"
>
  <Send aria-hidden="true" />
</button>

// Keyboard navigation
const handleKeyDown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
};

// Screen reader announcements
<div role="status" aria-live="polite" className="sr-only">
  {isLoading ? 'Loading response...' : ''}
</div>
```

---

## AI/ML Integration

### 1. Custom AI Model Fine-Tuning

**Approach:** Fine-tune GPT-3.5/4 on astrology-specific dataset

```javascript
// Training data format
const trainingData = [
  {
    messages: [
      { role: 'system', content: 'You are an expert astrologer...' },
      { role: 'user', content: 'What does my sun in Aries mean?' },
      { role: 'assistant', content: 'Sun in Aries indicates...' }
    ]
  }
];

// Fine-tuning script
const openai = require('openai');

const fineTune = async () => {
  const file = await openai.files.create({
    file: fs.createReadStream('training-data.jsonl'),
    purpose: 'fine-tune'
  });
  
  const job = await openai.fineTuning.jobs.create({
    training_file: file.id,
    model: 'gpt-3.5-turbo',
    hyperparameters: {
      n_epochs: 3
    }
  });
  
  console.log('Fine-tuning job:', job.id);
};
```

### 2. Sentiment Analysis for User Messages

```javascript
// Analyze user sentiment to personalize responses
const analyzeSentiment = async (text) => {
  const response = await fetch('https://api.openai.com/v1/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'text-davinci-003',
      prompt: `Analyze the sentiment of this message: "${text}"\nSentiment:`,
      max_tokens: 10
    })
  });
  
  const data = await response.json();
  return data.choices[0].text.trim(); // positive, negative, neutral
};
```

### 3. Recommendation Engine

```javascript
// Recommend topics based on user's chart and previous questions
const getRecommendations = async (userId) => {
  const profile = await getUserProfile(userId);
  const history = await getConversationHistory(userId);
  
  const topics = [];
  
  // Analyze recent transits
  const transits = await getTransits(profile);
  if (transits.length > 0) {
    topics.push({
      type: 'transit',
      title: `Current ${transits[0].planet} transit`,
      description: transits[0].interpretation
    });
  }
  
  // Suggest unexplored areas
  const discussed = history.flatMap(h => h.topics);
  const allTopics = ['career', 'love', 'health', 'finance', 'spirituality'];
  const unexplored = allTopics.filter(t => !discussed.includes(t));
  
  if (unexplored.length > 0) {
    topics.push({
      type: 'suggestion',
      title: `Explore your ${unexplored[0]} potential`,
      description: `Learn about your astrological influences in ${unexplored[0]}`
    });
  }
  
  return topics;
};
```

### 4. Voice Input/Output

```bash
npm install @speechly/react-client
```

```jsx
// components/VoiceInput.jsx
import { useSpeechRecognition } from '@speechly/react-client';

const VoiceInput = ({ onTranscript }) => {
  const { listening, transcript, startListening, stopListening } = useSpeechRecognition();
  
  useEffect(() => {
    if (transcript) {
      onTranscript(transcript);
    }
  }, [transcript]);
  
  return (
    <button
      onMouseDown={startListening}
      onMouseUp={stopListening}
      className={`voice-button ${listening ? 'active' : ''}`}
    >
      <Mic />
    </button>
  );
};
```

---

## Social & Community Features

### 1. User Profiles (Public)

```sql
CREATE TABLE public_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  username VARCHAR(50) UNIQUE,
  bio TEXT,
  avatar_url VARCHAR(500),
  sun_sign VARCHAR(20),
  moon_sign VARCHAR(20),
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 2. Share Readings

```javascript
router.post('/share/:messageId', authenticate, async (req, res) => {
  const { messageId } = req.params;
  const { platform } = req.body; // 'twitter', 'facebook', 'link'
  
  const message = await getMessage(messageId);
  
  // Generate shareable link
  const shareId = generateShortId();
  await redis.setex(`share:${shareId}`, 604800, JSON.stringify(message)); // 7 days
  
  const shareUrl = `${process.env.APP_URL}/share/${shareId}`;
  
  res.success({ shareUrl });
});
```

### 3. Community Forum

```sql
CREATE TABLE forum_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  category VARCHAR(50),
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  upvotes INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE forum_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES forum_posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 4. Follow System

```sql
CREATE TABLE follows (
  follower_id UUID REFERENCES users(id),
  following_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id)
);
```

---

## Monetization Features

### 1. Subscription Tiers

```sql
CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  billing_cycle VARCHAR(20), -- 'monthly', 'yearly'
  features JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  plan_id UUID REFERENCES subscription_plans(id),
  status VARCHAR(20), -- 'active', 'cancelled', 'expired'
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT FALSE
);
```

**Tier Structure:**
- **Free:** 10 messages/month, basic daily horoscope
- **Premium ($9.99/mo):** Unlimited messages, detailed birth chart, transit notifications
- **Professional ($29.99/mo):** All premium + compatibility readings, expert consultations

### 2. Stripe Integration

```bash
npm install stripe
```

```javascript
// src/services/payments/stripe.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

router.post('/create-checkout-session', authenticate, async (req, res) => {
  const { planId } = req.body;
  const plan = await getPlan(planId);
  
  const session = await stripe.checkout.sessions.create({
    customer_email: req.user.email,
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: plan.name,
          description: plan.description
        },
        unit_amount: plan.price * 100,
        recurring: {
          interval: plan.billing_cycle
        }
      },
      quantity: 1
    }],
    mode: 'subscription',
    success_url: `${process.env.APP_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.APP_URL}/subscription/cancelled`
  });
  
  res.success({ sessionId: session.id });
});

// Webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionCancelled(event.data.object);
      break;
  }
  
  res.json({ received: true });
});
```

### 3. Credit System

```sql
CREATE TABLE user_credits (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  credits INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  amount INTEGER NOT NULL,
  type VARCHAR(20), -- 'purchase', 'usage', 'refund', 'bonus'
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 4. One-on-One Consultations

```sql
CREATE TABLE astrologers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  specialization TEXT[],
  hourly_rate DECIMAL(10, 2),
  bio TEXT,
  years_experience INTEGER,
  rating DECIMAL(3, 2),
  verified BOOLEAN DEFAULT FALSE
);

CREATE TABLE consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES users(id),
  astrologer_id UUID REFERENCES astrologers(id),
  scheduled_at TIMESTAMP NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  status VARCHAR(20), -- 'scheduled', 'completed', 'cancelled'
  meeting_url VARCHAR(500),
  payment_amount DECIMAL(10, 2)
);
```

---

## Technical Debt & Refactoring

### 1. Migrate to TypeScript

```bash
# BFF
cd be/bff
npm install --save-dev typescript @types/node @types/express

# Initialize tsconfig.json
npx tsc --init

# UI
cd ui
npm install --save-dev typescript @types/react @types/react-dom
```

**Benefits:**
- Type safety reduces runtime errors
- Better IDE autocomplete
- Easier refactoring
- Self-documenting code

### 2. Add GraphQL API

```bash
npm install apollo-server-express graphql
```

```javascript
// src/graphql/schema.js
const { gql } = require('apollo-server-express');

const typeDefs = gql`
  type User {
    id: ID!
    email: String!
    name: String!
    profile: Profile
  }
  
  type Profile {
    dob: String!
    timeOfBirth: String
    placeOfBirth: Place!
  }
  
  type Place {
    city: String!
    country: String!
    lat: Float!
    lng: Float!
  }
  
  type Query {
    me: User
    conversations: [Conversation!]!
    birthChart(profileId: ID!): BirthChart!
  }
  
  type Mutation {
    createProfile(input: ProfileInput!): Profile!
    sendMessage(conversationId: ID!, content: String!): Message!
  }
`;

const resolvers = {
  Query: {
    me: (_, __, { user }) => getUserById(user.userId),
    conversations: (_, __, { user }) => getConversations(user.userId)
  },
  Mutation: {
    createProfile: (_, { input }, { user }) => createProfile(user.userId, input)
  }
};
```

### 3. Implement Caching Strategy

```javascript
// Multi-layer caching
const cache = {
  // L1: In-memory (node-cache)
  memory: new NodeCache({ stdTTL: 300 }), // 5 minutes
  
  // L2: Redis
  redis: require('./redis'),
  
  get: async (key) => {
    // Try memory first
    let value = cache.memory.get(key);
    if (value) return value;
    
    // Try Redis
    value = await cache.redis.get(key);
    if (value) {
      cache.memory.set(key, value);
      return JSON.parse(value);
    }
    
    return null;
  },
  
  set: async (key, value, ttl = 3600) => {
    cache.memory.set(key, value, ttl);
    await cache.redis.setex(key, ttl, JSON.stringify(value));
  }
};
```

### 4. Add Request Validation

```bash
npm install joi
```

```javascript
// src/middleware/validate.js
const Joi = require('joi');

const schemas = {
  createProfile: Joi.object({
    dob: Joi.date().required(),
    timeOfBirth: Joi.string().pattern(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/),
    placeOfBirth: Joi.object({
      city: Joi.string().required(),
      country: Joi.string().required(),
      lat: Joi.number().min(-90).max(90).required(),
      lng: Joi.number().min(-180).max(180).required()
    }).required()
  })
};

const validate = (schemaName) => {
  return (req, res, next) => {
    const schema = schemas[schemaName];
    const { error } = schema.validate(req.body);
    
    if (error) {
      return res.error('VALIDATION_ERROR', error.details[0].message, 400);
    }
    
    next();
  };
};

// Usage
router.post('/profile', validate('createProfile'), async (req, res) => {
  // req.body is now validated
});
```

### 5. Improve Error Handling

```javascript
// src/lib/errors.js
class AppError extends Error {
  constructor(code, message, statusCode = 500, metadata = {}) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.metadata = metadata;
    this.isOperational = true;
  }
}

class NotFoundError extends AppError {
  constructor(resource, id) {
    super('NOT_FOUND', `${resource} with id ${id} not found`, 404, { resource, id });
  }
}

class ValidationError extends AppError {
  constructor(message, fields) {
    super('VALIDATION_ERROR', message, 400, { fields });
  }
}

// Global error handler
app.use((err, req, res, next) => {
  if (err.isOperational) {
    return res.error(err.code, err.message, err.statusCode, err.metadata);
  }
  
  // Unknown error
  logger.error({ err, req }, 'Unhandled error');
  res.error('INTERNAL_ERROR', 'An unexpected error occurred', 500);
});
```

---

## Development Workflow Improvements

### 1. API Documentation with Swagger

```bash
npm install swagger-jsdoc swagger-ui-express
```

```javascript
// src/docs/swagger.js
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Niyati API',
      version: '1.0.0',
      description: 'AI-powered astrology platform API'
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Development' },
      { url: 'https://api.niyati.com', description: 'Production' }
    ]
  },
  apis: ['./src/routes/*.js']
};

const specs = swaggerJsdoc(options);

// In index.js
const swaggerUi = require('swagger-ui-express');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
```

**Document endpoints:**
```javascript
/**
 * @swagger
 * /api/v1/geocode:
 *   post:
 *     summary: Geocode a location
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               location:
 *                 type: string
 *                 example: "Pune, India"
 *     responses:
 *       200:
 *         description: Geocoded location
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 lat:
 *                   type: number
 *                 lng:
 *                   type: number
 */
```

### 2. Database Migrations

```bash
npm install knex pg
npx knex init
```

```javascript
// migrations/20250101_create_users.js
exports.up = function(knex) {
  return knex.schema.createTable('users', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email', 255).unique().notNullable();
    table.string('password_hash', 255).notNullable();
    table.string('name', 100).notNullable();
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('users');
};
```

### 3. Feature Flags

```javascript
// src/lib/featureFlags.js
const features = {
  voiceInput: {
    enabled: process.env.FEATURE_VOICE_INPUT === 'true',
    rollout: 0.1 // 10% rollout
  },
  socialLogin: {
    enabled: process.env.NODE_ENV !== 'production',
    rollout: 1.0
  }
};

const isFeatureEnabled = (featureName, userId) => {
  const feature = features[featureName];
  if (!feature || !feature.enabled) return false;
  
  if (feature.rollout === 1.0) return true;
  
  // Hash-based rollout
  const hash = require('crypto')
    .createHash('md5')
    .update(userId + featureName)
    .digest('hex');
  const percentage = parseInt(hash.substr(0, 8), 16) / 0xffffffff;
  
  return percentage < feature.rollout;
};
```

---

## Priority Roadmap

### Q1 2026 (Jan-Mar)
- [ ] Complete testing infrastructure (unit, integration, E2E)
- [ ] Implement user authentication & accounts
- [ ] Add chat history persistence
- [ ] Set up staging environment

### Q2 2026 (Apr-Jun)
- [ ] Advanced astrology features (birth chart, daily horoscope)
- [ ] UI/UX enhancements (conversation sidebar, visualizations)
- [ ] PWA implementation
- [ ] API documentation (Swagger)

### Q3 2026 (Jul-Sep)
- [ ] Subscription system with Stripe
- [ ] Credit-based messaging
- [ ] Social features (sharing, public profiles)
- [ ] Migration to TypeScript

### Q4 2026 (Oct-Dec)
- [ ] Community forum
- [ ] One-on-one consultations marketplace
- [ ] Mobile apps (React Native)
- [ ] Scale to 10,000+ users

---

## Conclusion

This roadmap provides a structured approach to evolving Niyati from a prototype to a full-featured astrology platform. Prioritize based on:

1. **User Value** - Features that directly benefit users
2. **Technical Foundation** - Infrastructure that enables future features
3. **Revenue Potential** - Monetization capabilities
4. **Competitive Advantage** - Unique differentiators

**Next Immediate Steps:**

1. Set up testing infrastructure (this week)
2. Implement basic authentication (2 weeks)
3. Add chat persistence (1 week)
4. Deploy to staging (1 week)
5. Gather user feedback and iterate

**Remember:** Build incrementally, test thoroughly, and always prioritize user experience over feature count. Good luck building Niyati! 🚀
