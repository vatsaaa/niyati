# bff-pthru

Tiny pass-through BFF that forwards chat requests to n8n and returns the response.

Environment variables (see `.env.example`):

- `N8N_WEBHOOK_URL` (required): full URL to POST chat requests to.
- `N8N_TOKEN` (optional): forwarded to n8n as `X-N8N-TOKEN`.
- `PORT` (optional): port to listen on, default `3003`.
- `BFF_REQUEST_TIMEOUT_MS` (optional): request timeout in ms (default `60000`).

Endpoints:

- `GET /health` — simple health check
- `POST /api/v1/chat` — forwards body to `N8N_WEBHOOK_URL`, returns n8n response

Docker / Compose

You can run the service standalone with Docker Compose from the `be/bff-pthru` folder:

```bash
docker compose up --build
```

The included `docker-compose.yml` forwards `VITE_N8N_WEBHOOK_URL` into the container as `N8N_WEBHOOK_URL`, and passes `N8N_TOKEN` through. This makes it straightforward to use the same environment variables your UI uses.

CI

A GitHub Actions workflow `/.github/workflows/bff-pthru-ci.yml` runs the unit/integration tests when files under `be/bff-pthru` change.

Discovery / UI feature flagging

The UI can check `GET /health` on the service to decide whether to route messages via `bff-pthru` or send them directly to n8n. The health response contains the following fields (JSON):

- `status`: `ok` when healthy
- `service`: service name `bff-pthru`
- `version`: package version (or `0.0.0`)
- `supportsChat`: boolean indicating the service supports chat proxying
- `n8nConfigured`: boolean indicating whether `N8N_WEBHOOK_URL` is configured
- `uptimeSeconds`, `timestamp`

Example:

```json
{
	"status": "ok",
	"service": "bff-pthru",
	"version": "0.1.0",
	"supportsChat": true,
	"n8nConfigured": true,
	"uptimeSeconds": 42,
	"timestamp": "2025-12-10T12:34:56.789Z"
}
```

The UI can use `n8nConfigured` to decide whether the runtime flag should be set to route chats through `bff-pthru`.

Developer tip — permissive CORS for local/dev

If you're developing the UI in the browser and calling `/health` from the frontend, add a permissive CORS setting in development. You can enable this quickly by setting `HEALTH_CORS_ORIGINS='*'` (or `ALL`) when starting `bff-pthru` (for local/dev only).

Examples:

- Export and start locally:

```bash
export HEALTH_CORS_ORIGINS='*'
export N8N_WEBHOOK_URL='http://host.docker.internal:5678/webhook/<id>'
npm start
```

- Start with docker compose (from `be/bff-pthru`):

```bash
# be/bff-pthru/.env
VITE_N8N_WEBHOOK_URL=https://your-n8n.example/webhook/chat
N8N_TOKEN=your-token-if-needed
HEALTH_CORS_ORIGINS='*'

docker compose up --build
```

Important: do NOT set `HEALTH_CORS_ORIGINS='*'` in production. Use an allow-list of UI origins (comma-separated) in staging/production, e.g. `HEALTH_CORS_ORIGINS=https://app.example.com,https://staging.app.example.com`.


