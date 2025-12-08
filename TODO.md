# Work breakdown

## Production Readiness Checklist

### Optional Enhancements (post-launch)
- [ ] **Monitoring & logging** — Add Sentry for errors, Prometheus/Grafana for metrics
- [ ] **Orchestration (K8s)** — Plan migration when scaling/HA is required

### Pre-Deployment Checklist
- [ ] Create production secrets in `/etc/niyati/secrets/` on server
- [ ] Set `DOMAIN` and `CADDY_EMAIL` environment variables
- [ ] Configure DNS A record pointing to server IP
- [ ] Test backup restore workflow
- [ ] Run migrations in staging environment
- [ ] Update CORS origins in production config
- [ ] Run security audit (`npm audit`)
- [ ] Verify all health checks pass

---

## Astrology API integration (server/client safe steps)

- [ ] 4.5 Display basic astrological summary component (30-90m, Medium)
	- Create `AstrologySummary` component to show sun/moon/ascendant + short textual summary. Add unit/snapshot tests for rendering.
- [ ] 4.6 Error handling & rate-limit/backoff (30-90m, Medium)
	- Show friendly messages on failure, retry with exponential backoff, and use cached results when appropriate.

- [ ] 4.7 (Optional) Visualizations (charts/positions) (60-240m, High)
	- If desired, add small charts (SVG) showing planet positions or provide external link to detailed chart. Keep this optional for later.

## Numerology (deterministic, testable)

- [ ] 5.1 Implement numerology algorithm (Pythagorean) (30-90m, Medium)
	- Implement a pure function that maps full name and DoB to core numerology numbers. Make algorithm configurable (Pythagorean vs Chaldean) if needed.

- [ ] 5.2 Unit tests for numerology (15-60m, Low)
	- Add deterministic tests with known examples to ensure correctness.

- [ ] 5.3 Numerology UI component (20-60m, Medium)
	- Add a compact card to show the user's core numerology number and a short interpretation.

- [ ] 5.4 Hook numerology into profile flow (15-45m, Low)
	- When profile data is present or updated, compute numerology and display in profile/astrology area.

## Backend / Persisting Users (security-sensitive)

- [ ] 8.1 Persist first-login details to MongoDB (40-120m, Medium)
		- Description: When a user logs in for the first time, the client should persist whatever verified/tentative profile data we have (phone, country, name, dob, placeOfBirth, verified flags and explicit consent) into a server-side `users` collection in MongoDB. This allows recognizing returning users (avoid re-asking) and provides a central place for optional server-side features (caching astrology results, etc.). Do NOT store PII in the DB without explicit consent; the server must enforce consent checks.
		- Subtasks:
			- Design MongoDB schema for `users` collection: fields should include `phone` (E.164), `countryCode`, `dialCode`, `name`, `dob` (ISO), `placeOfBirth`, `verified` (object), `consentGiven` (boolean), `consentGivenAt` (timestamp), `profileHash`, `createdAt`, `updatedAt`.
			- Add server endpoint `POST /api/users/upsert-firstlogin` (or similar) that accepts phone + profile and performs an idempotent upsert by `phone`. The endpoint must require `consentGiven=true` and validate inputs on the server before persisting.
			- Add environment configuration: `MONGO_URL`, `MONGO_DB`, `MONGO_USERS_COLLECTION`, and document them in README.
			- Implement server-side validation, logging, and basic rate-limiting to avoid abuse.
			- Add indexing on `phone` (unique) and optionally `profileHash` for fast lookup.
			- Create an opt-in migration/import script to bulk-import existing client-side `niyati_profile` entries (only after consent migration plan is defined).
			- Add unit/integration tests for the upsert flow and consent enforcement.
			- Update `PRIVACY.md` with DB retention policy, deletion flow (how users can request deletion), and export instructions.
		- Acceptance criteria:
			- First-time login with explicit consent results in a server-side user document in MongoDB.
			- Revisiting users are recognized by phone and client UI pre-fills profile fields; no repeated prompts for already-verified fields.
			- Server refuses to persist PII if `consentGiven` is false or missing.

## User details completion

TODO:
- User said "I was born on 11th day of November 2005" the date was not resolved correctly. Add better date parsing / NLU to extract DoB from chat messages

---

# BFF (Backend-for-Frontend) Improvements
1. Security & Production Readiness
Add rate limiting to prevent abuse (especially for /api/geocode and /api/astrology endpoints)
Remove or disable /api/astrology/probe in production - it's a debug endpoint that could expose implementation details
Add request body size validation beyond the 500kb limit (validate actual payload structure)
Add CORS origin whitelist instead of allowing all origins in production
Add graceful shutdown handler to close connections properly
2. Error Handling & Resilience
Add global error handler middleware to catch unhandled errors and return consistent responses
Add 404 handler for undefined routes
Validate environment variables at startup and fail fast if critical ones are missing
Add health check endpoint (/health) that checks cache, and optionally provider connectivity
3. Performance & Monitoring
Add response time logging middleware
Add request/response compression (gzip/brotli)
Consider adding Redis for distributed caching instead of in-memory node-cache (for horizontal scaling)
Add metrics endpoint (optional) for Prometheus/similar
4. Code Quality
Extract magic numbers to constants (e.g., cache TTLs, retry counts)
Add JSDoc comments to service methods for better IDE support
Consider TypeScript for better type safety (optional, larger change)
Consolidate duplicate sanitization logic - both logger.js and astrologyService.js have similar sanitize functions
5. Dependencies
Replace deprecated body-parser - Express has built-in body parsing now (express.json(), express.urlencoded())
Add helmet CSP configuration for better security headers
Consider adding express-validator for input validation
UI (React App) Improvements
1. Performance
Memoize expensive computations using useMemo:
filteredCountries recalculates on every render
getUserCountry() is called multiple times
Debounce country search input to reduce filtering operations
Lazy load Privacy modal content only when first opened (already done partially)
Split large App.jsx into smaller components (ProfileHeader, ChatMessage, LoginForm, etc.)
2. State Management
Consolidate localStorage operations into custom hooks (useLocalStorage)
Consider React Context for shared state (profile, phone, countries) instead of prop drilling
Add error boundaries to catch rendering errors gracefully
Move complex extraction logic (extractProfileFields, normalizeDateString) to separate utility files
3. User Experience
Add loading states for long operations (geocoding, astrology calculations)
Add optimistic updates when sending messages
Add retry button for failed operations instead of just showing error messages
Add input validation feedback (real-time validation messages)
Add accessibility attributes (ARIA labels, roles, keyboard navigation)
4. Code Quality
Extract magic strings to constants (localStorage keys, API endpoints, cache TTLs)
Add PropTypes or TypeScript for component props validation
Reduce function complexity - some functions are 50-100+ lines (split into smaller helpers)
Remove commented/dead code if any exists
Add unit tests for utility functions (date parsing, hashing, extraction)
5. Security
Sanitize user input before displaying in chat (prevent XSS)
Validate phone numbers more strictly using libphonenumber or similar
Add CSP meta tags in index.html
Review DOMPurify configuration to ensure it's strict enough
6. Caching & Offline
Add service worker for offline support (optional)
Add cache versioning to invalidate old cached data when app updates
Add cache size limits to prevent localStorage from filling up
Consider IndexedDB for larger data instead of localStorage
Shared / Cross-Cutting Improvements
1. API Communication
Add request timeout configuration (currently hardcoded in various places)
Standardize error response format across all endpoints
Add API versioning (/api/v1/geocode) for future compatibility
Add request ID propagation from UI through to BFF logs (partially done)
2. Configuration
Add environment-specific configs (dev, staging, prod)
Document all environment variables in README with examples
Add config validation at app startup
Consider feature flags for experimental features
3. Testing
Add integration tests for critical flows (login → profile → astrology)
Add E2E tests using Playwright/Cypress
Add API contract tests between UI and BFF
Add load/stress tests for BFF endpoints
4. Documentation
Add API documentation (OpenAPI/Swagger for BFF)
Add component documentation (Storybook for UI components - optional)
Add architecture diagrams showing data flow
Document cache strategy and TTL decisions
5. DevOps
Add Docker support for consistent development environments
Add CI/CD pipeline (GitHub Actions)
Add pre-commit hooks (lint, format, test)
Add dependency vulnerability scanning
Priority Recommendations (Quick Wins)
If you want to implement improvements incrementally, I'd recommend this order:

High Priority (Security & Stability):

Replace body-parser with Express built-in parsers
Add global error handler to BFF
Add rate limiting to BFF endpoints
Disable /api/astrology/probe in production
Add environment variable validation at startup
Medium Priority (Performance & UX):
6. Memoize filteredCountries in UI
7. Extract large App.jsx into smaller components
8. Add loading states for async operations
9. Add health check endpoint to BFF
10. Consolidate duplicate sanitization logic

Lower Priority (Nice to Have):
11. Add TypeScript gradually
12. Add unit/integration tests
13. Add service worker for offline support
14. Consider Redis for distributed caching

---

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

- [ ] Increase test coverage to meet goals (80%+ services, 90%+ routes, 95%+ utilities)
- [ ] Add more edge case and error scenario tests
- [ ] Set up continuous integration pipeline

---

## User Authentication & Accounts

**Available Services:**
- Auth BFF: http://localhost:3001 (see README.md for API endpoints)
- PostgreSQL: Running with migrations applied
- Complete documentation in `/docs/auth/README.md`

**Future Enhancements:**
- [ ] Connect UI to auth endpoints (currently uses phone-only localStorage auth)
- [ ] Add user profile sync between localStorage and server
- [ ] Implement multi-device session management

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
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Advanced Astrology Features

### Feature Set

1. **Detailed Birth Chart Analysis** - Planets, houses, aspects
2. **Daily Horoscope** - Cached daily readings per sign
3. **Compatibility Matching** - Compare two birth charts
4. **Transit Predictions** - Current planetary transits
5. **Vedic Astrology Support** - Sidereal zodiac calculations

---

## UI/UX Enhancements

1. **Conversation Sidebar** - History and navigation
2. **Rich Astrology Visualizations** - Birth chart wheels using D3.js
3. **Dark/Light Theme Toggle** - User preference
4. **Accessibility Improvements** - ARIA labels, keyboard navigation
5. **Voice Input/Output** - Speech recognition and TTS

---

## AI/ML Integration

1. **Custom AI Model Fine-Tuning** - Train on astrology-specific datasets
2. **Sentiment Analysis** - Personalize responses based on user mood
3. **Recommendation Engine** - Suggest topics based on chart and history
4. **Voice Input/Output** - Natural conversation interface

---

## Social & Community Features

1. **User Profiles (Public)** - Shareable profiles with sun/moon signs
2. **Share Readings** - Generate shareable links
3. **Community Forum** - Discussion boards by topic
4. **Follow System** - Connect with other users

---

## Monetization Features

### 1. Subscription Tiers

**Tier Structure:**
- **Free:** 10 messages/month, basic daily horoscope
- **Premium ($9.99/mo):** Unlimited messages, detailed birth chart, transit notifications
- **Professional ($29.99/mo):** All premium + compatibility readings, expert consultations

### 2. Credit System
- Purchase credits
- Pay-per-reading model

### 3. One-on-One Consultations
- Marketplace for professional astrologers
- Scheduling and payment integration

---

## Technical Debt & Refactoring

1. **Migrate to TypeScript** - Type safety and better DX
2. **Add GraphQL API** - Flexible data fetching
3. **Implement Caching Strategy** - Multi-layer (memory + Redis)
4. **Add Request Validation** - Schema validation with Joi
5. **Improve Error Handling** - Structured error classes
6. **API Documentation** - Swagger/OpenAPI
7. **Database Migrations** - Version-controlled schema changes
8. **Feature Flags** - Gradual rollout capability

---

## Priority Roadmap

### Q1 2026 (Jan-Mar)
- [ ] Increase test coverage to goals
- [ ] Implement user authentication & accounts
- [ ] Add chat history persistence
- [ ] Set up staging environment

### Q2 2026 (Apr-Jun)
- [ ] Advanced astrology features (birth chart, daily horoscope)
- [ ] UI/UX enhancements (sidebar, visualizations)
- [ ] API documentation (Swagger)

### Q3 2026 (Jul-Sep)
- [ ] Subscription system with Stripe
- [ ] Credit-based messaging
- [ ] Social features (sharing, profiles)
- [ ] Migration to TypeScript

### Q4 2026 (Oct-Dec)
- [ ] Community forum
- [ ] One-on-one consultations marketplace
- [ ] Mobile apps (React Native)
- [ ] Scale to 10,000+ users

---

## Next Immediate Steps

1. **Run tests to establish baseline coverage** (this week)
2. **Implement basic authentication** (2 weeks)
3. **Add chat persistence** (1 week)
4. **Deploy to staging** (1 week)
5. **Gather user feedback and iterate**