# Project To-Do List

## 🚀 Immediate Priorities

### 1. User Authentication (Backend)
- [ ] **Social Login**: Implement OAuth callbacks for Google & Instagram in `bff-auth` service.
  - *Context*: UI buttons are implemented but require backend endpoints (`/api/v1/auth/google`, `/api/v1/auth/instagram`).
  - *Requirement*: Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, etc. in `.env`.
 - [x] **Profile Sync**: Create endpoint to sync client-side `localStorage` profile data to Postgres `users` table upon authentication. (moved to `bff-platform`)
- [ ] **Session Management**: Implement secure HTTP-only cookie sessions or JWT handling.

### 2. Chat Persistence
- [ ] We will not be persisting chat history for now. Instead we are looking to implement it in a way that the chats for a user are stored in RAG database through the LLM wrapped in n8n workflow.

### 3. Monetization & Features
- [ ] **Numerology**: Implement Pythagorean numerology calculator (Function + UI component).
- [ ] **Payments**: We cannot integrate Stripe or Razorpay for now. So, once the user details have been discovered through the chat, we will show a QR code to the user for payment. The user can scan the QR code and make the payment. After payment, the user should key in the payment trasanction number that needs to be verified in the background and once validated we allow the user to continue the chat.

## 🛠 Technical Debt & Polish
- [ ] **E2E Testing**: Expand Playwright tests to cover full "Login -> Extraction -> Report" flow.

## 📝 Notes
- **Architecture**: The project currently uses `niyati-bff-auth` (Postgres) and `niyati-bff-platform` (Astrology logic). Frontend is `ui-service` (Vite/React).
- **Testing**: Run specific unit tests via `npm run test:unit` in `ui/`.
- **Secrets**: Production secrets are managed via Docker Swarm/Compose secrets (e.g., `/run/secrets/postgres_password`).
