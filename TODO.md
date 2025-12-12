# Project To-Do List

## 🚀 Immediate Priorities

### 1. User Authentication (Backend)
- [ ] **Social Login**: Implement OAuth callbacks for Google & Instagram in `bff-auth` service.
  - *Context*: UI buttons are implemented but require backend endpoints (`/api/v1/auth/google`, `/api/v1/auth/instagram`).
  - *Requirement*: Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, etc. in `.env`.
- [ ] **Profile Sync**: Create endpoint to sync client-side `localStorage` profile data to Postgres `users` table upon authentication.
- [ ] **Session Management**: Implement secure HTTP-only cookie sessions or JWT handling.

### 2. Chat Persistence
- [ ] **Database Schema**: Design and run migrations for `conversations` and `messages` tables in Postgres.
- [ ] **API**: Add endpoints to fetch (`GET /chat/history`) and append (`POST /chat/message`) history.
- [ ] **UI Integration**: Restore previous chat context upon user login.

### 3. Monetization & Features
- [ ] **Numerology**: Implement Pythagorean numerology calculator (Function + UI component).
- [ ] **Payments**: Integrate Stripe/Razorpay for premium report generation.

## 🛠 Technical Debt & Polish
- [ ] **E2E Testing**: Expand Playwright tests to cover full "Login -> Extraction -> Report" flow.
- [ ] **Error Handling**: Standardize error responses (4xx/5xx) across `bff-auth` and `bff-platform`.
- [ ] **Types**: Add JSDoc type definitions to critical utility functions for better IDE support.

## 📝 Notes
- **Architecture**: The project currently uses `niyati-bff-auth` (Postgres) and `niyati-bff-platform` (Astrology logic). Frontend is `ui-service` (Vite/React).
- **Testing**: Run specific unit tests via `npm run test:unit` in `ui/`.
- **Secrets**: Production secrets are managed via Docker Swarm/Compose secrets (e.g., `/run/secrets/postgres_password`).
