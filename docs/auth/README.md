# Auth Developer Guide

This document explains local setup and env vars for the authentication features.

Env vars (examples):

- `DATABASE_URL` - Postgres connection string used by the BFF.
- `ACCESS_TOKEN_SECRET` - Secret for signing access JWTs.
- `REFRESH_TOKEN_TTL_MS` - TTL for refresh tokens in milliseconds (default ~30 days).
- `BCRYPT_ROUNDS` - Cost factor for bcrypt (default 10).
- `PASSWORD_RESET_TTL_MS` - TTL for password reset tokens (default 1 hour).
- `FRONTEND_BASE` - Frontend base URL for password reset links (e.g. `http://localhost:5173`).
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_PORT`, `SMTP_SECURE` - Optional SMTP settings for sending email.

OAuth provider env var examples for `google` (replace `GOOGLE` with provider name):

- `OAUTH_GOOGLE_CLIENT_ID`
- `OAUTH_GOOGLE_CLIENT_SECRET`
- `OAUTH_GOOGLE_AUTHORIZE_URL`
- `OAUTH_GOOGLE_TOKEN_URL`
- `OAUTH_GOOGLE_USERINFO_URL`
- `OAUTH_GOOGLE_SCOPES` (space separated)

Running locally

1. Apply migrations to your Postgres DB (example):

```bash
psql -d <your-db> -f be/bff/migrations/20251206_create_users.up.sql
psql -d <your-db> -f be/bff/migrations/20251206_create_oauth_accounts.up.sql
psql -d <your-db> -f be/bff/migrations/20251206_create_refresh_tokens.up.sql
psql -d <your-db> -f be/bff/migrations/20251206_create_password_resets.up.sql
```

2. Start BFF with env vars set:

```bash
cd be/bff
DATABASE_URL='postgres://user:pass@localhost/niyati' ACCESS_TOKEN_SECRET='replace-me' node src/index.js
```

3. Use the API endpoints:

- `POST /api/v1/auth/register` - { email, password, name }
- `POST /api/v1/auth/login` - { email, password }
- `POST /api/v1/auth/token` - { refresh_token }
- `POST /api/v1/auth/logout` - { refresh_token }
- `POST /api/v1/auth/request-password-reset` - { email }
- `POST /api/v1/auth/reset-password` - { token, new_password }

Notes
- The code stores refresh tokens hashed (SHA-256) and raw tokens are only returned at creation.
- For production, set secure cookie behavior and rotate secrets regularly.
