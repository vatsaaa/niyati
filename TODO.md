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
	- Allow editing profile with optimistic update of UI + save to `localStorage`.

- [ ] 2.5 Progressive chat prompts for missing fields (30-90m, Medium)
	- Small chat messages that gently request missing DoB/place; when user replies, validate and persist.

## Payment (safe, testable steps)

- Overview: gate premium astrological computations behind a paid flow while keeping the chat UI active and non-blocking. Support India-friendly providers (Razorpay, PayU) and multiple payment methods (UPI, cards, wallets).

- [ ] 3.1 Decide pricing model & gating rules (design) (1-2 days)

	- Choose when to require payment (e.g., after profile completion + X free previews, or per-request). Document free vs premium boundaries.
	- Decide single-price vs subscription vs credits model. Decide currency support (INR, or multi-currency if you plan global payments).

- [ ] 3.2 Provider selection & test accounts (Razorpay / PayU) (0.5-1 day)

	- Create sandbox/test accounts for chosen providers (Razorpay and/or PayU). Note required documents for production onboarding.
	- Obtain test keys and webhook secrets for local testing.

- [ ] 3.3 Server endpoints (implementation) (1-3 days)

	- POST `/api/payments/create-order` — create provider order/session.
		- Input: { phone, amountInPaise, currency: 'INR', metadata }
		- Output: { orderId, keyId, amount } (provider-specific)

	- POST `/api/payments/verify` — optional quick-verify endpoint called by client after Checkout completes (server validates provider signature or queries provider API).

	- POST `/api/payments/webhook` — webhook handler to receive and verify provider events (`payment.captured` / `payment.succeeded`), mark payment persisted and set user paid flag.

	- Persist minimal payment records: payments { id, phone, provider, providerOrderId, providerPaymentId, amount, currency, status, rawEvent, createdAt }

- [ ] 3.4 Client-side queue & gating (implementation) (1-2 days)

	- Add `pendingPremiumRequests` queue in `localStorage` and in-memory mirroring.
	- When user attempts a premium request and is unpaid: enqueue the request, show a non-blocking payment banner/modal explaining the charge, and offer Pay Now / Continue (limited preview).
	- On Pay Now: call `/api/payments/create-order`, then initialize provider Checkout (Razorpay or PayU) in a modal; keep chat state intact while checkout runs.
	- After checkout success: client posts provider tokens to `/api/payments/verify` or waits for webhook confirmation and polls server status; once server confirms payment, flush queued premium requests.

- [ ] 3.5 Provider-specific notes (Razorpay / PayU)

	- Razorpay (recommended for India): server creates Orders via Razorpay Orders API; client loads Razorpay Checkout with `key_id` + `order_id`. Verify signature server-side and use webhooks for async confirmations (UPI might be asynchronous).
	- PayU: similar flow — server creates transaction/order and client uses PayU's checkout. Read docs for signature verification and webhook events; handle asynchronous UPI statuses.

- [ ] 3.6 Security, webhooks & verification (must-have)

	- Verify webhook signatures using provider secrets; never trust client-reported payment success alone.
	- Use idempotency keys and store raw events for audit and reconciliation.
	- Minimize PII on server; store phone only with consent. Consider storing a hashed phone if you want to avoid cleartext PII in DB.

- [ ] 3.7 UX & failure handling

	- Do not block the chat during payment; allow non-premium interactions.
	- Show spinner/confirmation while verifying payment; if webhooks are delayed, poll server `/api/payments/status?orderId=` with short backoff.
	- On network/provider error: keep queued requests, allow retry, and present clear instructions.

- [ ] 3.8 Testing & QA (0.5–1 day)

	- Use provider sandbox keys and test cards/UPI ids. Use ngrok or provider CLI to forward webhooks to local server.
	- Test happy path, canceled checkout, failed payments, delayed webhooks (simulate async UPI), and idempotent retry behavior.

- [ ] 3.9 Acceptance criteria

	- Payment modal/banner shows when user initiates a premium request.
	- User can pay without leaving the chat (checkout modal or in-page flow), chat remains intact.
	- Server receives and verifies provider webhook and marks user `paid`.
	- Client detects paid status (via redirect + polling or webhook confirmation) and automatically submits queued premium requests.
	- All payment secrets live only on server; webhooks verified.

- Notes & next steps

	- Implementation can start with Razorpay sandbox (or PayU if you prefer). I can scaffold a minimal Node/Express payment proxy with `/create-order`, `/verify`, and `/webhook` and a small in-memory payments store for local testing.
	- When you're ready I will add the server scaffold and implement client wiring to queue/flush premium requests and to open provider Checkout in a modal.

 - [ ] 3.10 Product plans & credit mapping (implementation)

	 - Offer the following purchasable plans in the UI:
		 - `plan_5` : 5 premium questions — INR 300 (amountInPaise: 30000)
		 - `plan_10`: 10 premium questions — INR 500 (amountInPaise: 50000)

	 - Server-side mapping: when creating an order include `planId` and `credits` in order metadata. Example metadata: `{ phone, planId: 'plan_5', credits: 5 }`.

	 - API contract additions:
		 - POST `/api/payments/create-order` request body should accept `planId` (one of `plan_5`, `plan_10`) instead of raw amount in normal usage. Server resolves the amount and credits for the plan.
		 - Payment verification / webhook handlers must credit the user's account by the `credits` value from metadata on confirmed payment.

	 - Client UI tasks:
		 - Add two purchase buttons/links in the Profile or Payments area: "Buy 5 questions — ₹300" and "Buy 10 questions — ₹500".
		 - When clicked, call `/api/payments/create-order` with `{ phone, planId }`, then start checkout with returned order/session.
		 - After server confirms payment, increment `creditsRemaining` for the user locally and persist to server if consented.

	 - Credit accounting & usage:
		 - Maintain server-side `userCredits` table: `{ phone, creditsRemaining, lastUpdated }` and update atomically on webhook processing.
		 - Client should mirror credits in `localStorage` (`niyati_credits_remaining`) for quick UI updates but always validate server-side when performing a premium request.
		 - When user sends a premium question and `creditsRemaining > 0`, decrement locally and persist to server via `POST /api/credits/consume` (or attach consume to the premium request flow). If the server rejects (race/double-consume), reconcile by fetching current credits.

	 - Tests & QA additions:
		 - Add an end-to-end test scenario: buy `plan_5`, webhook triggers, client polls and receives `creditsRemaining=5`, then send 5 premium questions and ensure credits decrement to 0 and requests succeed; any further premium question prompts purchase flow.
		 - Test race conditions: two simultaneous consume attempts should not allow credits to go negative (server-side atomic decrement required).


## Astrology API integration (server/client safe steps)

- [ ] 4.1 Choose provider & test account (30-120m, Medium)
	- Evaluate suggested providers ([FreeAstrologyAPI](https://freeastrologyapi.com/), [VedAstro](https://github.com/VedAstro/VedAstro), [Astrologer-API](https://github.com/g-battaglia/Astrologer-API)). Create a free/test account or read docs and capture example requests/responses.

- [ ] 4.2 Add API config & env vars (10-20m, Low)
	- Add `VITE_ASTRO_API_URL` and `VITE_ASTRO_API_KEY` (or similar) to local `.env` instructions in README. Keep keys out of source control.

- [ ] 4.3 Implement astrology API wrapper (30-90m, Medium)
	- Create `src/lib/astrology.js` (or `.ts`) with functions to call the provider, normalize responses, handle errors, and map to a consistent internal format.

- [ ] 4.4 Fetch astrology data when DoB+Place available (15-60m, Medium)
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
	- Tests for formatting, numerology, API wrapper; a smoke integration test for login -> profile -> payment unlock -> chat enabled.

- [ ] 6.2 Dev docs & run steps (15-45m, Low)
	- Update `README.md` with env key instructions, how to run dev server and configure payment/astrology keys.


- [✅] 6.3 Countries.json caching policy (20-60m, Low)
	- Implement stale-while-revalidate: read cached countries from `localStorage`, fetch `/countries.json` and update state if changed.

## Consent & privacy note (10-20m, Low)
- [✅] 7.1 On the first screen, when the user enters their phone number, display a small note about data usage and privacy. Example text: "Your data is stored locally on our device and used only to provide personalized astrological insights. We do not share your information with third parties." Include all kind of indemnity language. Ensure this is clear but unobtrusive.

## Backend / Persisting Users (security-sensitive)

- [ ] 8.1 Persist first-login details to MongoDB (40-120m, Medium)
		- Description: When a user logs in for the first time, the client should persist whatever verified/tentative profile data we have (phone, country, name, dob, placeOfBirth, verified flags and explicit consent) into a server-side `users` collection in MongoDB. This allows recognizing returning users (avoid re-asking) and provides a central place for optional server-side features (caching astrology results, payment state, etc.). Do NOT store PII in the DB without explicit consent; the server must enforce consent checks.
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

- [ ] 9.1 When the user provides place of birth look it up and find the country automatically. Use a geocoding API or a local database of cities to countries. Modify the place of birth field to store both city and country for accurate astrology calculations.

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

		## Payment Flow — Updated (2025-11-23)

		This section consolidates the payment/gating design and provides concrete API contracts, plan mappings, security notes, and test guidance. Use this as the single source-of-truth for implementing payments and client-side gating.

		- **Recommended provider (India):** Razorpay (recommended) — good sandbox, easy Checkout integration, UPI + cards, clear server-side verification. PayU is an alternative if you prefer.

		- **Product plans (fixed mapping):**
			- `plan_5`  — 5 premium questions — INR 300  (amountInPaise: 30000)
			- `plan_10` — 10 premium questions — INR 500 (amountInPaise: 50000)

		- **High-level flow:**
			1. Client requests order for a `planId` via `POST /api/payments/create-order` with `{ phone, planId }`.
			2. Server creates provider Order (Razorpay Orders API) and returns `{ orderId, keyId, amount, planId, metadata }` to client.
			3. Client opens Checkout (provider modal) with returned data. Chat UI remains active while Checkout runs.
			4. On Checkout completion, client calls `POST /api/payments/verify` (optional quick-verify) and server verifies signature or waits for webhook.
			5. Server receives provider webhook (e.g., `payment.captured`), validates signature, credits user `credits` (from order metadata) and persists payment record.
			6. Client polls `/api/payments/status?orderId=` (or receives push) and, once confirmed, flushes the queued premium requests.

		- **Server API contracts (recommended):**
			- `POST /api/payments/create-order`
				- Input: `{ phone: string, planId: 'plan_5'|'plan_10', metadata?: object }`
				- Behavior: server resolves plan -> amount/credits, creates provider Order (idempotent by client-supplied idempotency key if provided). Returns `{ orderId, keyId, amount, currency, planId, credits }`.

			- `POST /api/payments/verify`
				- Input: provider-specific response the client receives after checkout (e.g., `razorpay_payment_id`, `razorpay_order_id`, `razorpay_signature`).
				- Behavior: server validates signature using provider secret and returns `{ status: 'ok'|'failed', orderId, creditsGranted?: number }`.

			- `POST /api/payments/webhook`
				- Behavior: provider webhook handler. Validate signature, persist raw event and parsed payment record `{ id, phone?, provider, providerOrderId, providerPaymentId, amount, currency, status }`, credit user `credits` based on order metadata, and respond 200. Use idempotency guards to avoid double-crediting.

			- `GET /api/payments/status?orderId=`
				- Returns current payment status and credited `creditsRemaining` for the phone/order.

		- **Server-side data model (minimal):**
			- `payments` table/collection: `{ id, phone, provider, providerOrderId, providerPaymentId, planId, credits, amount, currency, status, rawEvent, createdAt, updatedAt }`.
			- `userCredits` table: `{ phone, creditsRemaining, lastUpdated }` — updated atomically on webhook processing.

		- **Client-side gating & queue:**
			- Maintain `pendingPremiumRequests` (in-memory + mirrored to `localStorage`) that stores pending premium question objects.
			- When user attempts a premium action but lacks credits: enqueue the request and show a non-blocking purchase banner/modal with `Buy 5 questions — ₹300` and `Buy 10 questions — ₹500`.
			- On purchase: call `POST /api/payments/create-order` with `{ phone, planId }`, open provider Checkout with returned `orderId` + `keyId`, then call `POST /api/payments/verify` (best-effort) and/or poll `/api/payments/status` until server confirms credit. Once credits are confirmed, flush queued requests.
			- Always treat server confirmations as source-of-truth. Client-local `niyati_credits_remaining` is for quick UX updates only and must be revalidated server-side when performing premium requests.

		- **Security & best practices:**
			- Never trust client-reported payment success. Validate signatures server-side and use webhooks for final confirmation.
			- Keep provider keys/secrets on server only (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`).
			- Use idempotency keys when creating orders to avoid duplicate orders on retry.
			- Minimize PII in server logs. Store `phone` only if user consent was provided. Consider hashing phone in logs for diagnostics.

		- **Edge cases & asynchronous behaviour:**
			- UPI payments may be asynchronous — do not block UX. Use webhooks + polling. Show a friendly message: "Payment processing — we'll confirm shortly".
			- If webhooks are delayed, poll `/api/payments/status?orderId=` with exponential backoff for a short window (e.g., 30s). Keep queued requests until server confirms.
			- On provider 4xx/5xx/429: surface error to user, keep queued requests, allow retry or alternate payment method.

		- **Testing & QA:**
			- Use Razorpay sandbox keys and test instruments. Use ngrok or local tunnel to forward webhooks to local dev server.
			- Test scenarios:
				- Buy `plan_5` happy path — webhook arrives, credits = 5, queued requests processed.
				- Cancelled checkout — no credits, queued requests remain.
				- Delayed webhook (simulate) — client polls and succeeds once webhook processed.
				- Race: two simultaneous consume attempts should not permit credits to go negative — server atomic decrement required.

		- **Acceptance criteria:**
			- Payment modal/banner displays when a premium request is initiated without sufficient credits.
			- User can complete payment without leaving the chat; chat remains intact.
			- Server verifies provider signature and webhook, credits user `credits` accordingly.
			- Client detects confirmed credits and automatically flushes queued premium requests.

		- **Implementation increment (minimal scaffold):**
			1. Server: implement `/api/payments/create-order`, `/api/payments/verify`, `/api/payments/webhook` with in-memory store for local testing and configurable provider adapter for Razorpay.
			2. Client: `pendingPremiumRequests` queue, purchase modal for `plan_5`/`plan_10`, call to `/api/payments/create-order`, open Checkout with returned data, and poll `/api/payments/status` until credit confirmed.
			3. Tests: simulate webhook events and ensure credits are granted and queued requests are flushed.

		If you'd like, I can scaffold the Node/Express server with Razorpay sandbox wiring and a minimal client integration for the chat UI next.



Replace the mocked astrology endpoint with a real provider adapter (if you have a provider/key)

This is a local prototype: everything is in-memory. For production replace in-memory maps with a DB (Postgres/Mongo) and Redis for caching/atomic counters.

Astrology is a mocked endpoint — I can add a provider adapter and caching when you pick a provider and provide API keys

Wire the UI Checkout flow (client-side) to use these endpoints
Add a small integration test and a client-side example wiring to the ui that uses /api/geocode to resolve placeOfBirth

Add a small script to simulate webhooks and exercise the full flow locally

Add Razorpay sandbox keys & webhook secret to be/bff/.env and test a full checkout flow.

Wire the frontend to:
Call /api/payments/create-order to get orderId and keyId.

Open Razorpay Checkout (if providerOrderId / keyId returned).

After checkout, call /api/payments/verify (best-effort) and poll /api/payments/status.

Replace in-memory orders/credits with persistent DB or Redis for production-grade reliability.


TODO:
When "Logout / Reset" button of app is clicked, should we also clear the localStorage keys?