# Niyati — Functional Specification

## Table of Contents
- [Overview](#overview)
- [Components](#components)
- [Common Concepts](#common-concepts)
- [Authentication Flows](#authentication-flows)
  - [Sign Up](#sign-up)
  - [Sign In](#sign-in)
  - [Refresh Token](#refresh-token)
  - [Password Reset](#password-reset)
  - [Logout](#logout)
- [Profile Management](#profile-management)
- [Identify / Chat Flow](#identify--chat-flow)
- [Credits / Billing / Purchase Flow](#credits--billing--purchase-flow)
- [Webhook & n8n Integration Flows](#webhook--n8n-integration-flows)
- [bff-auth and bff-platform Responsibilities](#bff-auth-and-bff-platform-responsibilities)
- [Worker & Background Jobs](#worker--background-jobs)
- [Health, Monitoring & Observability](#health-monitoring--observability)
- [Failure Modes & Recovery](#failure-modes--recovery)
- [Security Considerations](#security-considerations)
- [Appendix: Typical Request/Response Schemas](#appendix-typical-requestresponse-schemas)


---

<a id="overview"></a>
**Overview**

- **Purpose**: This document describes every user-facing functionality in Niyati, the input expected from the user (UI/API), and the expected responses and behaviors of the main system components: the UI (app), n8n workflows, `bff-auth`, and `bff-platform`. Both success and failure scenarios are defined for each flow.
- **Audience**: Product owners, QA, backend engineers, integration engineers, and support.


---

<a id="components"></a>
**Components**

- **Client / UI (Web / Mobile)**: Presents forms, collects user input and calls platform APIs exposed by `bff-platform` and `bff-auth`.
- **bff-auth**: Authentication focused backend — handles sign-up, sign-in, token issuance/refresh, password resets, and account-level security controls.
- **bff-platform**: Main backend for product features — profile, identify/chat orchestration, credits management, purchases, and proxied calls to third-party services.
- **n8n**: Workflow/orchestration engine used for external integrations, asynchronous flows (emails, webhooks, third-party notifications), and complex business processes.
- **Worker**: Background job processor for longer-running or scheduled tasks (processing analytics, billing reconciliations, retry queues).
- **Database / Migrations**: Persistent storage (Postgres) and migration scripts in `/migrations`.
- **External Services**: SMTP provider, analytics, and third-party identity providers. (No external payment gateway is integrated; payments are accepted via UPI/QR and reconciled manually/automatically as described below.)


---

<a id="common-concepts"></a>
**Common Concepts**

- **Request context**: All requests from UI include a bearer token (where applicable) and a request ID for tracing.
- **Idempotency**: For operations that can be retried (payments, credits deduction), idempotency keys are used to avoid double processing.
- **Error surface**: APIs return structured errors with `code`, `message`, `details` and `requestId` fields. HTTP statuses follow semantic conventions (200, 201, 202, 400, 401, 403, 404, 409, 429, 500).
- **Retries**: Internal calls between components use exponential backoff with jitter. n8n workflows have retry policies configured per node.

---

<a id="authentication-flows"></a>
**Authentication Flows**

For each flow: describe "User action", "Input", "App (UI) expected response", "n8n expected response (if any)", "bff-auth expected response", "bff-platform expected response", success & failure.

<a id="sign-up"></a>
- **Sign Up**
  - User action: Create account via UI (email/password) or OAuth.
  - Input: { email, password, name, optional metadata }
  - App (UI) expected response: success — confirmation UI and prompt to verify email; failure — show field errors.
  - bff-auth: Creates user in auth DB, returns 201 with user id (masked). On email-signup, issues verification token and stores verification record. On duplicate email: 409 conflict with code `USER_EXISTS`.
  - bff-platform: Not involved directly for sign-up, but watches for verification completion events (via webhook/n8n) to enable platform features.
  - Success: `201 Created` + non-sensitive user object + action to verify email.
  - Failure scenarios:
    - Validation error (400): password policy/invalid email.
    - Duplicate email (409): user already exists.
    - Email sending failure: user created but verification email not delivered — bff-auth marks verification pending; n8n retries send based on policy.

<a id="sign-in"></a>
- **Sign In**
  - User action: Provide credentials or sign-in with OAuth/provider.
  - Input: { email, password } or OAuth token.
  - App expected response: success — store access token & refresh token, redirect to dashboard; failure — show invalid credentials errors and lockout messages.
  - bff-auth: Validates credentials; on success returns `200` with `{ accessToken, refreshToken, expiresIn, user }`. On failure, returns `401` with code `INVALID_CREDENTIALS`. After N failed attempts, returns `423 Locked` or `429 Too Many Attempts` depending on policy.
  - bff-platform: On sign-in success may request user profile from platform to hydrate client; expects `200` with profile data.
  - Success: `200 OK` + tokens.
  - Failure scenarios:
    - Wrong credentials (401).
    - Account not verified (403 with `EMAIL_NOT_VERIFIED`).
    - Account locked (423).

<a id="refresh-token"></a>
- **Refresh Token**
  - User action: Transparent token refresh by client when access token expires.
  - Input: { refreshToken }
  - App expected response: new access token (and optionally new refresh token). On failure, client must force re-login.
  - bff-auth: Validates refresh token, returns new tokens (200). If refresh token is expired/revoked returns 401 with `INVALID_REFRESH_TOKEN`.
  - Success: `200` and client continues session.
  - Failure: 401 — client clears tokens and asks for full login.

<a id="password-reset"></a>
- **Password Reset**
  - User action: Request password reset via email; then follow link and set new password.
  - Input: email -> reset request; then { resetToken, newPassword } when setting new password.
  - App expected response: success messages for email sent and password changed; errors for invalid token.
  - n8n: Not involved in generating or validating reset tokens. `bff-auth` generates and validates password reset tokens. If configured, n8n may be used to deliver the reset email after the token is generated, but only as a post-generation delivery mechanism once the user's contact details are persisted.
  - bff-auth: Generates reset token, stores expiry, responds `202 Accepted` for email request. On token-submit, validates token, updates password, invalidates sessions.
  - Success: password updated; all sessions invalidated and optionally notify user.
  - Failure: invalid/expired token (400/404), email send failure (email queued for retry via n8n).

<a id="logout"></a>
- **Logout**
  - User action: Explicit logout.
  - Input: access token (and optionally refresh token) sent to logout endpoint.
  - App expected response: `200 OK`; clear tokens locally.
  - bff-auth: Revokes refresh token; blacklists access token until expiry (if token store used). Returns `200` on success.
  - Failure: network or server error — client retries or force-clear local tokens.

---

<a id="profile-management"></a>
**Profile Management**

- User action: View and update profile fields (name, avatar, preferences).
- Input: `GET /profile`, `PUT /profile` with changed fields.
- App expected response: `200` with profile or `204` on successful update.
- bff-platform: Returns profile on GET with `200`. On update, validates and persists changes then returns `200` plus updated profile. May emit an event (webhook or n8n) when critical fields change.
  - n8n: May be used for optional post-update orchestration (send confirmation emails, sync to external systems) but only after the updated user details have been persisted. n8n is not involved in the atomic validation or persistence step.
- Failure scenarios:
  - Validation errors (400).
  - Unauthorized (401) if token invalid.
  - Sync failure to external systems: platform still returns `200` and records sync-outcome for retries.

---

<a id="identify--chat-flow"></a>
**Identify / Chat Flow**

This is a core interactive feature. Below is the typical flow for identify/chat requests initiated by the user.

- User action: User triggers identification/chat via UI (e.g., uploads a message, image, or starts conversation).
 - Input: { userId, sessionId, inputPayload: { text, media }, meta: { device, locale } }
 - App expected response: immediate optimistic UI response (202 Accepted) with `requestId` for status polling / websocket push.

Note: Login / "Begin Your Journey" behavior

- When the user first lands on the login/onboarding screen they select/enter their `country` (country code) and `phoneNumber` and click **Begin Your Journey**.
- Immediately after the button click the client should attempt to obtain the user's current location (via browser geolocation or IP fallback) and include that `currentLocation` in the identify request.
- The client then calls `POST /api/v1/users/identify` (or equivalent) with `{ phoneNumber, country, currentLocation }`. The platform responds with one of two canonical cases:
  - Returning user (existing): response contains `returning: true` and a complete `user` object. In this case the client MUST display the fetched user details in the UI (profile header, credits, paid status) and must NOT prompt the user to re-enter profile fields. Instead, the client must immediately send a single synthesized, congruent English message to n8n containing the user's profile information (see "n8n messaging" below). The client should not add interactive prompts in the chat for returning users.
  - New user: response contains `returning: false`. The client must proceed with the first-time onboarding flow described in [First-time User Onboarding & Free-tier Rules](#first-time-onboarding) — prompt for `name`, `dateOfBirth`, `timeOfBirth`, and `placeOfBirth` until the profile is complete. New users are by default non-paying and receive starter credits per the onboarding rules.

The above behavior MUST be preserved: the existing first-time onboarding flow remains unchanged and must continue to prompt and collect profile fields for new users without exception.
- bff-platform: Accepts request, validates authorization and quota (credits). If proxied, bff-platform may:
  - Deduct credit synchronously or reserve credit (idempotency key).
  - Record request in DB and enqueue job (to `worker` or push to n8n) for processing.
  - Return `202 Accepted` with `{ requestId, status: queued }` or return `403` if insufficient credits.
  - n8n: Optional — orchestration that runs steps (pre-processing, external calls, post-processing, notifications). n8n workflows are invoked only after the user's details have been extracted from chat and persisted by the UI/platform; they are not used to extract or persist initial user details.

  Returning-user specific behavior

  - For returning users (identified by `returning: true` from the identify endpoint), the client must not open a conversational prompt asking for profile details. Instead:
    - The client displays the persisted profile details immediately in the UI.
    - The client constructs a single, human-readable, congruent English message that summarizes the user's profile (e.g., "I am Ankur, born 1990-05-19 at 09:30 in Mumbai, India.") and sends that message to n8n as the first webhook/chat input for that session. The message should be natural, coherent and use plain English; use `winkNLP` or equivalent client-side helper to normalize and produce a grammatically correct sentence where appropriate.
    - The platform or client must mark the profile as `niyati_profile_sent` for the session to avoid re-sending the full profile on subsequent chat messages in the same session.

  N8N messaging and synthesis

  - For both new and returning users the platform will send an initial message to n8n containing either the full profile (for first-time flows after the user submits profile) or the synthesized profile-sentence (for returning users). This ensures downstream workflows always receive a consistent, human-readable starting message.
  - The synthesized message for returning users must be English-language, concise, and contain the canonical profile fields: `name`, `dateOfBirth`, `timeOfBirth`, `placeOfBirth` and optionally `currentLocation` and `phoneNumber`.
  - The synthesized message should be idempotent and include the `requestId` and `eventId` headers for deduplication.
- Worker: For heavy processing, the worker picks up the queue entry, performs processing (calls third-party ML/AI), stores result and triggers any post-processing workflows (e.g., notify client via websocket or store result for polling).
- Success scenario:
  - Platform processes result, stores it, notifies client via websocket or webhook; UI shows full result.
  - Credits deducted and recorded.
  - Failure scenarios:
  - Insufficient credits: `403 PAYMENT_REQUIRED` and UI shows purchase flow. (Deductions are handled by `POST /users/deduct-credits`; implementation: [be/bff-platform/lib/users.js](be/bff-platform/lib/users.js#L362)).
  - Third-party AI failure: bff-platform or worker marks request as `failed`; returns error to client on polling and may retry based on policy.
  - Partial success: fallback or degraded output is returned; user notified.
  - n8n node failure: Workflow marked failed; platform triggers retry or alerts.

Retries & Idempotency:
- All identify/chat requests use an `idempotencyKey`. If a duplicate arrives, the stored response is returned so user is not charged twice.

<a id="first-time-onboarding"></a>
**First-time User Onboarding & Free-tier Rules**

- Overview: When a first-time user arrives at the login/onboarding screen and begins their journey by entering country and phone number and clicking "Begin Your Journey", the system runs a deterministic onboarding flow that collects required profile fields, persists them, assigns starter credits, and triggers an `n8n` webhook for downstream orchestration.

- Client/UI behavior:
  - After the user provides `country` and `phoneNumber` and clicks `Begin Your Journey`, the client determines the user's current location (via geolocation or IP fallback) and opens a short conversational prompt asking for the remaining details: `name`, `dateOfBirth` (DoB), `timeOfBirth`, and `placeOfBirth`.
  - `phoneNumber` and `currentLocation` are included as part of the user detail set by the client and are displayed back to the user for confirmation.
  - The UI clearly indicates this is the first-time onboarding flow and that the account will initially be an unpaid account with starter credits.

- Validation & UX:
  - The UI validates required fields (name non-empty, DoB in sensible range, timeOfBirth in valid time format, placeOfBirth parsable as a geolocatable place) and prompts for corrections.
  - If geolocation is unavailable, the client requests the user to manually type/place their location.

- Server-side actions (`bff-platform`):
  - On receiving the completed onboarding payload `{ phoneNumber, country, currentLocation, name, dateOfBirth, timeOfBirth, placeOfBirth, isPaid: false }`, `bff-platform`:
    - Creates the user record in the DB and any related profile tables (atomic write). Fields persisted include: `userId`, `phoneNumber`, `country`, `currentLocation`, `name`, `dateOfBirth`, `timeOfBirth`, `placeOfBirth`, `isPaid`, `creditsAvailable`, `createdAt`, and an `onboardingComplete` flag.
    - Assigns exactly `10` starter credits to `creditsAvailable` and marks `isPaid = false`.
    - Emits an audit log entry including `requestId`, `actor: onboarding`, and the persisted `userId`.
    - Sends an HTTP POST to the configured `WEBHOOK_URL` (n8n) with a compact payload `{ event: 'user.onboarded', userId, phoneNumber, country, currentLocation, name, dateOfBirth, timeOfBirth, placeOfBirth, isPaid, creditsAssigned: 10, requestId }` and expects `202`/`200` acknowledgement per webhook contract. The webhook call MUST be idempotent (include an `eventId`) so retries do not duplicate downstream work.

- n8n expectations and response:
  - n8n receives the `user.onboarded` webhook and can run downstream flows (welcome message, analytics, support notification). n8n must only act on the record after the platform has persisted the user.
  - n8n returns a response which the platform relays (or saves) and the UI displays the initial conversational reply (e.g., welcome message / first tips). The platform should accept both synchronous `200` and asynchronous `202` acknowledgements from n8n and record webhook delivery outcome.

- First-time chat privilege rules (free-tier restriction):
  - By default, a first-time (unpaid) user with starter credits is restricted to queries scoped to the current calendar day ("today"). Example allowed queries: "How will my day be today?", "What's the highlight for my day today?".
  - The platform enforces this rule server-side: when a non-paid user submits an identify/chat request, `bff-platform` validates whether the query's temporal scope is `today`. If the query is outside the permitted scope (e.g., "How will my week be?" or "Will I have a good year next year?"), the platform does not proxy the query to n8n or worker but immediately returns a polite client-facing instruction.
  - The UI receives the platform's polite reply and shows: "As a demo (unpaid) user you can ask only about today — try asking "How will my day be today?" — upgrade to a paid plan for broader queries." The message should be phrased courteously and guide the user to the purchase flow.

  Credits threshold notification

  - For both paying and non-paying users, when the credits remaining are less than `6`, the app should proactively include a concise payment prompt in the chat showing the QR code (image) and a message explaining that INR 500 adds credits and how to submit payment confirmation. The prompt must include the payment amount suggestion (INR 500) and instructions to submit UPI ID and the 12-digit transaction ID.
  - The display rule for QR remains: show the QR image once per session unless the user dismisses it.

- Credits handling during free-tier usage:
  - Starter credits (10) are recorded and available for deductions by the normal `POST /users/deduct-credits` flow. Each allowed identify/chat request that is processed consumes credits per the existing deduction rules.
  - If a non-paid user exhausts starter credits, `bff-platform` returns `403 PAYMENT_REQUIRED` and the client shows the QR/UPI purchase instructions (as documented in the Credits section).

- Edge cases & retries:
  - If the webhook to n8n fails transiently, the platform persists the user's onboarding record and marks webhook delivery as `pending`; a retry worker will re-send the webhook according to backoff policy.
  - Duplicate onboarding submissions (same `phoneNumber` + idempotency key) must be detected and resolved: the platform should return the existing `userId` and not create duplicate user rows.

- Security & privacy:
  - Sensitive fields (DoB, timeOfBirth, placeOfBirth) are treated as PII and stored encrypted at rest and logged only to the extent necessary for audit. Access to these fields is restricted to authorized services and workflows.

This onboarding flow is considered part of the Identify/Chat experience because it seeds the profile data used for personalized responses and credits enforcement.

**OpenAPI-style Examples: Onboarding & Webhook Payloads**

Below are compact, example request/response payloads you can use when wiring the client, `bff-platform`, and n8n. These are illustrative only (simplified shapes) and map to the behavior described above.

- POST /api/v1/users/identify

  Request:

  {
    "phoneNumber": "+91-9876543210"
  }

  Success Response (new user):

  {
    "status": "ok",
    "data": {
      "returning": false,
      "user": null,
      "config": {
        "credits_monthly_free": 10,
        "credits_horoscope_cost": 2,
        "credits_premium_cost": 4
      }
    }
  }

- POST /api/v1/users/profile  (client saves completed onboarding profile)

  Request (body sent by client when profile complete):

  {
    "phoneNumber": "+91-9876543210",
    "name": "Ankur Sharma",
    "dateOfBirth": "1990-05-19",
    "timeOfBirth": "09:30",
    "placeOfBirth": "Mumbai, India",
    "consentGiven": true,
    "last_login_location": "Mumbai"
  }

  Success Response (server persisted with defaults):

  {
    "status": "ok",
    "data": {
      "user": {
        "id": "uuid-...",
        "phone_number": "+91-9876543210",
        "credits": 10,
        "is_paid": false,
        "total_paid_amount": 0
      }
    }
  }

- Webhook: POST to `N8N_WEBHOOK_URL` after onboarding (client or platform may send)

  Headers:
  - `Content-Type: application/json`
  - `x-request-id: req_<uuid>`

  Body (event-style payload the platform/client sends to n8n):

  {
    "event": "user.onboarded",
    "eventId": "evt_<uuid>",
    "requestId": "req_<uuid>",
    "userId": "uuid-...",
    "phoneNumber": "+91-9876543210",
    "country": "IN",
    "currentLocation": "Mumbai, India",
    "name": "Ankur Sharma",
    "dateOfBirth": "1990-05-19",
    "timeOfBirth": "09:30",
    "placeOfBirth": "Mumbai, India",
    "isPaid": false,
    "creditsAssigned": 10,
    "metadata": { "source": "client.onboarding" }
  }

  Expected n8n acknowledgement (synchronous):

  HTTP/1.1 200 OK
  Body:
  {
    "status": "ok",
    "message": "received",
    "deliveryId": "del_<uuid>"
  }

  Or asynchronous acknowledgement:

  HTTP/1.1 202 Accepted
  Body:
  {
    "status": "accepted",
    "deliveryId": "del_<uuid>"
  }

- Example of n8n -> client response that the UI will display (body returned by webhook call):

  {
    "output": "Welcome Ankur — your profile looks complete. Here's today's short horoscope: You will feel a gentle clarity today.",
    "requestId": "req_<uuid>",
    "eventId": "evt_<uuid>"
  }

Notes:
- The webhook sender MUST include an `eventId` to allow idempotent processing by n8n. The platform persists the user record before emitting the webhook so n8n can safely read or reference the persisted user.
- The client marks `niyati_profile_sent` after a successful `POST /users/profile` so duplicate profile saves are avoided and the message sent to n8n is the fuller profile on first send.


---

<a id="credits--billing--purchase-flow"></a>
**Credits / Billing / Purchase Flow (QR / UPI-based)**

- Overview: Niyati does not use an integrated payment gateway. Users make payments by scanning a QR code (`./ui/public/payment/PayQR.jpeg`) and completing a UPI transfer. The system supports initiating the payment flow, collecting user-provided payment confirmation data, validating and reconciling payments, and updating user credits.

- Triggering the QR flow:
  - Condition: The app displays the QR-code-based payment prompt when the user's available credits are less than or equal to 10 and the app has already sent the user's details to n8n.
  - Implementation detail: The client renders the image `./ui/public/payment/PayQR.jpeg` in the chat response as part of the payment prompt message.
  - Before showing the QR, the app POSTs a `payment_initiation` event to n8n (or calls an internal endpoint that triggers an n8n workflow) containing `{ userId, userContact, currentCredits, requestId }`. n8n records the initiation and optionally notifies support/ops.

- Payment instructions shown to the user (in chat):
  - Pay at least INR 500 via UPI using the displayed QR.
  - Payments must be made in multiples of INR 500 (500, 1000, 1500, ...).
  - For every INR 10 paid, the user receives 1 credit (credits = amount / 10). Example: INR 500 => 50 credits.
  - After paying, submit the following details through the app: Alphanumeric UPI ID (payer's UPI ID), 12-digit UTR (transaction ID), and the paid amount.

- User submission flow:
  - Input: `{ phoneNumber, upiId, upiTxnId (12-digit UTR), amount }` sent to the `bff-platform` endpoint `POST /users/add-credits` (see [be/bff-platform/lib/users.js](be/bff-platform/lib/users.js#L455)).
  - bff-platform validates:
    - `amountPaid` is >= 500 and `amountPaid % 500 === 0`.
    - `utr` is 12 digits and not previously recorded (duplicate detection).
    - `upiId` matches a permissive alphanumeric pattern.
  - On validation success: compute `creditsToAdd = Math.floor(amountPaid / 10)`, atomically add credits to user's account, persist the payment record `{ userId, utr, upiId, amountPaid, creditsAdded, status: 'confirmed', recordedAt }`, and emit an audit/billing event.
  - bff-platform returns `200 OK` with updated credit balance and transaction record.
  - For server-side deductions (after successful identify/chat requests), the platform exposes `POST /users/deduct-credits` (see [be/bff-platform/lib/users.js](be/bff-platform/lib/users.js#L362)).
  - bff-platform triggers an n8n workflow (optional) to send a confirmation message/receipt to the user and notify support/ops for reconciliation.

- Failure and validation responses:
  - `400 Bad Request` — amount below minimum (message `MINIMUM_AMOUNT_500`) or amount not a multiple of 500 (`INVALID_AMOUNT_MULTIPLE`).
  - `409 Conflict` — duplicate `utr` detected (message `DUPLICATE_TRANSACTION`).
  - `422 Unprocessable Entity` — malformed input (invalid UPI id format or UTR not 12 digits).
  - `500` — transient server/DB error; the client should surface a friendly message and allow re-submission. Server will persist a pending payment record for later reconciliation if needed.

- Reconciliation and anti-fraud checks:
  - Duplicate UTRs are rejected to avoid double-crediting.
  - Support/admin interfaces must allow manual reconciliation where a valid payment exists but automated validation failed (e.g., mismatched UPI ID); such actions must be audited.
  - A periodic worker job scans pending/unreconciled payment records and attempts to reconcile with bank/UPI reports (if available) or escalates to ops.

- Edge cases:
  - If a valid payment is made but the user fails to submit confirmation details, support will reconcile manually when contacted.
  - If the same UTR is submitted for multiple users, support must manually investigate and resolve (the system will reject duplicates by default).

- Security & audit:
  - All submitted payment confirmations and reconciliation actions are logged with `requestId`, `userId`, `actor` and timestamp for audit.
  - Credits updates are atomic and idempotent keyed by `utr`.

---

---

<a id="webhook--n8n-integration-flows"></a>
**Webhook & n8n Integration Flows**

 - Pattern: `bff-platform` or `bff-auth` emits or consumes webhooks to/from n8n. n8n workflows MUST only be invoked after the platform has a persisted record of the user details they operate on (i.e., after the UI has saved/exposed the extracted user details).
 - For each webhook:
  - Sender expectations: deliver HTTP `200` quickly; if downstream processing is asynchronous, sender marks webhook accepted (202) and includes a `deliveryId`.
  - n8n expectations: Acknowledge receipt; nodes perform tasks and retry based on node config.
  - Failure: If n8n fails to acknowledge (non-2xx), the sender retries according to backoff policy; repeated failures raise alerts and store an error in DB for manual inspection.

Common n8n responsibilities:
- Send emails (verification, receipts, alerts)
- Trigger long-running orchestration (multi-step processes)
- Provide visibility into business processes for non-developers

Idempotency and Reconciliation:
- Webhooks must carry `eventId` to allow deduplication. The platform stores event receipts and ignores duplicates.

---

<a id="bff-auth-and-bff-platform-responsibilities"></a>
**bff-auth and bff-platform Responsibilities**

- **bff-auth** (Authentication boundary):
  - User lifecycle (create, verify, reset, revoke)
  - Token issuance and revocation
  - Multi-factor policy enforcement and brute-force protection
  - Audit logs for authentication events

- **bff-platform** (Business logic boundary):
  - Feature APIs (identify, chat, profile, billing)
  - Authorization checks (role, subscription, org membership)
  - Quota and credits management
  - Orchestration with workers and n8n
  - Expose health, metrics, and operational endpoints

Inter-component contracts:
- All requests are JSON over HTTPS.
- Authentication-related endpoints live in `bff-auth`; platform endpoints expect a validated user id from bff-auth (e.g., forwarded via JWT or introspection).
- Error payload conventions are shared.

---

<a id="worker--background-jobs"></a>
**Worker & Background Jobs**

- Responsibilities:
  - Process queued identify/chat tasks
  - Billing reconciliations and retry of failed payments
  - Sending batched analytics and external syncs

- Failure handling:
  - Use retry with backoff; after max retries, mark job `failed` and create an incident record.

---

<a id="health-monitoring--observability"></a>
**Health, Monitoring & Observability**

- Health endpoints:
  - `/health` or `/healthz` should return 200 when app and DB are healthy. CORS and preflight should be handled for dev environment where needed.
- Metrics and logs:
  - All components must emit structured logs including `requestId`, `userId` (where available), and `event`.
  - Integrate with monitoring/alerting for error rate, latency, and payment failures.

---

<a id="failure-modes--recovery"></a>
**Failure Modes & Recovery**

- Common failures and responses:
  - Network partitions: gracefully return 5xx to clients, queue non-critical operations for retry.
  - Payment gateway outages: refuse new purchases with user-friendly message; queue reconcilable attempts; notify ops.
  - SMTP issues: emails queued in n8n and retried; critical flows give user manual fallback (show token in UI only in dev).
  - DB failover: read-only mode where possible, show maintenance message.

Recovery playbook:
- Record incident, capture request traces, run automated reconciliation (billing worker), re-run failed n8n workflows, and notify affected users.

---

<a id="security-considerations"></a>
**Security Considerations**

- Use short-lived access tokens and securely stored refresh tokens.
- Protect endpoints with rate-limiting and WAF rules.
- Encrypt PII at rest and in transit.
- Use strong password policies and optional MFA flows via `bff-auth`.
- Audit logs for critical operations (payments, profile email changes, security settings).

---

<a id="appendix-typical-requestresponse-schemas"></a>
**Appendix: Typical Request/Response Schemas**

- Error format:

```
{
  "code": "INVALID_CREDENTIALS",
  "message": "The credentials provided are invalid",
  "details": { ... },
  "requestId": "req_abc123"
}
```

- Token response (bff-auth):

```
{
  "accessToken": "ey...",
  "refreshToken": "rt...",
  "expiresIn": 3600,
  "user": { "id": "user_123", "email": "x@domain" }
}
```

- Identify request payload (example):

```
{
  "idempotencyKey": "idem-uuid",
  "userId": "user_123",
  "sessionId": "sess_abc",
  "input": { "text": "...", "media": [...] },
  "meta": { "locale": "en-US" }
}
```

---

If you want, I can:

- Convert this into a more formal, per-endpoint table of request/response examples (OpenAPI-like).
- Extract exact endpoint paths and request shapes from the codebase and update the document.
- Add a responsibilities matrix mapping exact files and modules in `bff-auth` and `bff-platform` to sections of this doc.

---

Document created at repository root as `NIYATI_FUNCTIONAL_SPEC.md`.
