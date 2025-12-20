# Niyati — System Specification

Last updated: 2025-12-17

Purpose
-------
This document describes the overall system architecture, data model, runtime flows, API surface, configuration, and operational details for the Niyati application. It is written for engineers who will develop, review, test, or operate the system.

Table of contents
- High-level architecture
- Key design goals
- Data model (tables & important columns)
- API surface and semantics
- Frontend runtime flows (login, returning user, chat, credits)
- Credits accounting and monetization
- Feedback mechanism (thumbs up/down)
- Service Worker and caching behavior
- Configuration, local caching, and environment
- Operational runbooks and commands
- Testing, troubleshooting and QA
- Migration notes and rollback guidance

High-level architecture
-----------------------
- UI (`ui-service`): Vite + React single page application. Handles login, chat UI, profile editing, payment flows, client-side extraction of profile fields, local caching of config and session ids, and service worker for offline support.
- Backend (`be/bff-platform`): Node.js/Express service exposing user/profile/credits APIs and app configuration. Implements credit accounting, profile upsert, config caching, and credit deduction/add endpoints.
- Auth (`be/bff-auth`): Authentication service providing OAuth endpoints and session management.
- Database: PostgreSQL storing `users`, `app_config`, `message_feedback`, migrations.
- n8n: External workflow/orchestration used to generate personalized messages via LLMs and RAG workflows. UI calls a configured `N8N_WEBHOOK_URL` with system context.
- Worker: Optional background job runner for tasks such as payment verification, RAG indexing, or scheduled jobs.
- Deployment: Docker Compose for local/dev with prod overrides; production runs use container images and secrets.

Design goals
------------
- Deterministic credits accounting with atomic DB updates.
- Configurable business parameters (credits, costs, thresholds) stored in DB to avoid code deploys for simple pricing changes.
- Minimal PII shared with external services (n8n/LLM): summarize as system context when possible and only send necessary fields.
- Robust offline UX with clear fallbacks and a service worker that handles navigation preload and caching.
- Clear audit trail for payments, credits, and feedback.

Data model
----------
Primary tables (names shown as used in code):

1) `users`
- `id` SERIAL PRIMARY KEY
- `phone_number` TEXT — canonical phone string (stored as e.g. `+91-9899162012`)
- `name` TEXT
- `date_of_birth` TEXT (or DATE)
- `time_of_birth` TEXT
- `place_of_birth` TEXT
- `lat`, `lon` (NUMERIC) — birth place coords (nullable)
- `timezone` TEXT
- `consent_given` BOOLEAN
- `credits` INTEGER — current credit balance
- `credits_last_reset` TIMESTAMP — when monthly allowance was set
- `total_paid_amount` INTEGER — INR amount cumulatively paid
- `last_login_location` TEXT — human readable location from geocoding
- `last_login_lat`, `last_login_lon` (NUMERIC)
- `created_at`, `updated_at` TIMESTAMPS

Notes:
- Phone lookups are normalized by digits only (SQL uses `regexp_replace(phone_number, '[^0-9]', '', 'g')` to compare). This allows `+91-...` and raw numbers to match.
- Upserts use `ON CONFLICT (phone_number) DO UPDATE` with `COALESCE(EXCLUDED.col, users.col)` to avoid overwriting data with nulls.

2) `app_config`
- `key` TEXT PRIMARY KEY
- `value` TEXT
- `description` TEXT
- `updated_at` TIMESTAMP

Purpose: make business parameters configurable: `credits_monthly_free`, `credits_horoscope_cost`, `credits_premium_cost`, `credits_low_threshold`, `payment_amount_inr`, `credits_per_10_inr`.

3) `message_feedback`
- `id` SERIAL PRIMARY KEY
- `phone_number` VARCHAR(30) NOT NULL
- `message_id` VARCHAR(128) NOT NULL — client-generated id for bot message (timestamp/uuid)
- `feedback` VARCHAR(10) NOT NULL CHECK (feedback IN ('up','down'))
- `user_message` TEXT
- `bot_message` TEXT
- `created_at` TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
- Unique constraint: (`phone_number`, `message_id`) to avoid duplicate votes

API surface
-----------
All API endpoints are versioned under `/api/v1`.

Users
- `POST /api/v1/users/identify`
  - Body: `{ "phoneNumber": "+91-xxxxxxxxxx" }`
  - Behaviour: lookup by normalized digits; perform monthly credits reset if `credits_last_reset` is not current month; return `returning` boolean, `user` object (including credits/last_login_location), and `config` object containing the current app config values.

- `POST /api/v1/users/profile`
  - Body: accepts partial or full profile payload, including `phoneNumber`, `name`, `dateOfBirth`, `timeOfBirth`, `placeOfBirth`, `lat`, `lon`, `timezone`, `consentGiven`, `last_login_location`, etc.
  - Behaviour: upsert into `users` table and return canonical user row. Used by both first-time profile submission and subsequent updates (e.g., saving last-login location).

- `POST /api/v1/users/deduct-credits`
  - Body: `{ "phoneNumber": "+91-...", "amount": <int> }`
  - Behaviour: atomically deduct `amount` credits (SQL uses `GREATEST(credits - $1, 0)`), `RETURNING credits`. Designed to be called after a successful bot response. Returns new balance.

- `POST /api/v1/users/add-credits`
  - Body: `{ "phoneNumber": "+91-...", "amount": <INR amount> }`
  - Behaviour: convert INR to credits using `credits_per_10_inr` from `app_config` and increment `credits` and `total_paid_amount`.

- `GET /api/v1/users/config`
  - Behaviour: returns parsed `app_config` values. Backend caches parsed config in-memory for a short TTL (e.g., 5 minutes) for performance.

Feedback
- `POST /api/v1/feedback`
  - Body: `{ phoneNumber, messageId, feedback: 'up'|'down', userMessage, botMessage }`
  - Behaviour: insert into `message_feedback`. If the same user already submitted feedback for the same `messageId`, update the existing row.

Backend behaviour and internal rules
-----------------------------------
- Config caching: `getAppConfig(db)` loads `app_config` rows into an object and caches in memory with TTL to avoid frequent DB reads.
- Monthly reset: `/users/identify` checks `credits_last_reset` month/year; if different reset `credits` to `credits_monthly_free` and update `credits_last_reset = now()`.
- Credit deductions: done via `POST /users/deduct-credits` using a single SQL UPDATE + RETURNING to ensure atomicity and avoid race conditions.
- Phone normalization: queries use regex replacement to strip non-digit characters when matching.

Frontend runtime flows
---------------------
This section explains step-by-step what the UI does in typical interactions.

1) Login flow (new or returning user)
- User enters phone and consents.
- `LoginForm.jsx` calls `POST /api/v1/users/identify` with formatted phone (e.g. `+91-9899...`).
- Backend returns `{ returning, user, config }`.
  - `useLogin.handleLogin(phone, country, identifiedUser, serverConfig)` is invoked.
  - `serverConfig` is stored in `localStorage` key `niyati_credits_config` for use by `useChat`.
  - `useLogin` fetches current location via `GET /api/v1/geocode/current-location` (server-side geocoding helper). It then computes `newLocation` for display and compares to `identifiedUser.last_login_location` using case-insensitive compare: `lastLoginLocation.toLowerCase() !== newLocation.toLowerCase()`.
  - If different, `useLogin` builds a system-context instructional message with a `locationChanged` flag and sends it to `n8n` to generate a personalized greeting. The returned greeting is shown as the first bot message.
  - Immediately after, `useLogin` persists the `last_login_location` by calling `POST /api/v1/users/profile` (so next login will compare against this value). This ensures the DB has the latest login location even if the user leaves after seeing the greeting.

2) Chat flow (sending user messages and receiving bot answers)
- User types a message and submits.
- UI creates a local user message and optionally extracts profile fields from the message (`extractProfileFields`) to auto-fill the profile.
- On first chat message (if profile not already sent), the client calls `POST /api/v1/users/profile` to persist the profile and marks `niyati_profile_sent` in `localStorage` to avoid re-sending.
- The client determines `queryCost` using `getQueryCreditCost()` which reads `niyati_credits_config` and decides between `credits_horoscope_cost` and `credits_premium_cost`.
- The client sends request to `n8n` via `callWebhook()` with either full-profile context or just the user message depending on whether the profile is being sent for the first time.
- On receiving a successful bot response, the client calls `POST /api/v1/users/deduct-credits` with `{ phoneNumber, amount: queryCost }`. The server returns the updated credits, and the UI updates `profile.user_credits` and displays a transient low-credit warning or QR as needed.

Realtime UX points (explicit behaviors)
- Credits are displayed prominently in the profile header (top of the chat screen). The header reads `Credits: N` and uses color coding (amber normal, red when low).
- Credits are deducted only after a successful bot response (server acknowledgement of the reply); the UI updates immediately after the `/users/deduct-credits` call returns the new balance.
- If credits are insufficient (client-side check), the UI will not call the webhook; it prompts the user to pay and shows the QR (single show controlled by `niyati_payment_qr_shown` in `localStorage`).

Credits & payments
------------------
- Configurable parameters (via `app_config`):
  - `credits_monthly_free` (default 10)
  - `credits_horoscope_cost` (default 2)
  - `credits_premium_cost` (default 4)
  - `credits_low_threshold` (default 4)
  - `payment_amount_inr` (default 500)
  - `credits_per_10_inr` (default 1)
- Payment workflow (user-facing): display a QR for `payment_amount_inr`. After paying, user sends UPI ID and transaction ID in chat. The system records this as `user_pendingPayment` in the profile. An admin or worker verifies the payment, and then calls `POST /users/add-credits` to credit the account (INR -> credits conversion using `credits_per_10_inr`).

Feedback mechanism (thumbs up / thumbs down)
-------------------------------------------
Goal: allow users to rate bot answers to gather training / quality metrics.

Client-side:
- Render small thumbs-up and thumbs-down buttons for each bot message.
- When the user taps one, optimistically toggle the UI feedback state and fire `POST /api/v1/feedback` with `{ phoneNumber, messageId, feedback, userMessage, botMessage }`.
- If the request fails, show a non-intrusive toast and roll back the optimistic UI state.

Backend-side:
- `POST /api/v1/feedback` validates inputs and upserts into `message_feedback`. Enforce uniqueness on `(phone_number, message_id)` so subsequent toggles update the existing row.
- Aggregate feedback can be exposed via admin APIs or exported for ML training/RAG re-ranking.

Service Worker and caching
--------------------------
- File: `ui/public/sw.js` implements:
  - Precaching of core assets (`/`, `/index.html`, `/offline.html`, icons, `manifest.json`).
  - Navigation handling: network-first with navigation preload if enabled; preloaded response is used only when `preloadResponse.ok` and wrapped in try/catch to avoid rejected preload promises.
  - API caching: timed network-first strategy with a 10s timeout and caching for successful GETs. Telemetry and sensitive endpoints are excluded from caching.
  - Image caching and dynamic cache with size limits and LRU trimming.

Edge cases and SW fixes:
- If navigation preload is canceled (browser offline simulation or cancellation), the code now catches the rejection and falls back to fetching the network or cache.
- Whenever `VERSION` changes in the SW, caches are rotated to force clients to fetch new assets.

Configuration & local caching
-----------------------------
LocalStorage keys used by the UI:
- `niyati_credits_config` — JSON representation of config returned by `/users/identify`.
- `niyati_x_request_id` — session-level UUID used to tag webhook and trace calls.
- `niyati_profile_sent` — boolean flag indicating profile was persisted.
- `niyati_payment_qr_shown` — boolean to prevent repeatedly showing QR to the same session.

Environment variables (backend)
- `PG_CONNECTION`/`PG_*` — Postgres connection
- `N8N_WEBHOOK_URL` — primary n8n webhook URL
- `N8N_WEBHOOK_FALLBACK_URL` — optional fallback webhook
- `PORT` — service port

Operational runbooks
--------------------
Rebuild & restart UI and backend:
```bash
cd /path/to/niyati
docker compose build --no-cache bff-platform ui-service
docker compose up -d bff-platform ui-service
```

Rebuild only UI:
```bash
docker compose build --no-cache ui-service
docker compose up -d ui-service
```

Database migration example to add `message_feedback`:
```sql
CREATE TABLE IF NOT EXISTS message_feedback (
  id SERIAL PRIMARY KEY,
  phone_number VARCHAR(30) NOT NULL,
  message_id VARCHAR(128) NOT NULL,
  feedback VARCHAR(10) NOT NULL CHECK (feedback IN ('up','down')),
  user_message TEXT,
  bot_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(phone_number, message_id)
);
CREATE INDEX idx_message_feedback_phone ON message_feedback(phone_number);
```

Testing & QA checklist
----------------------
Unit & integration:
- Run UI tests: `cd ui && npm test`.
- Run backend unit tests where present.

Manual flows:
- New user sign-up: verify DB `users` entry created, `credits` set to `credits_monthly_free`.
- Returning user identify: verify `identify` returns `user` and `config` and that UI stores `niyati_credits_config`.
- Location-aware greeting: log the n8n request payload includes `locationChanged` and `last_login_location`.
- Credits deduction: ask a horoscope and verify `/users/deduct-credits` is called and `users.credits` decremented accordingly, UI updates immediately.
- Low-credit QR: when credits <= `credits_low_threshold`, verify QR shown once per session and stored in `niyati_payment_qr_shown`.
- Feedback: tap thumbs up/down and verify `message_feedback` row is created/updated.

Troubleshooting common errors
-----------------------------
- "Failed to convert value to 'Response'" from SW navigation preload:
  - Cause: preloadResponse promise resolved to an error or non-OK response or was cancelled.
  - Fix: ensure `event.preloadResponse` is awaited inside try/catch and check `.ok` before returning. The codebase includes this fix in `ui/public/sw.js`.

- "t is not a function" client error after deploy:
  - Cause: stale cached JS bundles (old filenames) or SW serving old bundle.
  - Fix: hard refresh (Cmd+Shift+R), or Application → Service Workers → Unregister, or clear site data. Ensure SW `VERSION` bump on deploy to invalidate caches.

Security & privacy notes
------------------------
- Always obtain `consent_given` before storing or sending profile data to external services.
- Minimize PII sent to n8n/LLMs; prefer structured system context that omits unnecessary details.
- Store secrets in Docker secrets or environment variables and never commit them to the repo.

Backlog / next improvements
--------------------------
1. Rate-limiting middleware by phone number (free: 5/day, paid: 50/day) to prevent abuse.
2. Admin endpoints for reconciling payments and marking `users` as credited without manual DB edits.
3. RAG indexer & retriever integration with n8n to include prior user queries as context.
4. Analytics dashboards to surface high-level KPIs: daily active users, credits consumed, feedback ratios.

Contact & references
--------------------
- Key files:
  - Backend users logic: `be/bff-platform/lib/users.js`
  - Frontend login & greeting: `ui/src/hooks/useLogin.js`
  - Frontend chat & credits: `ui/src/hooks/useChat.js`
  - Service Worker: `ui/public/sw.js`

End of spec
