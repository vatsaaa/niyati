## Contributing

When changing frontend dependencies in `apps/ui/package.json`, maintain a deterministic lockfile so CI Docker builds succeed.

- After adding/removing/updating dependencies in `apps/ui`, run:

```bash
cd apps/ui
npm install --package-lock-only
git add package-lock.json
git commit -m "chore(ui): update package-lock.json"
```

- This generates or updates `apps/ui/package-lock.json` which is required by CI (the UI Dockerfile uses `npm ci`).

Additional tip: If you prefer a single root lockfile for workspace-managed installs, discuss with the team before changing the Dockerfile behaviour.
