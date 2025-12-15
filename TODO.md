# Project To-Do List

## 🚀 Immediate Priorities

### 1. User Authentication (Backend)
- [ ] **Social Login**: Implement OAuth callbacks for Google & Instagram in `bff-auth` service.
  - *Context*: UI buttons are implemented but require backend endpoints (`/api/v1/auth/google`, `/api/v1/auth/instagram`).
  - *Requirement*: Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, etc. in `.env`.
 

### 2. Chat Persistence
- [ ] We will not be persisting chat history for now. Instead we are looking to implement it in a way that the chats for a user are stored in RAG database through the LLM wrapped in n8n workflow.

### 3. Monetization & Features
- [ ] **Numerology**: Implement Pythagorean numerology calculator (Function + UI component).
- [ ] **Payments**: We cannot integrate Stripe or Razorpay for now. So, once the user details have been discovered through the chat, we will show a QR code to the user for payment. The user can scan the QR code and make the payment. After payment, the user should key in the payment trasanction number that needs to be verified in the background and once validated we allow the user to continue the chat.

## 📝 Notes
- **Architecture**: The project currently uses `niyati-bff-auth` (Postgres) and `niyati-bff-platform` (Astrology logic). Frontend is `ui-service` (Vite/React).
- **Secrets**: Production secrets are managed via Docker Swarm/Compose secrets (e.g., `/run/secrets/postgres_password`).


1. After chat message is sent, and response is received - cursor should end up in the chat typing box
2. Shift+enter is sending the message, instead it should allow for typing in next sentence
3. For returning user no need to show "Hello! I am Niyati. What is on your mind today?"
4. In database we need to also store if the user is paid user or not, so that we can allow paid users to access premium features.
5. Identify if the user is logging in from the same location or a different location. 
- First message to user should be something like, "Hi Anu, welcome back! How is the weather in <location> today?"
- If the location is different from last login location, then first message could be like "Hi Anu, today you are logging in from <new location>, how is it different from <old location>?"