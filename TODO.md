# Work breakdown

## Phone / Login (small, fast wins)


- [✅] 1.1 Format phone for display (5-15m, Low)
	- Implement `formatSubscriberNumber(fullPhone)` to strip the country code and return the subscriber number.
	- Add unit tests for formatting.


- [✅] 1.2 Show flag in header (10-30m, Low)
	- Read selected country from `localStorage`/state and render `flagEmoji` in header next to number.


- [✅] 1.3 Enforce per-country length on input (15-45m, Low)
	- Use `selectedCountry.phoneLength` to set input `maxLength`, placeholder and validation.


- [✅] 1.4 Input sanitization & helper (10-20m, Low)
	- Strip non-digits as user types; show remaining digits count.

## Profile & Progressive Discovery (small UI+storage tasks)

 - [ ] 2.1 Small profile form component (30-90m, Medium)
 	- Collect Name, DoB, Place of Birth, Current Location from the chat with the user.
 
 	- Option A (Chat-first / Hybrid - Recommended):
 		- Behavior: prefer low-friction chat extraction first, confirm via short chat prompts, and provide a lightweight Profile form/modal for review and editing.
 		- Flow:
 			1. Extract candidate fields from chat messages using simple heuristics (regex + date parsing) or light NLU when the user mentions them.
 			2. Save extracted values as `tentative` in-memory and to `localStorage` under `niyati_profile` with a `verified` flag per field (default false).
 			3. Immediately send a confirmation chat message for ambiguous/parsed fields, e.g. "I detected your DoB as 1990-11-12 — is that correct?" — on confirmation mark field `verified=true`.
 			4. Provide a small `Profile` button/modal where users can review and edit all fields (this is the explicit form for task 2.1). The modal shows which fields are verified and which are tentative.
 			5. Require explicit consent (toggle/checkbox) in the modal before using fields for astrology computations; store `consentGiven: boolean` in `niyati_profile`.
 		- Data shape (suggested `localStorage` key `niyati_profile`):
 			```
 			{
 			  name: "...",
 			  dob: "YYYY-MM-DD",
 			  placeOfBirth: "City, Country",
 			  currentLocation: "...",
 			  verified: { name: true, dob: false, placeOfBirth: false },
 			  consentGiven: false,
 			}
 			```
 		- Validation & UX notes:
 			- Use a date-picker / ISO date normalization to avoid ambiguous input.
 			- For place-of-birth, accept free text initially; mark as `needs-geocode` if later lat/lon is required by the astrology provider.
 			- Do not auto-use unverified fields for API calls until `consentGiven` is true.
 		- Acceptance criteria for this subtask:
 			- Chat extraction stores tentative values and prompts the user to confirm.
 			- Profile modal shows extracted values, allows editing, and persists verified values to `localStorage`.
 			- Consent toggle is visible and persisted.


- [✅] 2.2 Persist profile fields (10-30m, Low)
	- Save to `localStorage` under `niyati_profile` and load on start.

- [✅] 2.3 Display compact profile summary (20-45m, Low)
	- Show Name and masked phone/DoB/place in header or side panel.

- [ ] 2.4 Edit flow & immediate update (20-60m, Medium)
	- Allow editing profile with optimistic update of UI + save to `localStorage`

## Astrology API integration (server/client safe steps)

- [ ] 4.1 Choose provider & test account (30-120m, Medium)
	- Evaluate suggested providers ([FreeAstrologyAPI](https://freeastrologyapi.com/), [VedAstro](https://github.com/VedAstro/VedAstro), [Astrologer-API](https://github.com/g-battaglia/Astrologer-API)). Create a free/test account or read docs and capture example requests/responses.

 [✅] 4.2 Add API config & env vars (10-20m, Low)
 	- Add `VITE_ASTRO_API_URL` and `VITE_ASTRO_API_KEY` (or similar) to local `.env` instructions in README. Keep keys out of source control.
 [✅] 4.3 Implement astrology API wrapper (30-90m, Medium)
 	- Create `src/lib/astrology.js` (or `.ts`) with functions to call the provider, normalize responses, handle errors, and map to a consistent internal format.
 [✅] 4.4 Fetch astrology data when DoB+Place available (15-60m, Medium)
 	- Trigger the wrapper when profile has DoB and Place. Persist a cached copy in `localStorage` keyed by profile (hash) to avoid duplicate calls.
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

## Final QA, tests & docs

- [ ] 6.1 Add unit & integration tests (60-180m, Medium)
	- Tests for formatting, numerology, API wrapper; a smoke integration test for login -> profile -> premium unlock -> chat enabled.

- [ ] 6.2 Dev docs & run steps (15-45m, Low)
	- Update `README.md` with env key instructions, how to run dev server and configure astrology keys.


- [✅] 6.3 Countries.json caching policy (20-60m, Low)
	- Implement stale-while-revalidate: read cached countries from `localStorage`, fetch `/countries.json` and update state if changed.

## Consent & privacy note (10-20m, Low)
- [✅] 7.1 On the first screen, when the user enters their phone number, display a small note about data usage and privacy. Example text: "Your data is stored locally on our device and used only to provide personalized astrological insights. We do not share your information with third parties." Include all kind of indemnity language. Ensure this is clear but unobtrusive.

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

- [✅] 9.1 When the user provides place of birth look it up and find the country automatically. Use a geocoding API or a local database of cities to countries. Modify the place of birth field to store both city and country for accurate astrology calculations.

### Details & implementation plan

	 - Goal: given a user's free-text place-of-birth (e.g. "Pune" or "Pune, Maharashtra"), resolve the city and its country (ISO2 code), and where available lat/lng. Store a canonical structured `placeOfBirth` in the profile so astrology calculations can use a deterministic location.

	 - Recommended providers & tradeoffs
		 - OpenCage (recommended): aggregates OSM and other sources, good international coverage, simple REST API, reasonable free tier. Requires API key; good privacy/price balance.
		 - Google Geocoding API: best disambiguation and address components, paid by usage; excellent accuracy but higher cost and Google TOS/privacy considerations.
		 - Nominatim (OpenStreetMap): free and privacy-friendly; public instance rate-limited and not recommended for production without self-hosting.
		 - Local DB (GeoNames / worldcities CSV): no external calls, best privacy, deterministically fast. May miss obscure places and requires fuzzy matching on the client or server.

	 - Recommendation: implement a hybrid approach
		 1. Local DB fuzzy-match (client-side or server-side) as first pass for privacy & speed.
		 2. If local match is low-confidence or ambiguous, call a server-side proxy that queries OpenCage (or Google if you prefer accuracy) and returns suggestions. Keep API keys on the server.

	 - Why a server-side proxy
		 - Keeps API keys secret (do not embed keys in client bundles).
		 - Centralized caching, rate-limiting, and retry/backoff control.
		 - Easier to fallback to local DB or return structured errors to the client so UI can prompt for manual selection.

	 - Canonical storage shape (example to add under `niyati_user_profile.placeOfBirth`)

		 ```json
		 placeOfBirth: {
			 raw: "Pune, Maharashtra",        // original user input
			 city: "Pune",                    // parsed/normalized city (or empty)
			 country: "India",                // full country name
			 countryCode: "IN",               // ISO 3166-1 alpha-2
			 lat: 18.5204,                      // optional
			 lng: 73.8567,                      // optional
			 geocodeSource: "localDB|openCage|google", // resolution source
			 verified: false,                   // user confirmed correctness
			 needsGeocode: false,               // true when unresolved/ambiguous
			 updatedAt: "2025-11-23T12:34:56Z"
		 }
		 ```

	 - Client UX & flow
		 1. Save `placeOfBirth.raw` immediately when user types or the chat extractor suggests a place.
		 2. If user has not given consent for external calls, set `needsGeocode=true` and surface a compact manual country selector or an editable suggestion list (do NOT call third-party geocoders).</li>
		 3. If consent is present: run a local fuzzy lookup (Fuse.js against a small `worldcities` subset) to find high-confidence matches. If confidence >= threshold (e.g., 0.85), accept the match and populate `city`, `country`, `countryCode`, set `geocodeSource='localDB'`, `needsGeocode=false`.
		 4. If local lookup is ambiguous or no good match: call the server proxy `/api/geocode?place=...` which queries OpenCage/Google. The server returns either a single unambiguous place or `ambiguous` with a short list of suggestions. Show suggestions to the user for explicit selection.
		 5. Always allow manual override (user can pick country from drop-down). Only mark `verified=true` when user explicitly confirms.

	 - Failure handling (detailed)
		 - Failure types: network timeout, provider 4xx/5xx, 429 rate-limit, no results, ambiguous results.
		 - Client-side strategy:
			 - Debounce input (300–800ms) before attempting lookups.
			 - Show immediate UI fallback: a manual country selector and optionally a short list of local suggestions (if local DB exists).
			 - If provider returns error or 429: show a gentle inline message "Auto-detect failed — please select your country manually" and set `needsGeocode=true`.
			 - Retry: attempt one quick retry for transient network errors (500ms -> 1500ms), but do not block the UI or force the user to wait.
		 - Server-side strategy:
			 - Cache geocode results (keyed by normalized query) with TTL (e.g., 30 days) to avoid repeated provider cost and rate-limits.
			 - On provider 429/5xx, return a structured error to client instructing fallback.
			 - Do not log raw PII unless the user has consented; if logging is necessary for debugging, strip or hash identifying fields.

	 - Caching & offline options
		 - Client: cache resolved place objects in `localStorage` keyed by normalized `raw` input so repeated lookups are instant.
		 - Server: use Redis or in-memory cache with TTL; implement stale-while-revalidate to return cached immediately and refresh in background.
		 - For strict privacy/offline mode: ship a compact `worldcities` subset and use `Fuse.js` client-side to match user input without any external calls.

	 - API response shapes (server -> client)
		 - success unambiguous:
			 ```json
			 { "status": "ok", "source": "openCage", "place": { /* city/country/countryCode/lat/lng */ } }
			 ```
		 - ambiguous:
			 ```json
			 { "status": "ambiguous", "suggestions": [ {"display":"Pune, Maharashtra, India","city":"Pune","country":"India","countryCode":"IN","lat":..,"lng":..}, ... ] }
			 ```
		 - error:
			 ```json
			 { "status": "error", "reason": "rate_limited|provider_error|network" }
			 ```

	 - Acceptance criteria
		 - The client saves `placeOfBirth.raw` immediately and later stores a structured place (city + countryCode) when resolved.
		 - If geocoding is successful, `needsGeocode=false` and the record includes `countryCode` (ISO2) and optional lat/lng.
		 - If geocoding fails or is blocked (no consent), `needsGeocode=true` and UI offers a manual country selector.
		 - User can confirm the resolved place, which sets `verified=true` before it is used for astrology computations.

	 - Incremental implementation plan
		 1. Add the `placeOfBirth` canonical shape to the profile object and persist it to `localStorage` (store `raw` immediately).
		 2. Add a small client-side local DB (compressed `worldcities` subset) and Fuse.js fuzzy-match; attempt local resolution first.
		 3. Create a simple server proxy `/api/geocode` that calls OpenCage (using `OPENCAGE_KEY` env var), returns structured responses, and caches results.
		 4. Wire the client to call `/api/geocode` only when local DB fails or returns ambiguous results; present suggestions and manual selector fallbacks.
		 5. Update `PRIVACY.md` to mention geocoding and require consent for external calls; ensure consent gating is enforced on the client before calling the proxy.

	 - Notes
		 - Keep the UX lightweight: do not block the user; default to manual selection when in doubt.
		 - Prefer storing `countryCode` (ISO2) in downstream calls and only include lat/lng where required by external astrology providers.
		 - If you want, I can now draft the server-side proxy example (Node/Express + OpenCage) and a small client-side Fuse.js snippet and component for selection. 



TODO:
- User said "I was born on 11th day of November 2005" the date was not resolved correctly. Add better date parsing / NLU to extract DoB from chat messages








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