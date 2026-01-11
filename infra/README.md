# Infra publishing

This directory contains the docker-compose overlays and publishing workflow for production images.

Publishing base infra images

We publish three base images to GHCR with a `production` tag:
- `niyati-postgres` (from `postgres:15-alpine`)
- `niyati-redis` (from `redis:7-alpine`)
- `niyati-caddy` (from `caddy:2-alpine`)

This project uses `ghcr.io/vatsaaa/*` as the registry by default. To publish images using the automated workflow:

1. Create repository or environment secrets with the required values (do NOT commit secrets). Recommended secrets:
   - `GHCR_PAT` &mdash; Personal Access Token with `packages:write` to publish images to GHCR
   - `POSTGRES_PASSWORD`, `DATABASE_URL`, `ACCESS_TOKEN_SECRET`, etc. for runtime (store in an Actions environment named `prod`)
   
   Prefer storing highly-sensitive production secrets in a protected Actions environment named `prod` (see below) rather than as plain repository secrets.
2. Push an annotated tag matching `infra-v*` (e.g. `infra-v1`). The `publish-infra-images` workflow (configured to target the `prod` environment) will run and:
   - Pull the upstream images, tag them as `ghcr.io/vatsaaa/niyati-<service>:production`, and push them to GHCR.
   - Record the pushed image digests in `infra/IMAGE_DIGESTS.txt` and open a PR to update the repository with the digest file.

Security notes

- Do not commit secrets to the repository. Use a protected Actions environment named `prod` or an external secrets manager.
- The `publish-infra-images` workflow targets the `prod` environment; configure environment protection and required reviewers in the GitHub repository settings so only authorized users can approve deployments that use `prod` secrets.
- The workflow runs only on tags to limit accidental publishing.
- After images are pushed, pin by digest in `infra/docker-compose.prod.yml` if you want immutability.

How to add `prod` environment secrets (manual steps):

1. Go to the repository Settings → Environments → New environment → Name it `prod`.
2. Add the needed secrets (e.g. `GHCR_PAT`, `ACCESS_TOKEN_SECRET`, DB credentials) to the `prod` environment.
3. Configure protection rules (required reviewers) on the `prod` environment so that deployments using those secrets require approval.

Note: I attempted to create the `prod` environment via the GitHub CLI, but environment protection settings usually require repository admin privileges and manual verification. Please follow the UI steps above if needed.

Manual publish commands

```bash
# example: push postgres image to GHCR (manual)
docker pull postgres:15-alpine
docker tag postgres:15-alpine ghcr.io/vatsaaa/niyati-postgres:production
docker push ghcr.io/vatsaaa/niyati-postgres:production
```

Updating `docker-compose.prod.yml`

After merging the PR that contains `infra/IMAGE_DIGESTS.txt`, update `infra/docker-compose.prod.yml` to reference the digest form, e.g.:

```
image: ghcr.io/vatsaaa/niyati-postgres@sha256:<digest>
```

This pins the image to an immutable digest.
