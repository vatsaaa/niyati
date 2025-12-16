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
- [ ] **Premium Features**: Define and implement premium features for paid users (e.g., generate kundali, advanced astrology reports, upay, numerology etc.).

## 📝 Notes
- **Architecture**: The project currently uses `niyati-bff-auth` (Postgres) and `niyati-bff-platform` (Astrology logic). Frontend is `ui-service` (Vite/React).
- **Secrets**: Production secrets are managed via Docker Swarm/Compose secrets (e.g., `/run/secrets/postgres_password`).

1. If user asks anything beyond their own future astrology, numerology etc. related questions, politely refuse to answer such questions. For questions beyond the purpose"I am sorry, I am designed to answer only astrology, numerology and upay related questions. Please ask me something related to these topics."
2. Add "Edit/Save" icon just below the "Logout/Reset" icon. User clicks it to edit displayed user details, by double clicking cells. How will data be saved to DB?
3. Returning user sees unwanted message "Hi <user name>, welcome back!". Instead a message should be constructed based on the user details fetched from DB and sent to N8N.
From there we let N8N to respond with a personalised message, based on previous interactions which would be saved in a RAG database along with the user details as the RAG key. 
If the returning user had asked about love life last time, the message could be "Hi <user name>! I see you are logging in from <current location>. How is the weather there? And I recall your queries about love life, hope things are looking sunny." or for user asking about career, the message could be "Hi <user name>, the weather in <current location> is supporting? I hope your focus on career is showing healthy shoots?". This will require storing some context about previous interactions in RAG database. This will as well require calling weather API to get current location weather details.
4. Instead of storing in DB a returning user is paid subscriber or not we should store how many credits the user has. 
Free users (first time or returning) get 10 credits per month. Free users can ask questions about the current day's horoscope (i.e. horosope of the day) which consumes 2 credits each.
In addition to the 10 monthly credits, paid users get 1 credit for every INR 10/- paid. Paid users can ask questions about current day's horoscope (2 credits), and further questions about future concerns they have e.g. career, health, job, love marriage etc. Each such question consumes 4 credits.
When a question has been answered the remaining credits should be updated in the database. When credits reach zero user should be informed "You have exhausted your credits, consider upgrading to paid subscription to continue asking questions."
We would like to display the remaining credits in the UI somewhere prominently, if there is reasonable space on the UI.
5. Identify if the user is logging in from the same location or a different location. 
- First message to user should include location and some banter e.g., "Hi Anu, welcome back! How is the weather in <location> today?"
- If current location is different from last login location, then first message could be like "Hi Anu, today you are logging in from <new location>, how is it different from <old location>?"
Current location can be fetched from the browser using JS geolocation API. Last login location can be stored in the user details table in DB.
Current location should be saved in the user details table in DB on every login as the last login location for the next time.
6. Implement rate limiting to prevent abuse of the chatbot service. Limit free users to 5 queries per day and paid users to 50 queries per day.
7. Implement a feedback mechanism where users give a thumbs up or thumbs down for the answers they receive.
8. Add support for multiple languages, starting with Hindi.
9. Implement RAG (Retrieval-Augmented Generation) to improve the accuracy of responses by integrating a knowledge base. Whatever user details we collect should be stored in RAG database as the key along with previous user queries and responses as context to improve future responses.
10. Need a few tools implemented in n8n workflows to support astrology calculations, e.g., age calculator with simple logic: (today - day of birth) / 365.25 (or something similar).
11. Add analytics to track user interactions, popular questions, and usage patterns.